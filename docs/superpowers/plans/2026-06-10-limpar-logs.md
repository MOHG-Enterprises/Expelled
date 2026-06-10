# Limpar os Logs (issue #63) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover todos os logs de debug do cliente (e a instrumentação de lag que só existe para eles), mantendo logs operacionais e `console.error` do servidor.

**Architecture:** Só deleções em dois arquivos do cliente: `src/scenes/GameScene.ts` e `src/game/VoiceManager.ts`. Nenhum log do servidor muda. O collider físico de tiles e as chamadas reais de update (`fog.update`, `players.update`, `hacking.updateSelf`) permanecem intactos.

**Tech Stack:** TypeScript, Phaser 3. Verificação via `npm run typecheck` + grep.

**Nota:** Sem nenhum comando git (preferência do usuário — ele mesmo comita).

---

### Task 1: GameScene — logs de colisão e posição

**Files:**
- Modify: `src/scenes/GameScene.ts:144`, `:176-182`, `:294`, e o campo `lastCollisionLogAt`

- [ ] **Step 1: Remover o log de posição em `toggleCollisionDebug()`**

Deletar a linha:

```ts
    console.log(this.player.x, this.player.y);
```

- [ ] **Step 2: Remover o callback de log do collider**

De:

```ts
        const collider = this.physics.add.collider(
          this.player, layer,
          (_p, tile) => this.logCollisionLayer(layerData.name, tile as Phaser.Tilemaps.Tile),
        );
```

para:

```ts
        const collider = this.physics.add.collider(this.player, layer);
```

- [ ] **Step 3: Remover o método `logCollisionLayer` inteiro**

Deletar:

```ts
  private logCollisionLayer(layerName: string, tile: Phaser.Tilemaps.Tile) {
    const now  = this.time.now;
    const last = this.lastCollisionLogAt[layerName] ?? -Infinity;
    if (now - last < 350) return;
    this.lastCollisionLogAt[layerName] = now;
    console.log(`[collision] layer=${layerName} tile=(${tile.x},${tile.y}) index=${tile.index}`);
  }
```

- [ ] **Step 4: Remover a declaração do campo `lastCollisionLogAt`**

Localizar a declaração (`private lastCollisionLogAt...`) no topo da classe e deletá-la.

### Task 2: GameScene — instrumentação de lag

**Files:**
- Modify: `src/scenes/GameScene.ts:348-361`, `:828-829`, `:980-986`, `:1011-1017`

- [ ] **Step 1: Remover os blocos `[render-slow]` e `[hb-miss]` do `create()`**

Deletar:

```ts
    let _renderT = 0;
    this.events.on('prerender',  () => { _renderT = performance.now(); });
    this.events.on('postrender', () => {
      const dt = performance.now() - _renderT;
      if (dt > 30) console.warn(`[render-slow] ${dt.toFixed(1)}ms`);
    });

    let _hbLast = performance.now();
    setInterval(() => {
      const now = performance.now();
      const gap = now - _hbLast;
      if (gap > 300) console.warn(`[hb-miss] ${gap.toFixed(0)}ms @ ${now.toFixed(0)}ms`);
      _hbLast = now;
    }, 100);
```

- [ ] **Step 2: Remover `[spike]` e `_dbgT0` do início de `update()`**

De:

```ts
  update(_time: number, delta: number) {
    if (delta > 50) console.warn(`[spike] frame=${Math.round(delta)}ms @ t=${Math.round(_time)}ms`);
    const _dbgT0 = performance.now();
    this.skillCheck.update(delta);
```

para:

```ts
  update(_time: number, delta: number) {
    this.skillCheck.update(delta);
```

- [ ] **Step 3: Remover `_dbgPreFog`/`_dbgFog`/`_dbgPlayers` e o warn `[slow]`**

De:

```ts
    const _dbgPreFog = performance.now() - _dbgT0;
    if (!this.ghost) this.fog.update(this.player, this.movement.lookAngle);
    const _dbgFog = performance.now() - _dbgT0 - _dbgPreFog;
    this.players.update(this.time.now, this._busySurvivorIds());
    const _dbgPlayers = performance.now() - _dbgT0 - _dbgPreFog - _dbgFog;
    if (_dbgPreFog > 8 || _dbgFog > 8 || _dbgPlayers > 4)
      console.warn(`[slow] preFog=${_dbgPreFog.toFixed(1)} fog=${_dbgFog.toFixed(1)} players=${_dbgPlayers.toFixed(1)}`);
```

para:

```ts
    if (!this.ghost) this.fog.update(this.player, this.movement.lookAngle);
    this.players.update(this.time.now, this._busySurvivorIds());
```

- [ ] **Step 4: Remover `_dbgHackT`/`_dbgHackDt` e o warn `[slow:hack]`**

De:

```ts
        const _dbgHackT = performance.now();
        this.hacking.updateSelf(
          delta, input, this.downed, this.beingHealed,
          this.myHealPct, this.escaped, this.survivorInfo,
        );
        const _dbgHackDt = performance.now() - _dbgHackT;
        if (_dbgHackDt > 4) console.warn(`[slow:hack] ${_dbgHackDt.toFixed(1)}ms`);
```

para:

```ts
        this.hacking.updateSelf(
          delta, input, this.downed, this.beingHealed,
          this.myHealPct, this.escaped, this.survivorInfo,
        );
```

### Task 3: GameScene — log de hack + VoiceManager

**Files:**
- Modify: `src/scenes/GameScene.ts:578`
- Modify: `src/game/VoiceManager.ts:29`, `:60`, `:162-168`

- [ ] **Step 1: Remover o log `[hack]` do handler `terminalUpdate`**

Deletar a linha:

```ts
      console.log(`[hack] terminalUpdate id=${id} progress=${progress.toFixed(2)} @ ${performance.now().toFixed(0)}ms`);
```

- [ ] **Step 2: Remover os logs `[voice] init start` / `init complete`**

Deletar as duas linhas em `VoiceManager.init()`:

```ts
    console.log(`[voice] init start @ ${performance.now().toFixed(0)}ms`);
```

```ts
    console.log(`[voice] init complete @ ${performance.now().toFixed(0)}ms`);
```

- [ ] **Step 3: Remover o log de áudio e a variável `audioT0`**

De:

```ts
    const audioT0 = performance.now();
    const audio    = new Audio();
    audio.srcObject = new MediaStream([consumer.track]);
    audio.autoplay  = true;
    audio.volume    = 0;
    document.body.appendChild(audio);
    console.log(`[voice] audio appended for ${socketId}, took ${(performance.now() - audioT0).toFixed(1)}ms @ ${performance.now().toFixed(0)}ms`);
```

para:

```ts
    const audio    = new Audio();
    audio.srcObject = new MediaStream([consumer.track]);
    audio.autoplay  = true;
    audio.volume    = 0;
    document.body.appendChild(audio);
```

### Task 4: Verificação

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: sem erros (sem variáveis órfãs).

- [ ] **Step 2: Grep de console no cliente**

Run: `grep -rn "console\." src --include="*.ts"`
Expected: nenhuma ocorrência.

- [ ] **Step 3: Grep do servidor inalterado**

Run: `grep -c "console\." server/index.ts server/voiceRouter.ts`
Expected: `server/index.ts:4` e `server/voiceRouter.ts:4` (logs operacionais e errors mantidos).
