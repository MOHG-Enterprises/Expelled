# Being Healed Blocks Actions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir que um jogador que está sendo curado por outro possa iniciar a cura de um terceiro, fechando o bug de cura mútua simultânea.

**Architecture:** Dois guards adicionados no servidor (`server/index.ts`) tornam o bloqueio autoritativo; uma condição adicional no cliente (`src/game/HackingSystem.ts`) garante que o UI reflita o estado correto sem depender de rejeição silenciosa do servidor.

**Tech Stack:** TypeScript, Node.js/Socket.io (servidor), Phaser 3 (cliente)

---

### Task 1: Guards do servidor em `setHealing` e `healProgress`

**Files:**
- Modify: `server/index.ts:255` (handler `setHealing`)
- Modify: `server/index.ts:295` (handler `healProgress`)

- [ ] **Step 1: Adicionar guard em `setHealing`**

Em [server/index.ts](server/index.ts), linha 255, após a linha:
```ts
if (!healer || healer.role !== 'survivor' || healer.expelled || healer.escaped) return;
```
Inserir:
```ts
if (healer.beingHealed) return;
```

O bloco completo ficará assim (linhas 254–256):
```ts
const healer = state.players[socket.id];
if (!healer || healer.role !== 'survivor' || healer.expelled || healer.escaped) return;
if (healer.beingHealed) return;
```

- [ ] **Step 2: Adicionar guard em `healProgress`**

Em [server/index.ts](server/index.ts), após a linha 295 (`const isSelf = targetId === socket.id;`), inserir:
```ts
if (!isSelf && healer.beingHealed) return;
```

O bloco completo ficará assim (linhas 295–298):
```ts
const isSelf = targetId === socket.id;
if (!isSelf && healer.beingHealed) return;
if (isSelf && !target.downed) return;
if (isSelf && target.healPct >= HEAL_SELF_CAP) return;
```

O `!isSelf` preserva a auto-cura passiva do jogador caído — não deve ser bloqueada pelo fato de outro jogador estar tentando curar o caído ao mesmo tempo.

- [ ] **Step 3: Verificar que o TypeScript compila sem erros**

```bash
npm run typecheck
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add server/index.ts
git commit -m "fix: bloquear cura por jogador que esta sendo curado (servidor)"
```

---

### Task 2: Guard do cliente em `HackingSystem.updateSelf`

**Files:**
- Modify: `src/game/HackingSystem.ts:126`

- [ ] **Step 1: Adicionar `!beingHealed` na condição de `healTarget`**

Em [src/game/HackingSystem.ts](src/game/HackingSystem.ts), linha 126, alterar:
```ts
const healTarget = eHeld && !downed ? this._nearestHealablePlayer(survivorInfo) : null;
```
Para:
```ts
const healTarget = eHeld && !downed && !beingHealed ? this._nearestHealablePlayer(survivorInfo) : null;
```

O parâmetro `beingHealed` (linha 118) já existe na assinatura do método; esta é a única mudança necessária.

- [ ] **Step 2: Verificar que o TypeScript compila sem erros**

```bash
npm run typecheck
```

Esperado: sem erros.

- [ ] **Step 3: Testar manualmente**

```bash
npm run dev
```

Abrir dois clientes no navegador, entrar na mesma sala como dois survivors. Baixar o HP de ambos para 1 (ou usar o professor para derrubar um). Tentar reproduzir o bug:
- Jogador A aperta E em cima de Jogador B
- Ao mesmo tempo, Jogador B aperta E em cima de Jogador A

**Resultado esperado:** Apenas um dos jogadores fica com `beingHealed = true`. O outro não consegue iniciar cura — o ícone de progresso de cura não aparece no alvo.

**Resultado anterior (bug):** Ambos curavam um ao outro simultaneamente.

- [ ] **Step 4: Commit**

```bash
git add src/game/HackingSystem.ts
git commit -m "fix: bloquear UI de cura quando jogador esta sendo curado"
```
