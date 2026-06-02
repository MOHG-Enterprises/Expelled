# Room Player Limit — Design Spec

**Date:** 2026-05-30  
**Status:** Approved

## Problem

The lobby shows `count/5 jogadores` per room but nothing prevents a 6th player from clicking and joining. The cap must be enforced server-side.

## Approach

Reject the join on the server and notify the client with a reason. The server is already the authority for all game state, so this is the correct place to enforce capacity.

## Design

### Constant

Add `MAX_PLAYERS_PER_ROOM = 5` to `shared/gameRules.ts` and re-export it from `server/gameState.ts`.

Replace the hardcoded `5` in `LobbyScene.ts` room-label text with an import of this constant.

### Server — `server/index.ts`

In the `joinRoom` handler, after validating the room name and checking `socketToRoom`, check capacity before adding the player:

```ts
if (Object.keys(state.players).length >= MAX_PLAYERS_PER_ROOM) {
  socket.emit('joinRejected', { reason: 'full' });
  return;
}
```

If the room is full the handler returns early: the socket is not added to `socketToRoom`, receives no `roleAssigned`, and `roomList` is not re-broadcast.

### Client — `src/scenes/LobbyScene.ts`

Listen for `joinRejected` on the socket. On `reason: 'full'`:

1. Show a temporary error message ("Sala cheia! Escolha outra.") for ~2 seconds in the existing status text area.
2. Return to the room-selection view (make room buttons visible again, reset internal state so the player can pick a different room).

## Out of Scope

- Disabling buttons for full rooms proactively (not needed; server rejection is sufficient).
- Distinguishing "full" from other future rejection reasons in the UI beyond the one message.
