# Start Screen Design

## Context

Browsers require a user gesture before the AudioContext can be resumed and sounds played. A start screen that forces a click before entering the lobby solves this cleanly. It also serves as the natural entry point for future sound asset loading.

## Goal

Add a `StartScene` that:
1. Preloads game assets (currently none; sounds will be added here later)
2. Shows a loading bar during preload
3. Presents a minimalist click-to-play screen
4. Transitions to `LobbyScene` on user interaction — unlocking the browser AudioContext in the process

## Visual Style

Minimalist, matching the game's existing dark aesthetic (`#1a1a2e` background).

- During preload: centered progress bar + "Carregando…" text
- After preload: title "EXPELLED" + subtitle "CLIQUE PARA JOGAR"
- No decorative elements, no animations beyond the progress bar fill

## Scene Structure

**File:** `src/scenes/StartScene.ts`

### `preload()`

Phaser runs this automatically before `create()`. Sound assets will be added here as they are implemented. During loading, the scene renders:
- A background rectangle filling the screen (`#1a1a2e`)
- A loading bar track (dark gray rectangle, centered)
- A loading bar fill (white/light rectangle, width proportional to `progress` event value)
- "Carregando…" text above the bar

When all assets are loaded (or immediately if none), Phaser calls `create()`.

### `create()`

Loading bar and text are destroyed. The click-to-play screen is shown:
- Title text: `"EXPELLED"` — large, white, monospace font, centered
- Subtitle text: `"CLIQUE PARA JOGAR"` — small, gray, letter-spaced, centered below title

Input registered:
- `this.input.on('pointerdown', ...)` — mouse and touch
- Keyboard keys SPACE and ENTER as alternatives (gamepad/keyboard support)

On any of these inputs: `this.scene.start('LobbyScene')`.

## Integration

**`src/main.ts`** — scene list updated to `[StartScene, LobbyScene, GameScene]`. No other files modified.

## Future: Adding Sounds

When sound files are ready, add `this.load.audio(key, path)` calls to `StartScene.preload()`. The loading bar will automatically reflect real progress. No other changes needed.

## Files Changed

| File | Change |
|------|--------|
| `src/scenes/StartScene.ts` | New file |
| `src/main.ts` | Add `StartScene` as first scene |
