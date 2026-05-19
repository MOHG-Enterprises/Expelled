# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # starts both processes (tsx server + Vite client)
npm run dev:server   # server only — tsx watch server/index.ts (hot-reload)
npm run dev:client   # client only — Vite
npm run build        # vite build + tsc -p tsconfig.server.json
npm run start        # run compiled server (node dist/server/index.js)
npm run typecheck    # type-check client (tsconfig.json) + server (tsconfig.server.json)
```

There are no automated tests.

## Architecture

Two independent processes communicating via Socket.io only — no shared mutable state:

- **Client**: Phaser 3 + Vite, TypeScript, entry at `src/main.ts`
- **Server**: Node.js/Express + Socket.io, TypeScript via `tsx`, entry at `server/index.ts`

Two separate `tsconfig` files: root `tsconfig.json` (client, ESModules) and `tsconfig.server.json` (server + shared, CommonJS, `rootDir: "."`).

### Module boundaries

| Directory | Consumed by | Notes |
|-----------|-------------|-------|
| `src/` | client only | Vite resolves these |
| `server/` | server only | |
| `shared/` | both | compiled into both bundles |

**Constants split** — this is a recurring source of bugs:
- `src/constants.ts` — client-only constants (speeds, visual, hack ticks)
- `shared/gameRules.ts` — constants the server must also know (`HACK_FAIL_REGRESSION`, `HACK_AMOUNT_MAX`, `ATTACK_COOLDOWN_MS`, `DETENTION_SKILL_CHECKS_REQUIRED`)
- `server/gameState.ts` re-exports the shared constants so `server/index.ts` can import them from one place

If a constant is needed server-side it must live in `shared/gameRules.ts` and be re-exported from `server/gameState.ts`. It can also be re-exported from `src/constants.ts` for the client, but the source of truth must be `shared/`.

**Types are duplicated by design**: `src/types.ts` (client-facing `PlayerState`) and `server/types.ts` (server-internal `PlayerRecord` which adds `ready`, `lastAttackTime`, `detentionHits`). Do not merge them.

### Scene flow

`LobbyScene` → `GameScene`. Lobby assigns roles (first connection = professor, rest = survivors). Professor starts the match once all survivors are ready.

### GameScene subsystems

`GameScene` owns one instance of each subsystem and wires them together in `create()` / `update()`:

| Class | File | Role |
|-------|------|------|
| `SkillCheck` | `src/game/SkillCheck.ts` | Circular needle UI; one instance reused for all checks |
| `TerminalManager` | `src/game/TerminalManager.ts` | Terminal sprites, progress bars, fail-frame flash |
| `PlayerManager` | `src/game/PlayerManager.ts` | Remote player sprites |
| `FogOfWar` | `src/game/FogOfWar.ts` | Flashlight / visibility cone |
| `HUD` | `src/game/HUD.ts` | Heads-up display |
| `StaminaBar` | `src/game/StaminaBar.ts` | Sprint stamina |
| `playerSkins` | `src/game/playerSkins.ts` | Skin definitions per role; `ROLE_DEFAULT_SKINS` maps role → skin key |

`TerminalManager.setWorking()` is currently a no-op (placeholder for future visual effects).

`update()` calls `_updateSurvivorInteractions(delta)` or `_updateProfessorInteractions()` based on role. When `inputFrozen = true`, the entire `update()` returns early after processing the skill-check SPACE input and the stagger timer — nothing else runs.

### Hacking mechanic (`_updateSurvivorInteractions`)

Two independent timers run while E is held near a terminal:
- `hackPassiveTimer` — fires every `HACK_PASSIVE_RATE_MS` (600 ms), emits `hackProgress` with `HACK_PASSIVE_TICK` (4%)
- `hackHoldTimer` — fires after a random 2500–5000 ms, triggers a skill check via `runHackSkillCheck`

Both timers reset to 0 when the player releases E or walks away. `hackHoldTimer` also resets to 0 when a skill check triggers. `hackNextThreshold` is re-randomized on `create()` and after each trigger.

### SkillCheck mechanic

Needle rotates clockwise from 12 o'clock. `zoneStart` is randomized each `show()` call. `SKILL_CHECK_WINDOW = 0.18` (18% of circle); great zone is the first 20% of that window. `totalRotation >= 1.0` auto-fails without input. `onSuccess(isGreat)` / `onFail()` are the only callbacks.

```
runHackSkillCheck outcomes:
  great hit  → emit hackProgress { amount: HACK_GREAT_BONUS (12%) }
  normal hit → no emit; passive progress continues
  miss/timeout → emit skillCheckFailed
