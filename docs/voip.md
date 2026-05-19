# VoIP — Implementação WebRTC com Mediasoup

## Visão geral

O jogo usa **Mediasoup 3** como SFU (Selective Forwarding Unit): o áudio de cada jogador vai ao servidor, que repassa seletivamente para os demais. Não é P2P — todo tráfego de mídia passa pelo servidor.

Apenas **áudio Opus** é usado; vídeo não existe.

---

## Arquitetura

```
Browser A ──► WebRtcTransport (send) ──► Producer A ──┐
                                                       │
                                             Router    ├──► Consumer (B ouve A) ──► Browser B
                                             (por sala)│
Browser B ──► WebRtcTransport (send) ──► Producer B ──┘
                   │
                   └──► WebRtcTransport (recv) ──► Consumer (A ouve B) ──► Browser A
```

Cada sala de jogo (`sala1`–`sala4`) tem seu próprio **Router** Mediasoup. Um único **Worker** serve todos os Routers.

---

## Servidor — `server/voiceRouter.ts`

Dois exports públicos:

| Função | Papel |
|--------|-------|
| `initVoiceWorker()` | Cria o Worker Mediasoup; chamada antes do `server.listen()` |
| `registerVoiceSocket(socket, getRoomName, io)` | Registra os handlers de sinalização para um socket |

Estado global (arrays mutados a cada conexão/desconexão):

```
voiceRouters  — Record<roomName, Router>
voicePeers    — Record<socketId, { roomName, transports[], producers[], consumers[] }>
transports[]  — { socketId, roomName, transport, consumer: bool }
producers[]   — { socketId, roomName, producer }
consumers[]   — { socketId, roomName, consumer }
```

---

## Cliente — `src/game/VoiceManager.ts`

Instanciada em `GameScene.create()`, destruída no `gameReset`.

**Fluxo de `init(socket)`:**

1. `getUserMedia({ audio: true })` — captura microfone
2. `voice-join` → recebe `rtpCapabilities` do Router
3. `Device.load(rtpCapabilities)` — inicializa o decodec/codec local
4. Cria **send transport** → produz o track de áudio
5. `voice-getProducers` → lista producers já existentes na sala → cria consumers
6. Escuta `voice-new-producer` → cria consumer para cada peer que entrar depois

**`updateSpatialAudio()`** é chamada a cada frame e ajusta `HTMLAudioElement.volume` de cada consumer com base na posição dos jogadores.

---

## Sinalização — eventos Socket.io (prefixo `voice-`)

| Evento | Direção | O que faz |
|--------|---------|-----------|
| `voice-join` | C → S | Entra no canal de voz, recebe `rtpCapabilities` |
| `voice-getProducers` | C → S | Lista producers ativos na sala |
| `voice-createTransport` | C → S | Cria WebRtcTransport (send ou recv) |
| `voice-transport-connect` | C → S | Entrega `dtlsParameters` ao transport |
| `voice-transport-produce` | C → S | Cria Producer, notifica outros via `voice-new-producer` |
| `voice-transport-recv-connect` | C → S | Conecta transport de recepção |
| `voice-consume` | C → S | Cria Consumer para um Producer remoto |
| `voice-consumer-resume` | C → S | Despausa o Consumer (criado como `paused: true`) |
| `voice-new-producer` | S → C | Novo peer entrou com áudio |
| `voice-producer-closed` | S → C | Peer saiu, fecha o Consumer correspondente |

---

## Áudio espacial

Calculado no cliente a cada frame em `VoiceManager.updateSpatialAudio()`:

**Survivor** ouve qualquer jogador dentro de 200 px:
```
volume = clamp(1 − dist / 200, 0, 1)
```

**Professor** ouve apenas dentro do cone de visão (±40°, até 460 px):
```
se |ângulo_até_alvo − lookAngle| ≤ 40°:
    volume = clamp(1 − dist / 460, 0, 1)
senão:
    volume = 0
```

O `lookAngle` vem do próprio `GameScene` (direção em que o professor está virado).

---

## Configuração para rede local

Mediasoup precisa saber qual IP anunciar nos ICE candidates. Sem isso, apenas `localhost` funciona.

```powershell
$env:RTC_ANNOUNCED_IP="<IP_DA_MÁQUINA_SERVIDORA>"; npm run dev
```

O cliente também precisa de HTTPS para que `getUserMedia` funcione fora de localhost. O Vite usa `@vitejs/plugin-basic-ssl` para isso — o browser vai exibir aviso de certificado não confiável na primeira vez; basta aceitar.
