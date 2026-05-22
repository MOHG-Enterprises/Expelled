# Character Selection & Name Input — Design Spec

**Date:** 2026-05-22  
**Status:** Approved

## Overview

Add a character selection screen and name input to the lobby for survivor players. The chosen name replaces the placeholder labels (A1/A2/A3) in the HUD survivor cards, and the chosen character defines the sprite and icon used in the game world for all players.

## Scope

- Survivors only: professor keeps fixed skin and no name input
- Name appears only in HUD survivor cards (not as floating label above sprite)
- Duplicate character selection is allowed (two survivors can pick the same skin)
- Server-authoritative: name and skinId flow through the server and are visible to all clients

---

## Lobby Flow

```
Room selection list
      ↓
  joinRoom emitted
      ↓
  roleAssigned = 'professor'  →  existing in-room UI (no change)
  roleAssigned = 'survivor'   →  CharacterPickerUI
                                    - Text input: display name (max 12 chars)
                                    - 4 skin buttons: Arthur / Gustavo / Giu / Isabela
                                      (each shows the character's portrait icon)
                                    - "Confirmar" button: active only when name is non-empty
                                    - On confirm: emit setCharacter { name, skinId }
                                      → transition to existing in-room waiting UI
```

The CharacterPickerUI is a new visual state within LobbyScene (not a separate Phaser Scene). It is implemented inline as a group of GameObjects stored alongside the existing `inRoomUI` array pattern.

---

## New Socket Event

**Client → Server:** `setCharacter`

```ts
{ name: string; skinId: string }
```

Server validation:
- `skinId` must be one of `['arthur', 'gustavo', 'giu', 'isabela']`; invalid values are rejected silently (server keeps previous value)
- `name` is trimmed and truncated to 12 characters; empty string is rejected
- Event can be emitted before or after `setReady`; server updates fields independently

---

## Type Changes

### `server/types.ts` — `PlayerRecord`

Add two optional fields (default to empty string on join):

```ts
name: string;    // '' until setCharacter received
skinId: string;  // '' until setCharacter received
```

### `src/types.ts` — `PlayerState`

Mirror the same fields:

```ts
name: string;
skinId: string;
```

These fields are included in every `gameState` broadcast.

---

## playerSkins.ts

Add a new utility function:

```ts
export function getSkinById(skinId: string): PlayerSkin {
  return PLAYER_SKINS[skinId] ?? PLAYER_SKINS.arthur;
}
```

This replaces `getSkinForRole` calls in `PlayerManager` when a specific skinId is known.

---

## GameScene Changes

### `_buildSurvivorStatuses()`

Current code:
```ts
return { label: `A${i + 1}`, skinId: GameScene.SURVIVOR_SKIN_SLOTS[i] ?? 'arthur', ...info };
```

New logic:
```ts
const p = survivorEntries[i]; // [socketId, PlayerState]
const label  = p?.name   || `A${i + 1}`;
const skinId = p?.skinId || GameScene.SURVIVOR_SKIN_SLOTS[i] ?? 'arthur';
return { label, skinId, ...info };
```

`SURVIVOR_SKIN_SLOTS` is kept as fallback for players who haven't sent `setCharacter` yet.

### Local player sprite

GameScene must track the local player's chosen `skinId`. When the match starts (transition from LobbyScene to GameScene), the chosen `skinId` is passed via `scene.start()` data. The local sprite uses `getSkinById(skinId)` instead of `getSkinForRole(role)`.

---

## PlayerManager Changes

`PlayerManager` currently calls `getSkinForRole(role)` for all remote survivors (always returns `arthur`). After this change:

- `PlayerState` now carries `skinId`
- `PlayerManager.update()` receives the full `PlayerState`; when `skinId` changes or on first render, call `getSkinById(skinId)` to set the correct texture
- The `RemotePlayer` interface gains a `skinId: string` field to detect changes

---

## Fallback Behavior

All fallbacks preserve current behavior if `setCharacter` was never received:

| Field | Fallback |
|-------|----------|
| `label` | `A${i+1}` |
| `skinId` (HUD card) | `SURVIVOR_SKIN_SLOTS[i]` |
| `skinId` (sprite) | `getSkinForRole(role)` → `arthur` |

---

## Files Touched

| File | Change |
|------|--------|
| `src/scenes/LobbyScene.ts` | Add CharacterPickerUI state (name input + 4 skin buttons + confirm button) |
| `server/types.ts` | Add `name`, `skinId` to `PlayerRecord` |
| `src/types.ts` | Add `name`, `skinId` to `PlayerState` |
| `server/index.ts` | Handle `setCharacter` event; include name/skinId in gameState broadcasts |
| `server/gameState.ts` | Initialize `name: ''`, `skinId: ''` on player join |
| `src/game/playerSkins.ts` | Add `getSkinById()` |
| `src/game/PlayerManager.ts` | Use `skinId` from `PlayerState` instead of `getSkinForRole(role)` |
| `src/scenes/GameScene.ts` | Pass `skinId` in scene data; use real name/skinId in `_buildSurvivorStatuses()` |
