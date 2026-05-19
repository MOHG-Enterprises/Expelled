# FOV Raycasting com Oclusão de Paredes

**Data:** 2026-05-19  
**Status:** Aprovado

---

## Problema

O sistema atual de FOV (`FogOfWar.ts`) desenha um círculo simples (survivor) ou um arco de cone (professor) como máscara. Nenhum dos dois tem consciência das paredes — a visão atravessa qualquer tile de colisão, tornando o jogo desequilibrado e visualmente incorreto.

---

## Solução

Substituir a forma geométrica simples por um **polígono de visibilidade** calculado via **DDA raycasting** contra uma grade de tiles sólidos. A grade é construída uma vez a partir de um `Set` configurável de layer names, separado do `COLLISION_LAYERS` de física.

---

## Arquitetura

### Grade de sólidos (`solidGrid`)

- Tipo: `Uint8Array` linear (row-major) de dimensões `mapWidth × mapHeight` tiles
- Construída em `setup()` iterando todas as layers em `FOV_BLOCKING_LAYERS`
- Um tile é marcado sólido (`1`) se tiver `index >= 0` em qualquer dessas layers
- Tamanho: 128 × 144 = 18.432 bytes — cabe inteiro em cache L1/L2
- Método público `rebuildGrid(map)` para reconstrução sob demanda

### Constante configurável

Em `src/constants.ts`:

```typescript
export const FOV_BLOCKING_LAYERS = new Set([
  'Parede',
  'OBSTACULOS',
  'PORTAO',
]);
```

Independente de `COLLISION_LAYERS` — física e visão podem ter conjuntos diferentes. Fácil de editar enquanto o mapa está em desenvolvimento.

### DDA Raycasting

Para cada frame, `update()` dispara raios dentro do FOV:

- **Survivor** (círculo, 360°): 360 raios espaçados 1°
- **Professor** (cone, 80°): 120 raios espaçados ~0.67°

Algoritmo por raio:
1. Converter posição world do player para coordenada tile: `tx = worldX / TILE_WORLD_SIZE`, `ty = worldY / TILE_WORLD_SIZE` onde `TILE_WORLD_SIZE = 32` (16 × MAP_SCALE 2)
2. DDA step-by-step na grade até encontrar `solidGrid[ty][tx] === 1` ou exceder `fovRadius` (= `FOV_PROFESSOR` 460px ou `FOV_SURVIVOR` 280px, conforme o papel)
3. Converter ponto de parada de volta para screen space
4. Acumular em array de pontos

### Polígono da máscara

Os endpoints dos raios formam um polígono fechado desenhado via `g.fillPoints(points, true)` no `maskGraphics`, substituindo o `fillCircle` / `arc` atual. O resto do sistema de máscara (overlay + geometry mask + invertAlpha) permanece igual.

---

## Fluxo de dados

```
buildTilemap() em GameScene
        ↓
fog.setup(role, map)
        ↓
  buildSolidGrid(map)   ← lê FOV_BLOCKING_LAYERS de src/constants.ts
        ↓
solidGrid: Uint8Array   ← reutilizado a cada frame
        ↓
fog.update(player, lookAngle)  ← chamado todo frame
        ↓
  DDA × N raios → array de pontos
        ↓
  g.fillPoints(points, true)  → polígono na máscara
```

---

## Estimativa de custo por frame

| Papel | Raios | Passos DDA (médio) | Checks de array |
|-------|-------|--------------------|-----------------|
| Survivor | 360 | ~20 | ~7.200 |
| Professor | 120 | ~30 | ~3.600 |

Todos são accesses simples em `Uint8Array` — sem chamadas de API Phaser por raio, sem alocações. Negligível a 60 fps.

---

## Mudanças por arquivo

| Arquivo | Mudança |
|---------|---------|
| `src/constants.ts` | Adicionar `FOV_BLOCKING_LAYERS`, `TILE_WORLD_SIZE` |
| `src/game/FogOfWar.ts` | `setup()` aceita `map`; adicionar `buildSolidGrid()`, `rebuildGrid()`; reescrever `update()` com DDA |
| `src/scenes/GameScene.ts` | Passar `this.map` no `fog.setup(role, this.map)` |

---

## Fora de escopo

- Portas dinâmicas (abrir/fechar em tempo real) — grade é estática; `rebuildGrid()` cobre reconstrução manual se necessário
- Gradiente / soft edges nas bordas do FOV
- Iluminação ambiente parcial (escuridão não-total)

---

## Notas de implementação

- `solidGrid` usa `Uint8Array` (não `boolean[][]`) para evitar boxing e manter acesso cache-friendly
- Screen space conversion deve aplicar `cam.zoom` e `cam.scrollX/Y`, igual ao código atual
- O círculo de 36px de `fillCircle(sx, sy, 36)` do professor (suavização do ponto central) pode ser mantido
- Se o tile do player for marcado sólido (posição inválida), nenhum raio é bloqueado no ponto de origem — verificar tile de origem antes do DDA
