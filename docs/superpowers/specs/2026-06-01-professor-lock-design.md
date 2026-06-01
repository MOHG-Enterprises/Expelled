# Professor Lock — Design Spec

## Resumo

Ao início de cada partida, o professor fica preso por 10 segundos atrás do portão PORTAOBOI. Um countdown grande e centralizado aparece na tela de todos os jogadores. Ao fim do tempo, o servidor emite a liberação, o portão é destruído (sprite + hitbox) e uma mensagem "O professor foi liberado!" pisca na tela.

---

## Servidor

### `server/types.ts`
Adicionar campo em `GameStateRecord`:
```
professorLockedEndsAt: number | null
```

### `server/gameState.ts`
Estado inicial: `professorLockedEndsAt: null`

### `server/index.ts` — handler `startMatch`
Após `state.phase = 'playing'` e o emit de `gamePhase`:
1. `state.professorLockedEndsAt = Date.now() + 10_000`
2. `io.to(roomName).emit('professorLocked', { endsAt: state.professorLockedEndsAt })`
3. `setTimeout(() => { state.professorLockedEndsAt = null; io.to(roomName).emit('professorReleased'); }, 10_000)`

---

## Colisão

### `src/mapConfig.ts`
Adicionar `'PORTAOBOI'` ao `COLLISION_LAYERS`. O `buildTilemap` existente já chama `setCollisionByExclusion([-1], true)` em todo layer do set — nenhuma outra mudança nesse arquivo.

---

## Cliente — GameScene

### `src/scenes/GameScene.ts`

**Novos campos:**
```
private portaoboiLayer:    Phaser.Tilemaps.TilemapLayer | null = null;
private portaoboiCollider: Phaser.Physics.Arcade.Collider | null = null;
```

**`create()`** — após `buildTilemap`:
- Salvar `map.getLayer('PORTAOBOI')?.tilemapLayer ?? null` em `portaoboiLayer`
- No loop de criação de colliders, quando `layerData.name === 'PORTAOBOI'`, salvar o collider retornado em `portaoboiCollider`

**Novo método `_releaseProfessor(silent = false)`:**
```
portaoboiCollider?.destroy()
portaoboiLayer?.destroy()
portaoboiCollider = null
portaoboiLayer = null
hud.stopProfessorCountdown()
if (!silent) hud.flash('O professor foi liberado!', 0xff4444, 3000)
```

**Novos handlers de socket** (em `_bindGameLifecycle`):
- `professorLocked { endsAt: number }` → `hud.startProfessorCountdown(endsAt)`
- `professorReleased` → `_releaseProfessor()`

**Handler `gameState` existente** — após o sync normal, checar `state.professorLockedEndsAt`:
- `> Date.now()` → `hud.startProfessorCountdown(state.professorLockedEndsAt)`
- `!= null && <= Date.now()` → `_releaseProfessor(true)` (sem mensagem, professor já estava livre)

**`resetLocalState()`** — zerar `portaoboiLayer` e `portaoboiCollider` para `null` ao reiniciar.

---

## Cliente — HUD

### `src/game/HUD.ts`

**Novos campos privados:**
```
private professorCountdownText:  Phaser.GameObjects.Text | null = null;
private professorCountdownTimer: Phaser.Time.TimerEvent | null = null;
```

**`startProfessorCountdown(endsAt: number)`:**
- Se já existir countdown ativo, destruir antes de criar novo
- Criar text em `(400, 40)`, fonte `48px bold`, cor `#ffffff`, stroke `#000000` thickness 5, `setScrollFactor(0)`, `setDepth(50)`, `setOrigin(0.5, 0)`
- Criar `TimerEvent` com `delay: 100, loop: true` que atualiza o texto com `Math.ceil((endsAt - Date.now()) / 1000)` — quando o valor for ≤ 0, escreve `"0"` mas não destroi (a destruição vem do evento `professorReleased`)

**`stopProfessorCountdown()`:**
- Remove o `TimerEvent` (`.remove()`)
- Destrói o text
- Zera ambos para `null`

---

## Tipos de Socket

Adicionar ao `shared/` ou `src/types.ts` (onde os eventos de socket são tipados):
```
professorLocked:   { endsAt: number }
professorReleased: void
```

---

## Reconnect

Quando um jogador reconecta mid-game, o servidor emite `gameState` via `requestSync`. O cliente lê `professorLockedEndsAt`:
- Se ainda no futuro → exibe countdown com tempo restante correto
- Se já passou (ou null) → destrói PORTAOBOI silenciosamente (sem mensagem)

---

## Reset de partida

Ao receber `gameReset` ou ao chamar `resetLocalState()`, as referências `portaoboiLayer` e `portaoboiCollider` são zeradas. Como o GameScene é recriado via `scene.restart()`, o `buildTilemap` recria o layer do zero na próxima partida — garantindo que PORTAOBOI aparece novamente.

---

## Fora de escopo

- Animação de abertura do portão (apenas destroy instantâneo)
- Efeito sonoro
- O professor pode se mover dentro da área confinada durante o countdown
