# Fix: Erros de tipo socket.io-client

## Problema

O `socket.io-client` 4.8.3 tem um bug nas suas declarações de tipo ESM: `Socket` não pode ser usado como tipo e `io` não é reconhecido como export nomeado, independentemente da versão do TypeScript ou do uso de `import type`.

Erros que apareciam:

```
TS2749: 'Socket' refers to a value, but is being used as a type here.
TS2305: Module '"socket.io-client"' has no exported member 'io'.
```

O `skipLibCheck: true` no tsconfig não resolve, pois ele apenas pula a checagem do conteúdo dos `.d.ts` — não corrige a cadeia de re-exportação quebrada do pacote.

## Solução

Criado o arquivo `src/socketClient.ts` como shim local:

```ts
import socketIo from 'socket.io-client';
export { socketIo as io };
export type Socket = ReturnType<typeof socketIo>;
```

O import padrão (`socketIo`) funciona corretamente. `ReturnType<typeof socketIo>` extrai o tipo de instância de `Socket` sem depender das exportações nomeadas quebradas.

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/socketClient.ts` | Criado — shim de tipos |
| `src/game/CombatSystem.ts` | `socket.io-client` → `../socketClient` |
| `src/game/HackingSystem.ts` | `socket.io-client` → `../socketClient` |
| `src/game/ScratchMarkManager.ts` | `socket.io-client` → `../socketClient` |
| `src/game/VoiceManager.ts` | `socket.io-client` → `../socketClient` |
| `src/scenes/GameScene.ts` | `socket.io-client` → `../socketClient` |
| `src/scenes/LobbyScene.ts` | `socket.io-client` → `../socketClient` |

## Resultado

`npm run typecheck` passa sem erros no TypeScript 5.9.3.
