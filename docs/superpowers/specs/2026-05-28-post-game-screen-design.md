# Post-Game Screen Design

**Date:** 2026-05-28
**Status:** Approved

## Summary

Replace the current `gameOver` HUD flash with a dedicated `PostGameScene` that shows each player's match result and key performance stats. A "spectator" mode (watching the ongoing match after escaping) is explicitly out of scope and will be handled separately.

## Trigger

The `PostGameScene` appears for **all players** (survivors and professor) when the server emits the `gameOver` event. The current behavior (freeze input + flash HUD) is removed and replaced by this transition.

## Architecture

Three layers of change:

1. **Server (`server/index.ts` + `server/gameState.ts`)** — adds stat-tracking fields to `PlayerRecord` and accumulates them during the match. Extends the `gameOver` payload to include per-player stats.

2. **GameScene (`src/scenes/GameScene.ts`)** — on `gameOver`, saves the received data into the Phaser registry (`this.registry.set`) then calls `this.scene.start('PostGameScene')` instead of the current flash + freeze.

3. **PostGameScene (`src/scenes/PostGameScene.ts`, new)** — reads data from the registry, renders the result screen. Registered in `main.ts` alongside the existing scenes.

## Stats Tracked (server-side)

Added to `PlayerRecord` (in `server/gameState.ts`):

| Field | Type | Role | How accumulated |
|-------|------|------|-----------------|
| `hackContributed` | `number` (%) | survivor | Sum of validated `amount` from each `hackProgress` event |
| `timesDown` | `number` | survivor | Incremented on each `playerDown` for this player |
| `healsGiven` | `number` | survivor | Incremented on each completed altruistic heal (`playerHealed` where healer ≠ target) |
| `hitsLanded` | `number` | professor | Incremented on each attack hit that connects |
| `downedCount` | `number` | professor | Incremented on each `playerDown` across all survivors |
| `expelledCount` | `number` | professor | Incremented on each `playerExpelled` |

`outcome` for survivors is derived from existing fields: `escaped` → `"escaped"`, `expelled` → `"expelled"`, `downed && !expelled && !escaped` → `"downed"`.

## gameOver Payload Extension

Current: `{ winner: string }`

New:
```ts
{
  winner: string;
  stats: {
    [socketId: string]: {
      role: 'survivor' | 'professor';
      outcome?: 'escaped' | 'expelled' | 'downed'; // survivors only
      hackContributed?: number;
      timesDown?: number;
      healsGiven?: number;
      hitsLanded?: number;
      downedCount?: number;
      expelledCount?: number;
    };
  };
}
```

## Professor Rating

Derived from `expelledCount` at `gameOver` time:

| Expelled count | Label |
|---------------|-------|
| 0 | "Plano de Aula Ignorado" |
| 1 | "Professor Severo" |
| 2 | "Professor Implacável" |
| 3+ | "Ditador da Sala" |

## PostGameScene Layout

```
┌─────────────────────────────────────────────┐
│                                              │
│           [resultado grande]                 │
│    FUGIU! / EXPULSO / DERRUBADO              │
│    (ou rating label para o professor)        │
│                                              │
│  ┌────────┐  ┌──────────┐  ┌────────┐       │
│  │Terminais│  │Derrubado │  │ Curas  │       │
│  │  42%   │  │  1 vez   │  │ 2 feat.│       │
│  └────────┘  └──────────┘  └────────┘       │
│                                              │
│           [ JOGAR DE NOVO ]                  │
│                                              │
└─────────────────────────────────────────────┘
```

**Visual style:** same as the rest of the game — background `#1a1a2e`, monospace font, cool palette. Result label color varies by outcome:
- Fugiu: `#00e676` (green)
- Expulso: `#ff4444` (red)
- Derrubado: `#ffb300` (amber)
- Professor vitória: `#4fc3f7` (blue)
- Professor derrota: `#e94560` (pink/red)

**Stat boxes:** survivor shows `hackContributed`, `timesDown`, `healsGiven`. Professor shows `hitsLanded`, `downedCount`, `expelledCount`.

**"Jogar de novo" button:** navigates locally to `LobbyScene` via `this.scene.start('LobbyScene')`. No new server event required — the existing lobby reconnect flow handles re-registration.

## Out of Scope

- Spectator mode (watching the ongoing match after escaping/being expelled) — separate feature.
- Persistent grades or emblem quality system (Bronze/Silver/Gold/Iridescent) — not planned.
- Chat window on post-game screen.
