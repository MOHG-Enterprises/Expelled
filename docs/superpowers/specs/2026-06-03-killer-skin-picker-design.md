# Killer Skin Picker — Design Spec
Date: 2026-06-03

## Overview
Add a character selection screen for the professor role, mirroring the existing survivor picker but without the name input field. When a player receives the `professor` role, they are taken to the killer picker before entering the in-room UI.

## Scope
- `src/scenes/LobbyScene.ts` — client picker UI
- `server/index.ts` — server-side skin validation

Out of scope: killer icons for Clayrton, Fernanda, AquarioGuy (deferred).

## KILLER_SKINS constant
```typescript
const KILLER_SKINS = [
  { skinId: 'professor',  iconKey: 'professor-icon', iconPath: './personagens/killers/professor/icon/Icon_Boi_Finished.png', label: 'Professor'  },
  { skinId: 'clayrton',   iconKey: null,             iconPath: null, label: 'Clayrton'   },
  { skinId: 'fernanda',   iconKey: null,             iconPath: null, label: 'Fernanda'   },
  { skinId: 'aquarioguy', iconKey: null,             iconPath: null, label: 'AquarioGuy' },
];
```

## New class properties
- `killerPickerUI: Phaser.GameObjects.GameObject[]` — all objects toggled as a group
- `killerCharacterBtns: { skinId: string; btn: Phaser.GameObjects.Image }[]`
- `chosenKillerSkinId = 'professor'`
- `pickerKillerSkinId = 'professor'`

## Flow change
`roleAssigned`:
- `survivor` → `showPickerUI()` (unchanged)
- `professor` → `showKillerPickerUI()` (new)

## buildKillerPickerUI()
Same as `buildPickerUI()` except:
- No name label, no name box, no `nameDisplay`, no cursor/keyboard input
- Title: `ESCOLHA SEU PERSONAGEM`
- Buttons in same 3-col layout; for killers where `iconPath === null`, render button + label only (no icon image)
- Confirm button calls `confirmKillerCharacter()`

## confirmKillerCharacter()
```typescript
const skinLabel = KILLER_SKINS.find(s => s.skinId === this.pickerKillerSkinId)?.label ?? this.pickerKillerSkinId;
this.chosenKillerSkinId = this.pickerKillerSkinId;
this.socket.emit('setCharacter', { name: skinLabel, skinId: this.pickerKillerSkinId });
this.hideKillerPickerUI();
this.showInRoomUI();
```

## "Trocar personagem" button
Reuse `backToPickerBtn`. Callback branches on `myRole`:
- `survivor` → `showPickerUI()`
- `professor` → `showKillerPickerUI()`

In `showInRoomUI()`: button visible for both roles (currently only survivors).

## drawKillerSkinRings()
```typescript
private drawKillerSkinRings() {
  this.killerCharacterBtns.forEach(({ skinId, btn }) => {
    btn.setFrame(skinId === this.pickerKillerSkinId ? 1 : 0);
  });
}
```

## Bug fix
`init()` line 84: `this.skinRings = []` → `this.characterBtns = []`

## Server changes (`server/index.ts`)
```typescript
const VALID_KILLER_SKINS = new Set(['professor', 'clayrton', 'fernanda', 'aquarioguy']);
```
Update `setCharacter` handler: remove the `role !== 'survivor'` guard; instead branch on role:
```typescript
if (p.role === 'survivor') {
  if (!VALID_SURVIVOR_SKINS.has(skinId)) return;
} else if (p.role === 'professor') {
  if (!VALID_KILLER_SKINS.has(skinId)) return;
} else {
  return;
}
```
Keep existing `name` validation (trim/maxlen/non-empty) for both roles.
