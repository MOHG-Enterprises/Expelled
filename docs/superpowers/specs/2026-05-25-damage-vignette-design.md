# Damage Vignette — Design Spec

## Overview

Adicionar um efeito visual de cantos vermelhos piscando quando o jogador (sobrevivente) leva dano. O efeito tem duas camadas: uma **vinheta persistente** cuja intensidade reflete o HP atual, e um **flash de impacto** que pulsa ao receber dano.

## Componente

`DamageVignette` implementado diretamente dentro de `HUD` — não é uma classe separada, pois é simples o suficiente para viver como campos e métodos privados.

Um único `Phaser.GameObjects.Graphics` com `setScrollFactor(0)` e depth 60 (acima de todo o HUD existente). Desenhado uma vez no `build()`: quatro triângulos vermelhos preenchidos nos cantos da tela (top-left, top-right, bottom-left, bottom-right), cada um com ~160px de alcance a partir do canto. O alpha do objeto inteiro controla a visibilidade.

### Alpha por estado

| Estado       | Alpha base |
|--------------|------------|
| HP 2 (cheio) | 0.00       |
| HP 1         | 0.38       |
| Downed       | 0.55       |

### Flash de impacto

Ao receber dano, um tween sobe o alpha para `alphaBase + 0.45` em 80ms e volta ao `alphaBase` em 350ms (ease `Quad.easeOut`). Se um tween estiver ativo, ele é interrompido antes de iniciar o novo.

## API pública em HUD

```ts
setDamageVignette(hp: number, downed: boolean): void
flashDamageVignette(): void
```

`setDamageVignette` atualiza o alpha base e para qualquer tween em curso.  
`flashDamageVignette` dispara o pulso de impacto sobre o alpha base atual.

## Integração em GameScene

Arquivo: `src/scenes/GameScene.ts`, método `_bindPlayerState`.

- `playerHit` (targetId === socket.id): chamar `setDamageVignette(hp, false)` + `flashDamageVignette()`
- `playerDowned` (id === socket.id): chamar `setDamageVignette(0, true)` + `flashDamageVignette()`
- `playerRevived` (id === socket.id): chamar `setDamageVignette(1, false)` sem flash
- Reset de jogo (`gameReset`): chamar `setDamageVignette(2, false)` sem flash

## Restrições

- O efeito só se aplica ao jogador local (sobrevivente). O professor nunca recebe dano, então nenhuma lógica de role-guard é necessária — o evento `playerHit` com `targetId === socket.id` só chega quando é o próprio jogador.
- A tela tem resolução fixa de 800×600 (conforme HUD existente). As coordenadas dos triângulos são hardcoded para esse tamanho.
- Sem assets externos — apenas `Phaser.GameObjects.Graphics`.
