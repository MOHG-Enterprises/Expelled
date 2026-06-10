import * as mediasoup from 'mediasoup';
import type { Socket } from 'socket.io';

type Worker    = mediasoup.types.Worker;
type Router    = mediasoup.types.Router;
type Transport = mediasoup.types.WebRtcTransport;
type Producer  = mediasoup.types.Producer;
type Consumer  = mediasoup.types.Consumer;

interface VoicePeer {
  roomName:   string;
  transports: string[];
  producers:  string[];
  consumers:  string[];
}

interface TransportEntry { socketId: string; roomName: string; transport: Transport; consumer: boolean; }
interface ProducerEntry  { socketId: string; roomName: string; producer: Producer; }
interface ConsumerEntry  { socketId: string; roomName: string; consumer: Consumer; }

let worker: Worker;
const voiceRouters: Record<string, Router> = {};
const voicePeers:   Record<string, VoicePeer> = {};
let transports: TransportEntry[] = [];
let producers:  ProducerEntry[]  = [];
let consumers:  ConsumerEntry[]  = [];

const AUDIO_CODEC: mediasoup.types.RtpCodecCapability = {
  kind:                 'audio',
  mimeType:             'audio/opus',
  clockRate:            48000,
  channels:             2,
  preferredPayloadType: 111,
};

const LISTEN_IP = process.env['RTC_ANNOUNCED_IP'] ?? '127.0.0.1';

export async function initVoiceWorker(): Promise<void> {
  worker = await mediasoup.createWorker({ rtcMinPort: 49152, rtcMaxPort: 65535 });
  worker.on('died', () => setTimeout(() => process.exit(1), 2000));
}

async function getOrCreateVoiceRouter(roomName: string): Promise<Router> {
  if (!voiceRouters[roomName]) {
    voiceRouters[roomName] = await worker.createRouter({ mediaCodecs: [AUDIO_CODEC] });
  }
  return voiceRouters[roomName];
}

