# Survivor Spawn Points — Design Spec
Date: 2026-06-01

## Problem

Sobreviventes atualmente spawnam num círculo de raio 180px centrado no mesmo ponto do professor (2048, 2534) — dentro do portão boi. Com o portão fechado no início da partida para dar tempo de fuga, sobreviventes também ficam presos dentro, tornando a mecânica inútil.

## Objetivo

Sobreviventes spawnam em posições aleatórias espalhadas pela escola, fora do portão boi e longe de terminais, sem risco de spawnar dentro de paredes.

## Abordagem: Lista hardcoded de candidatos

Uma constante `SURVIVOR_SPAWN_POINTS` define ~15–20 coordenadas em pixels do mundo, manualmente verificadas com o modo debug de colisão do jogo (tecla C). Cada sobrevivente sorteia uma posição aleatória da lista no início da partida.

## Regras de posicionamento dos candidatos

- Mínimo 200px de qualquer terminal (t1–t5)
- Fora da área do portão boi (~x: 1800–2300, y: 2300–2700)
- Apenas áreas internas caminhávies da escola (sem exterior com árvores)
- Alinhados a tiles de 32px para facilitar verificação visual

## Regiões cobertas

As posições candidatas se distribuem por:
- Ala superior-esquerda (4–6 pontos)
- Corredor esquerdo (próximo às gates g1/g2, deslocados) (3–4 pontos)
- Ala inferior-esquerda (próximo a t4, deslocado) (3–4 pontos)
- Ala superior-centro (próximo a t5, deslocado) (3–4 pontos)
- Outros corredores e alas direitas (2–3 pontos)

As coordenadas exatas são definidas durante a implementação e validadas em jogo. Se alguma cair em parede, ajusta-se incrementalmente.

## Mudanças de código

### `src/constants.ts`
Adiciona `SURVIVOR_SPAWN_POINTS: ReadonlyArray<{x: number, y: number}>` com a lista de candidatos.

### `src/scenes/GameScene.ts` — `getSpawnPoint()`
```ts
// antes
const angle  = Phaser.Math.FloatBetween(Math.PI * 0.5, Math.PI * 1.5);
const radius = 180;
return {
  x: Phaser.Math.Clamp(centerX + Math.cos(angle) * radius, 64, this.mapWorldWidth - 64),
  y: Phaser.Math.Clamp(centerY + Math.sin(angle) * radius, 64, this.mapWorldHeight - 64),
};

// depois
return Phaser.Math.RND.pick(SURVIVOR_SPAWN_POINTS);
```

## Casos de borda

- **Dois sobreviventes no mesmo ponto**: permitido. Com 15+ candidatos e máximo ~4 sobreviventes a probabilidade é baixa e o impacto é mínimo.
- **Posição em parede**: prevenido pela verificação manual da lista durante implementação.
- **Professor**: spawn não muda — continua em (centerX, centerY) dentro do portão boi.

## Referências de mapa

| Ponto | World px | Tile |
|---|---|---|
| Professor (portão boi) | (2048, 2534) | (64, 79) |
| Terminal t1 | (2140, 2520) | (66, 78) |
| Terminal t2 | (785, 86) | (24, 2) |
| Terminal t3 | (848, 1830) | (26, 57) |
| Terminal t4 | (780, 3720) | (24, 116) |
| Terminal t5 | (1510, 1430) | (47, 44) |
| Gate g1 | (464, 2222) | (14, 69) |
| Gate g2 | (464, 1722) | (14, 53) |
