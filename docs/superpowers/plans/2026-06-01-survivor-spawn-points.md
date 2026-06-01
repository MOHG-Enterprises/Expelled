# Survivor Spawn Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o spawn de sobreviventes em círculo ao redor do portão boi por uma lista de posições distribuídas pela escola.

**Architecture:** Uma constante `SURVIVOR_SPAWN_POINTS` em `src/constants.ts` contém ~16 coordenadas pré-verificadas. `getSpawnPoint()` em `GameScene.ts` sorteia uma aleatoriamente via `Phaser.Math.RND.pick`. Nenhuma lógica de colisão em runtime — a segurança vem da lista curada.

**Tech Stack:** Phaser 3 (`Phaser.Math.RND`), TypeScript

---

## Arquivos modificados

- Modify: `src/constants.ts` — adiciona `SURVIVOR_SPAWN_POINTS`
- Modify: `src/scenes/GameScene.ts:362–372` — simplifica `getSpawnPoint()`

---

### Task 1: Adicionar constante SURVIVOR_SPAWN_POINTS

**Files:**
- Modify: `src/constants.ts`

- [ ] **Step 1: Abrir `src/constants.ts` e localizar a seção de gates (linha ~93)**

Encontre o bloco:
```ts
//  gates
export const GATE_POSITIONS: Record<GateId, { x: number; y: number }> = {
```

- [ ] **Step 2: Adicionar a constante antes dessa seção**

Insira o bloco abaixo imediatamente antes do comentário `//  gates`:

```ts
//  spawn points dos sobreviventes
export const SURVIVOR_SPAWN_POINTS: ReadonlyArray<{ x: number; y: number }> = [
  // Ala superior-esquerda
  { x: 640,  y: 448  },
  { x: 992,  y: 320  },
  { x: 1120, y: 640  },
  { x: 1312, y: 448  },
  // Corredor esquerdo
  { x: 672,  y: 1472 },
  { x: 672,  y: 2208 },
  { x: 672,  y: 2592 },
  { x: 1056, y: 2208 },
  // Ala inferior-esquerda
  { x: 672,  y: 3200 },
  { x: 1056, y: 3456 },
  { x: 1024, y: 4064 },
  // Ala superior-centro
  { x: 1760, y: 800  },
  { x: 1216, y: 1120 },
  { x: 1760, y: 1792 },
  // Ala direita
  { x: 2656, y: 1504 },
  { x: 2880, y: 2208 },
];
```

> Estas coordenadas são candidatas iniciais — serão verificadas na Task 3 e ajustadas se necessário.

- [ ] **Step 3: Verificar TypeScript**

```bash
npm run typecheck
```

Esperado: sem erros.

---

### Task 2: Atualizar getSpawnPoint() para usar a lista

**Files:**
- Modify: `src/scenes/GameScene.ts:362–372`

- [ ] **Step 1: Importar SURVIVOR_SPAWN_POINTS no topo do arquivo**

Encontre a linha de import de `src/constants.ts` (procure por `import {` ou `from '../constants'`). Adicione `SURVIVOR_SPAWN_POINTS` à lista de imports já existente.

Exemplo — se a linha atual for:
```ts
import { PLAYER_SPEED, INTERACT_RADIUS, ... } from '../constants';
```
Passa a ser:
```ts
import { PLAYER_SPEED, INTERACT_RADIUS, ..., SURVIVOR_SPAWN_POINTS } from '../constants';
```

- [ ] **Step 2: Substituir o corpo survivor de getSpawnPoint()**

Encontre a função (linha ~362):

```ts
private getSpawnPoint(role: Role): { x: number; y: number } {
  const centerX = this.mapWorldWidth * 0.5;
  const centerY = this.mapWorldHeight * 0.55;
  if (role === 'professor') return { x: centerX, y: centerY };

  const angle  = Phaser.Math.FloatBetween(Math.PI * 0.5, Math.PI * 1.5);
  const radius = 180;
  return {
    x: Phaser.Math.Clamp(centerX + Math.cos(angle) * radius, 64, this.mapWorldWidth - 64),
    y: Phaser.Math.Clamp(centerY + Math.sin(angle) * radius, 64, this.mapWorldHeight - 64),
  };
}
```

Substitua por:

```ts
private getSpawnPoint(role: Role): { x: number; y: number } {
  const centerX = this.mapWorldWidth * 0.5;
  const centerY = this.mapWorldHeight * 0.55;
  if (role === 'professor') return { x: centerX, y: centerY };
  return Phaser.Math.RND.pick(SURVIVOR_SPAWN_POINTS);
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npm run typecheck
```

Esperado: sem erros.

---

### Task 3: Verificar spawn points em jogo e ajustar coordenadas

**Files:**
- Modify: `src/constants.ts` — ajuste de coordenadas conforme necessário

- [ ] **Step 1: Iniciar o servidor de desenvolvimento**

```bash
npm run dev
```

Abrir o jogo no browser em `http://localhost:5173`.

- [ ] **Step 2: Ativar debug de colisão**

Entrar em uma sala como sobrevivente e pressionar **C** para ativar o overlay vermelho de colisão.

- [ ] **Step 3: Verificar cada coordenada da lista**

Para cada ponto em `SURVIVOR_SPAWN_POINTS`, temporariamente force o spawn naquela coordenada retornando-a diretamente de `getSpawnPoint()` e reinicie a partida. Ou, mais rápido: mova o personagem manualmente até as coordenadas e observe se o overlay vermelho está presente (= dentro de parede).

Forma alternativa: no console do browser após iniciar o jogo:

```js
// Ver posição atual do player
scene.player.x  // onde 'scene' é a GameScene ativa
scene.player.y
```

Use o WASD para navegar até cada coordenada alvo e confirme visualmente que a posição está em área aberta.

- [ ] **Step 4: Corrigir coordenadas problemáticas**

Se um ponto estiver em parede ou outdoor com árvores, ajuste a coordenada em `SURVIVOR_SPAWN_POINTS` em incrementos de 32px até estar em área caminhável interna. Regras:
- Mínimo 200px de qualquer terminal: t1(2140,2520), t2(785,86), t3(848,1830), t4(780,3720), t5(1510,1430)
- Fora da zona do portão boi: x ∈ [1800,2300] e y ∈ [2300,2700] — evitar essa região
- Apenas interior da escola (sem áreas externas com árvores)

- [ ] **Step 5: Testar múltiplos spawns**

Entrar com 2–3 abas como sobrevivente. Confirmar que:
- Todos os sobreviventes aparecem em posições diferentes das do professor
- Nenhum aparece dentro de parede
- Nenhum aparece dentro da área do portão boi

- [ ] **Step 6: Commit**

```bash
git add src/constants.ts src/scenes/GameScene.ts
git commit -m "feat: survivor spawn points spread across school map"
```
