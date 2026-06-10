import { Device } from 'mediasoup-client';
import type { types as MSTypes } from 'mediasoup-client';
import type { Socket } from '../socketClient';
import type { Role } from '../types';
import { FOV_PROFESSOR, FOV_PROFESSOR_CONE_DEG, VOICE_SURVIVOR_HEAR_RADIUS } from '../constants';

const CONE_HALF_RAD = (FOV_PROFESSOR_CONE_DEG / 2) * (Math.PI / 180);

interface ConsumerEntry {
  socketId:  string;
  transport: MSTypes.Transport;
  consumer:  MSTypes.Consumer;
  audio:     HTMLAudioElement;
}

export class VoiceManager {
  private device!:       Device;
  private sendTransport: MSTypes.Transport | null = null;
  private producer:      MSTypes.Producer  | null = null;
  private muted          = false;
  private initialized    = false;
  private socket:        Socket | null = null;

  // keyed by producerId
  private consumers = new Map<string, ConsumerEntry>();
  private consumingProducers = new Set<string>();

  async init(socket: Socket): Promise<void> {
    this.socket = socket;

    const stream     = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const audioTrack = stream.getAudioTracks()[0];

    const rtpCapabilities = await new Promise<MSTypes.RtpCapabilities>((resolve, reject) => {
      socket.emit('voice-join', (data: { rtpCapabilities: MSTypes.RtpCapabilities } | { error: string }) => {
        if ('error' in data) reject(new Error(data.error));
        else resolve(data.rtpCapabilities);
      });
    });

    this.device = new Device();
    await this.device.load({ routerRtpCapabilities: rtpCapabilities });

    await this.createSendTransport(socket, audioTrack);

    socket.on('voice-new-producer', ({ producerId, socketId }: { producerId: string; socketId: string }) => {
      this.signalConsumer(socket, producerId, socketId);
    });

    socket.on('voice-producer-closed', ({ remoteProducerId }: { remoteProducerId: string }) => {
      this.closeConsumer(remoteProducerId);
    });

    socket.emit('voice-getProducers', (list: { producerId: string; socketId: string }[]) => {
      list.forEach(({ producerId, socketId }) => this.signalConsumer(socket, producerId, socketId));
    });

    this.initialized = true;
  }

  private async createSendTransport(socket: Socket, audioTrack: MediaStreamTrack): Promise<void> {
    const params = await this.requestTransport(socket, false);
    this.sendTransport = this.device.createSendTransport(params as MSTypes.TransportOptions);

    this.sendTransport.on(
      'connect',
      ({ dtlsParameters }: { dtlsParameters: MSTypes.DtlsParameters }, callback: () => void, errback: (e: Error) => void) => {
        socket.emit('voice-transport-connect', { dtlsParameters }, () => callback());
        void errback;
      },
    );

    this.sendTransport.on(
      'produce',
      async (
        { kind, rtpParameters }: { kind: MSTypes.MediaKind; rtpParameters: MSTypes.RtpParameters },
        callback: ({ id }: { id: string }) => void,
        errback: (e: Error) => void,
      ) => {
        try {
          const { id } = await new Promise<{ id: string }>((resolve, reject) => {
            socket.emit(
              'voice-transport-produce',
              { kind, rtpParameters },
              (data: { id: string } | { error: string }) => {
                if ('error' in data) reject(new Error(data.error));
                else resolve(data);
              },
            );
          });
          callback({ id });
        } catch (err) {
          errback(err as Error);
        }
      },
    );

    this.producer = await this.sendTransport.produce({ track: audioTrack });
  }

  private async requestTransport(socket: Socket, consumer: boolean): Promise<MSTypes.TransportOptions> {
    return new Promise((resolve, reject) => {
      socket.emit(
        'voice-createTransport',
        { consumer },
        (data: { params: MSTypes.TransportOptions | { error: string } }) => {
          if ('error' in data.params) reject(new Error(String((data.params as { error: string }).error)));
          else resolve(data.params as MSTypes.TransportOptions);
        },
      );
    });
  }

