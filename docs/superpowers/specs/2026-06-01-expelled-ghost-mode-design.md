# Expelled Ghost Mode — Design Spec

**Date:** 2026-06-01  
**Status:** Approved

## Overview

When a survivor is expelled, instead of freezing completely, they become a ghost: a transparent, wall-passing spectator who can still roam the map freely. A static corpse sprite is left at the expelled position. The ghost is visible to all other players (professor and survivors) as a semi-transparent sprite, subject to the professor's fog of war cone like any other sprite.

## Corpse Sprite

A static `Phaser.GameObjects.Sprite` (no physics body) is spawned at the expelled position on every client the moment `playerExpelled` is received:

- **Self client:** position taken from `this.player.x / this.player.y` at the moment of the event.
- **Other clients:** position taken from `PlayerManager.getPosition(id)` (last known position).
- Frame is the downed/fallen frame for the player's skin, resolved via `applyDownedFrameById`.
- Sprites are stored in `GameScene.corpseSprites: Map<string, Phaser.GameObjects.Sprite>`.
- Destroyed on `gameReset` along with all other scene objects.

No new server event is needed; the position is already available locally.

## Ghost Movement (Self)

`GameScene` has two self-expulsion handlers: `expelled` (self-only, sets `inputFrozen = true`) and `playerExpelled` (all clients, also sets `inputFrozen = true` for self). Both must be updated: neither should set `inputFrozen = true` for the ghost path. The ghost logic below is applied in the `playerExpelled` handler for `id === socket.id`; the `expelled` handler loses its `inputFrozen = true` line.

On receiving `playerExpelled` for `id === socket.id`:

- `inputFrozen` stays `false`. A new flag `ghost = true` is set instead.
- Physics collisions are disabled: `(this.player.body as Body).checkCollision.none = true`. Velocity still works — the player can move through tiles and world bounds.
- `MovementContext` gains a `ghost: boolean` field. `MovementSystem.update()` uses `PLAYER_SPEED * GHOST_SPEED_FACTOR` when `ghost` is true. `GHOST_SPEED_FACTOR = 1.8` is a new constant in `src/constants.ts`.
- Fog of war is bypassed: a new public method `FogOfWar.setFullReveal(enabled: boolean)` is added. When `enabled = true`, it hides the overlay rectangle entirely (`this.overlay?.setVisible(false)`), revealing the full map. `GameScene.update()` calls `this.fog.setFullReveal(true)` once when `ghost` becomes true (not every frame), and calls `this.fog.update()` as usual otherwise.
- All survivor interactions are skipped: `_updateSurvivorInteractions` returns immediately when `ghost = true`.
- `this.downed` is reset to `false` when ghost mode activates (at expulsion, `downed` is still `true` from detention; resetting it ensures walk/idle animations play instead of the downed frame).
- `move` events continue to be emitted to the server on the same `move` socket event.

### Server Change

Remove the `p.expelled` guard from the `move` handler in `server/index.ts` (line 209):

```
Before: if (!p || p.expelled || p.escaped) return;
After:  if (!p || p.escaped) return;
```

All other expelled guards (hack, attack, heal, detention) remain in place.

## Ghost Visibility (Other Clients)

No change needed. Other clients already set the expelled player's sprite to `alpha = 0.25` via `players.setAlpha(id, 0.25)` when `playerExpelled` arrives. Position updates from the ghost's `move` events flow through the existing `PlayerManager` update path normally. The professor's fog of war applies to the ghost sprite the same as any alive player.

## Ghost HUD (Self)

`HUD.setGhostMode()` is called once inside the `playerExpelled` handler after the existing flash. It:

- Hides: HP bar, stamina bar, bleed-out timer, down counter, heal progress, downed-survivor arrows.
- Shows: a centered label `💀 FANTASMA 💀` at the top of the HUD in white at 60% alpha.

The existing `hud.flash('Você foi expulso!', 0xff1744, 4000)` fires first; `setGhostMode()` is called after so the flash is still visible during the transition.

## Ghost State Reset

On `gameReset`, `ghost` is reset to `false`, `checkCollision.none` is restored to `false`, `corpseSprites` are destroyed and cleared, and `HUD.setGhostMode()` is undone (all normal HUD elements restored).

## Constants

| Constant | File | Value |
|---|---|---|
| `GHOST_SPEED_FACTOR` | `src/constants.ts` | `1.8` |

## Out of Scope

- Pulse/oscillating alpha effect on ghost sprite.
- Ghost-only VoIP channel.
- Ghost seeing HP bars of alive players.
- Ghost outline or visual distinction between ghosts.