```

Server on `skillCheckFailed`: regresses terminal by `HACK_FAIL_REGRESSION` (15%), then emits `terminalUpdate` followed by `firewallAlert`.

### TerminalManager: setFailed vs setProgress

`setFailed` shows `FRAME_FAIL` for 1100 ms via `scene.time.delayedCall` then restores the correct frame. It has no shared state with `setProgress` — `setProgress` always updates bar width and frame independently.

### Server authority

`server/gameState.ts` owns all mutable game state. `server/index.ts` validates every client event before mutating state. The client sends intent (`hackProgress { amount }`) and the server validates the amount against `HACK_AMOUNT_MAX` before applying.

### detentionAnswer mechanic

Server on `detentionAnswer { correct, isGreat }`: if correct, increments `detentionHits` by 2 (great) or 1 (normal). At `DETENTION_SKILL_CHECKS_REQUIRED` (3) the player escapes — `downed = false`, `hp = 1`, broadcasts `playerRevived`. On failure, marks `expelled = true`, broadcasts `playerExpelled`.

### Sistema de salas

4 salas fixas (`sala1`–`sala4`) definidas em `shared/ROOM_NAMES` (re-exportadas de `server/gameState.ts` e `src/constants.ts`). O jogador escolhe uma sala no lobby antes de receber role. O servidor usa `socketToRoom: Map<string, string>` para associar socket → sala. Todos os broadcasts de jogo são escopados via `io.to(roomName)`.

### VoIP (Mediasoup SFU)

Comunicação de voz entre players usando Mediasoup 3 (SFU — Selective Forwarding Unit). Apenas áudio (Opus), sem vídeo.

**Arquivos:**
- `server/voiceRouter.ts` — Worker + Routers por sala; eventos Socket.io com prefixo `voice-`
- `src/game/VoiceManager.ts` — cliente Mediasoup; `init()` captura mic e configura send/recv transports; `updateSpatialAudio()` ajusta volume a cada frame

**Eventos Socket.io de voz** (prefixo `voice-` para não colidir com eventos de jogo):
`voice-join`, `voice-getProducers`, `voice-createTransport`, `voice-transport-connect`, `voice-transport-produce`, `voice-transport-recv-connect`, `voice-consume`, `voice-consumer-resume`, `voice-new-producer`, `voice-producer-closed`

**Lógica de áudio espacial** (calculada no cliente a cada frame em `GameScene.update()`):
- Survivor: volume = `clamp(1 − dist / VOICE_SURVIVOR_HEAR_RADIUS, 0, 1)` onde raio = 200 px
- Professor: volume dentro do cone de visão (±40°, até 460 px), 0 fora do cone

`VoiceManager.init()` falha silenciosamente (sem microfone → HUD warning, jogo funciona normalmente). Destroy obrigatório no handler de `gameReset`.

**IP do servidor:** configurável via `process.env.RTC_ANNOUNCED_IP` (default `127.0.0.1` para localhost). Para deploy remoto, setar para o IP público.

## Backlog

- Gamepad não funciona no Zen Browser — funciona normalmente no Chrome. Causa provável: restrição do browser ao Gamepad API (não é bug do código).

## Coding conventions

- TypeScript throughout; no `any`
- No inline comments — logic explanation belongs in prose (like this file), not in code
- Socket events are the only communication channel between client and server