  private async signalConsumer(socket: Socket, remoteProducerId: string, socketId: string): Promise<void> {
    if (this.consumingProducers.has(remoteProducerId)) return;
    this.consumingProducers.add(remoteProducerId);

    const recvParams   = await this.requestTransport(socket, true);
    const recvTransport = this.device.createRecvTransport(recvParams);

    recvTransport.on(
      'connect',
      ({ dtlsParameters }: { dtlsParameters: MSTypes.DtlsParameters }, callback: () => void, errback: (e: Error) => void) => {
        socket.emit('voice-transport-recv-connect', {
          dtlsParameters,
          serverConsumerTransportId: recvParams.id,
        });
        callback();
        void errback;
      },
    );

    interface ConsumerParams {
      id: string; producerId: string; kind: MSTypes.MediaKind;
      rtpParameters: MSTypes.RtpParameters; serverConsumerId: string;
    }

    const consumerParams = await new Promise<ConsumerParams>((resolve, reject) => {
      socket.emit(
        'voice-consume',
        {
          rtpCapabilities: this.device.rtpCapabilities,
          remoteProducerId,
          serverConsumerTransportId: recvParams.id,
        },
        (data: { params: ConsumerParams | { error: string } }) => {
          if ('error' in data.params) reject(new Error(String((data.params as { error: string }).error)));
          else resolve(data.params as ConsumerParams);
        },
      );
    });

    const consumer = await recvTransport.consume({
      id:            consumerParams.id,
      producerId:    consumerParams.producerId,
      kind:          consumerParams.kind,
      rtpParameters: consumerParams.rtpParameters,
    });

    const audioT0 = performance.now();
    const audio    = new Audio();
    audio.srcObject = new MediaStream([consumer.track]);
    audio.autoplay  = true;
    audio.volume    = 0;
    document.body.appendChild(audio);

    this.consumers.set(remoteProducerId, { socketId, transport: recvTransport, consumer, audio });

    socket.emit('voice-consumer-resume', { serverConsumerId: consumerParams.serverConsumerId });
  }

  private closeConsumer(remoteProducerId: string): void {
    const entry = this.consumers.get(remoteProducerId);
    if (!entry) return;
    entry.transport.close();
    entry.consumer.close();
    entry.audio.pause();
    entry.audio.srcObject = null;
    entry.audio.remove();
    this.consumers.delete(remoteProducerId);
    this.consumingProducers.delete(remoteProducerId);
  }

  updateSpatialAudio(
    myPos:    { x: number; y: number },
    myRole:   Role,
    players:  Record<string, { x: number; y: number }>,
    lookAngle: number,
  ): void {
    if (!this.initialized) return;

    this.consumers.forEach((entry) => {
      const other = players[entry.socketId];
      if (!other) { entry.audio.volume = 0; return; }

      const dx   = other.x - myPos.x;
      const dy   = other.y - myPos.y;
      const dist = Math.hypot(dx, dy);
      let volume = 0;

      if (myRole === 'survivor') {
        volume = Math.max(0, 1 - dist / VOICE_SURVIVOR_HEAR_RADIUS);
      } else {
        const angleToTarget = Math.atan2(dy, dx);
        let   diff          = angleToTarget - lookAngle;
        while (diff >  Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        if (Math.abs(diff) <= CONE_HALF_RAD) {
          volume = Math.max(0, 1 - dist / FOV_PROFESSOR);
        }
      }

      entry.audio.volume = volume;
    });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted)  this.producer?.pause();
    else        this.producer?.resume();
  }

  isMuted(): boolean { return this.muted; }

  destroy(): void {
    this.socket?.off('voice-new-producer');
    this.socket?.off('voice-producer-closed');
    this.consumers.forEach((_, id) => this.closeConsumer(id));
    this.consumers.clear();
    this.consumingProducers.clear();
    this.producer?.close();
    this.sendTransport?.close();
    this.initialized = false;
  }
}