async function createTransport(router: Router): Promise<Transport> {
  const transport = await router.createWebRtcTransport({
    listenIps: [{ ip: '0.0.0.0', announcedIp: LISTEN_IP }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });
  transport.on('dtlsstatechange', (state) => { if (state === 'closed') transport.close(); });
  return transport;
}

function removeItems(socketId: string): void {
  consumers = consumers.filter((c) => {
    if (c.socketId === socketId) { c.consumer.close(); return false; }
    return true;
  });
  producers = producers.filter((p) => {
    if (p.socketId === socketId) { p.producer.close(); return false; }
    return true;
  });
  transports = transports.filter((t) => {
    if (t.socketId === socketId) { t.transport.close(); return false; }
    return true;
  });
}

function informConsumers(roomName: string, producerSocketId: string, producerId: string, io: { to: (r: string) => { emit: (e: string, d: unknown) => void } }): void {
  producers.forEach((entry) => {
    if (entry.socketId !== producerSocketId && entry.roomName === roomName) {
      const peer = voicePeers[entry.socketId];
      if (peer) {
        io.to(entry.socketId).emit('voice-new-producer', { producerId, socketId: producerSocketId });
      }
    }
  });
}

export function registerVoiceSocket(
  socket: Socket,
  getRoomName: (socketId: string) => string | null,
  io: { to: (r: string) => { emit: (e: string, d: unknown) => void } },
): void {

  socket.on('voice-join', async (callback: (data: { rtpCapabilities: mediasoup.types.RtpCapabilities }) => void) => {
    const roomName = getRoomName(socket.id);
    if (!roomName || typeof callback !== 'function') return;

    const router = await getOrCreateVoiceRouter(roomName);
    voicePeers[socket.id] = { roomName, transports: [], producers: [], consumers: [] };
    callback({ rtpCapabilities: router.rtpCapabilities });
  });

  socket.on('voice-getProducers', (callback: (list: { producerId: string; socketId: string }[]) => void) => {
    const peer = voicePeers[socket.id];
    if (!peer || typeof callback !== 'function') return;
    const list = producers
      .filter((p) => p.socketId !== socket.id && p.roomName === peer.roomName)
      .map((p) => ({ producerId: p.producer.id, socketId: p.socketId }));
    callback(list);
  });

  socket.on('voice-createTransport', async (
    { consumer }: { consumer: boolean },
    callback: (data: { params: unknown }) => void,
  ) => {
    const peer = voicePeers[socket.id];
    if (!peer || typeof callback !== 'function') return;
    const router = voiceRouters[peer.roomName];
    if (!router) return;

    try {
      const transport = await createTransport(router);
      transports.push({ socketId: socket.id, roomName: peer.roomName, transport, consumer });
      peer.transports.push(transport.id);
      callback({
        params: {
          id:             transport.id,
          iceParameters:  transport.iceParameters,
          iceCandidates:  transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        },
      });
    } catch (err) {
      callback({ params: { error: String(err) } });
    }
  });

  socket.on('voice-transport-connect', async (
    { dtlsParameters }: { dtlsParameters: mediasoup.types.DtlsParameters },
    callback?: () => void,
  ) => {
    try {
      const entry = transports.find((t) => t.socketId === socket.id && !t.consumer);
      if (entry) await entry.transport.connect({ dtlsParameters });
      callback?.();
    } catch (err) {
      void err;
    }
  });

  socket.on('voice-transport-produce', async (
    { kind, rtpParameters }: { kind: mediasoup.types.MediaKind; rtpParameters: mediasoup.types.RtpParameters },
    callback: (data: { id: string; producersExist: boolean }) => void,
  ) => {
    const peer = voicePeers[socket.id];
    if (!peer || typeof callback !== 'function') return;
    const sendTransport = transports.find((t) => t.socketId === socket.id && !t.consumer);
    if (!sendTransport) return;

    const producer = await sendTransport.transport.produce({ kind, rtpParameters });
    producers.push({ socketId: socket.id, roomName: peer.roomName, producer });
    peer.producers.push(producer.id);

    producer.on('transportclose', () => producer.close());

    informConsumers(peer.roomName, socket.id, producer.id, io);
    callback({ id: producer.id, producersExist: producers.length > 1 });
  });

  socket.on('voice-transport-recv-connect', async ({
    dtlsParameters,
    serverConsumerTransportId,
  }: { dtlsParameters: mediasoup.types.DtlsParameters; serverConsumerTransportId: string }) => {
    try {
      const entry = transports.find((t) => t.consumer && t.transport.id === serverConsumerTransportId);
      if (entry) await entry.transport.connect({ dtlsParameters });
    } catch (err) {
      void err;
    }
  });

  socket.on('voice-consume', async (
    {
      rtpCapabilities,
      remoteProducerId,
      serverConsumerTransportId,
    }: {
      rtpCapabilities: mediasoup.types.RtpCapabilities;
      remoteProducerId: string;
      serverConsumerTransportId: string;
    },
    callback: (data: { params: unknown }) => void,
  ) => {
    const peer = voicePeers[socket.id];
    if (!peer || typeof callback !== 'function') return;
    const router = voiceRouters[peer.roomName];
    if (!router) return;

    const consumerTransport = transports.find(
      (t) => t.consumer && t.transport.id === serverConsumerTransportId,
    );
    if (!consumerTransport) return;

    if (!router.canConsume({ producerId: remoteProducerId, rtpCapabilities })) {
      callback({ params: { error: 'cannot consume' } });
      return;
    }

    try {
      const consumer = await consumerTransport.transport.consume({
        producerId: remoteProducerId,
        rtpCapabilities,
        paused: true,
      });

      consumer.on('transportclose', () => consumer.close());
      consumer.on('producerclose', () => {
        const producerEntry = producers.find((p) => p.producer.id === remoteProducerId);
        socket.emit('voice-producer-closed', { remoteProducerId, socketId: producerEntry?.socketId });
        consumerTransport.transport.close();
        transports = transports.filter((t) => t.transport.id !== consumerTransport.transport.id);
        consumer.close();
        consumers = consumers.filter((c) => c.consumer.id !== consumer.id);
      });

      consumers.push({ socketId: socket.id, roomName: peer.roomName, consumer });
      peer.consumers.push(consumer.id);

      callback({
        params: {
          id:             consumer.id,
          producerId:     remoteProducerId,
          kind:           consumer.kind,
          rtpParameters:  consumer.rtpParameters,
          serverConsumerId: consumer.id,
        },
      });
    } catch (err) {
      callback({ params: { error: String(err) } });
    }
  });

  socket.on('voice-consumer-resume', async ({ serverConsumerId }: { serverConsumerId: string }) => {
    const entry = consumers.find((c) => c.consumer.id === serverConsumerId);
    await entry?.consumer.resume();
  });

  socket.on('disconnect', () => {
    const peer = voicePeers[socket.id];
    if (!peer) return;

    const myProducerIds = producers
      .filter((p) => p.socketId === socket.id)
      .map((p) => p.producer.id);

    removeItems(socket.id);
    delete voicePeers[socket.id];

    myProducerIds.forEach((producerId) => {
      producers
        .filter((p) => p.roomName === peer.roomName)
        .forEach((p) => {
          io.to(p.socketId).emit('voice-producer-closed', { remoteProducerId: producerId, socketId: socket.id });
        });
    });
  });
}
