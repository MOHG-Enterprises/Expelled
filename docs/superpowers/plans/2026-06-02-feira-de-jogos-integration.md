# Feira de Jogos Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the Feira de Jogos rewards API into PostGameScene, giving each player tijolinhos based on their role, outcome, and individual performance stats.

**Architecture:** A pure function in `src/game/rewards.ts` calculates the reward breakdown (lines + total) from stats and winner. `PostGameScene` calls this on creation, renders the breakdown below the stat boxes, and triggers Google One Tap OAuth to send the credit via `POST /api/v2/credit`. Status (sending/done/error) is displayed inline in the scene.

**Tech Stack:** Phaser 3, TypeScript, axios (new), @types/google.accounts (new devDep), Google Identity Services SDK (script tag)

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install axios and @types/google.accounts**

```bash
npm install axios
npm install --save-dev @types/google.accounts
```

Expected output: two packages added, no errors.

- [ ] **Step 2: Verify installs**

```bash
ls node_modules/axios && ls node_modules/@types/google.accounts
```

Expected: both directories exist.

---

### Task 2: Configure project (tsconfig, index.html, constants)

**Files:**
- Modify: `tsconfig.json`
- Modify: `index.html`
- Modify: `src/constants.ts`

- [ ] **Step 1: Add google.accounts types to tsconfig.json**

Replace the contents of `tsconfig.json` with:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "lib": ["ES2020", "DOM"],
    "skipLibCheck": true,
    "types": ["google.accounts"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 2: Add Google Identity Services script tag to index.html**

Replace the contents of `index.html` with:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <title>Expelled</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #1a1a2e; }
    #game { position: absolute; width: 100%; height: 100%; }
    canvas { display: block; }
  </style>
</head>
<body>
  <div id="game"></div>
  <script src="https://accounts.google.com/gsi/client" async></script>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 3: Add FEIRA_PRODUCT_ID to src/constants.ts**

Add this block at the end of `src/constants.ts` (after the GATE_TILE_RANGES block):

```typescript
export const FEIRA_PRODUCT_ID = 0; // TODO: set to the product ID assigned by Feira de Jogos after registration
```

- [ ] **Step 4: Verify typecheck still passes**

```bash
npm run typecheck
```

Expected: exits 0, no errors.

---

### Task 3: Create src/game/rewards.ts

**Files:**
- Create: `src/game/rewards.ts`

- [ ] **Step 1: Create the rewards module**

Create `src/game/rewards.ts` with the following content:

```typescript
export interface RewardLine {
  label: string;
  amount: number;
}

export interface RewardBreakdown {
  lines: RewardLine[];
  total: number;
}

interface StatsInput {
  role: 'survivor' | 'professor';
  outcome?: 'escaped' | 'expelled' | 'downed';
  hackContributed?: number;
  healsGiven?: number;
  hitsLanded?: number;
  downedCount?: number;
  expelledCount?: number;
}

export function calculateReward(stats: StatsInput, winner: string): RewardBreakdown {
  const lines: RewardLine[] = [];

  const add = (label: string, amount: number) => {
    if (amount > 0) lines.push({ label, amount });
  };

  add('Participação', 15);

  if (stats.role === 'survivor') {
    if (stats.outcome === 'escaped')       add('Fugiu', 45);
    else if (stats.outcome === 'downed')   add('Não foi expulso', 15);
    else if (stats.outcome === 'expelled') add('Foi expulso', 5);

    const hackPct   = stats.hackContributed ?? 0;
    const hackBonus = Math.round(hackPct * 0.3);
    if (hackBonus > 0) add(`Terminais (${hackPct}%)`, hackBonus);

    add('Curas dadas', (stats.healsGiven ?? 0) * 5);
  } else {
    add(winner === 'professor' ? 'Venceu' : 'Perdeu', winner === 'professor' ? 80 : 10);
    add('Expulsões', (stats.expelledCount ?? 0) * 15);
    add('Derrubadas', (stats.downedCount  ?? 0) * 5);
    add('Ataques acertados', stats.hitsLanded ?? 0);
  }

  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  return { lines, total };
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: exits 0, no errors.

---

### Task 4: Update PostGameScene with breakdown rendering and Feira integration

**Files:**
- Modify: `src/scenes/PostGameScene.ts`

- [ ] **Step 1: Replace the full contents of PostGameScene.ts**

```typescript
import Phaser from 'phaser';
import axios from 'axios';
import type { Socket } from '../socketClient';
import { calculateReward, type RewardBreakdown } from '../game/rewards';
import { FEIRA_PRODUCT_ID } from '../constants';

interface PlayerStatSnapshot {
  role: 'survivor' | 'professor';
  outcome?: 'escaped' | 'expelled' | 'downed';
  hackContributed?: number;
  timesDown?: number;
  healsGiven?: number;
  hitsLanded?: number;
  downedCount?: number;
  expelledCount?: number;
}

interface PostGameData {
  winner: string;
  stats:  Record<string, PlayerStatSnapshot>;
  myId:   string;
  socket: Socket;
}

const PROFESSOR_RATINGS: [number, string][] = [
  [3, 'Ditador da Sala'],
  [2, 'Professor Implacável'],
  [1, 'Professor Severo'],
  [0, 'Plano de Aula Ignorado'],
];

const OUTCOME_LABEL: Record<'escaped' | 'expelled' | 'downed', string> = {
  escaped:  'FUGIU!',
  expelled: 'EXPULSO',
  downed:   'DERRUBADO',
};

const OUTCOME_COLOR: Record<'escaped' | 'expelled' | 'downed', string> = {
  escaped:  '#00e676',
  expelled: '#ff4444',
  downed:   '#ffb300',
};

type FeiraStatus = 'idle' | 'pending' | 'done' | 'error';

export class PostGameScene extends Phaser.Scene {
  private contentObjects: Phaser.GameObjects.GameObject[] = [];
  private _data: PostGameData | null = null;
  private _feiraStatus: FeiraStatus = 'idle';
  private _feiraMessage = '';
  private _feiraBreakdown: RewardBreakdown | null = null;

  constructor() {
    super('PostGameScene');
  }

  create() {
    this.cameras.main.setBackgroundColor('#1a1a2e');
    this._data = this.registry.get('postGameData') as PostGameData;
    const data = this._data;
    this._feiraStatus = 'idle';
    this._feiraMessage = '';
    this._feiraBreakdown = null;

    this._build(this.scale.width, this.scale.height, data);

    const onResize = (gameSize: Phaser.Structs.Size) => {
      this._clearContent();
      this._build(gameSize.width, gameSize.height, data);
    };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));

    const my = data.stats[data.myId];
    if (my) this._initFeira(data, my);
  }

  private _clearContent(): void {
    this.input.keyboard?.off('keydown-ENTER');
    this.input.keyboard?.off('keydown-SPACE');
    this.contentObjects.forEach(o => o.destroy());
    this.contentObjects = [];
  }

  private _build(width: number, height: number, data: PostGameData): void {
    const my = data.stats[data.myId];

    if (!my) {
      this._renderButton(width, height * 0.75, data.socket);
      return;
    }

    const { label, color } = this._getResult(data, my);

    this.contentObjects.push(
      this.add.text(width / 2, height * 0.22, label, {
        fontSize: '48px',
        color,
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(0.5),
    );

    this._renderStatBoxes(width, height, my);

    let bottomY = height * 0.62;

    if (this._feiraBreakdown) {
      bottomY = this._renderRewardBreakdown(width, bottomY, this._feiraBreakdown);
      bottomY += 12;
    }

    if (this._feiraStatus !== 'idle') {
      const statusColor =
        this._feiraStatus === 'done'  ? '#00e676' :
        this._feiraStatus === 'error' ? '#ff4444' : '#aaaacc';

      this.contentObjects.push(
        this.add.text(width / 2, bottomY, this._feiraMessage, {
          fontSize: '14px',
          color: statusColor,
          fontFamily: 'monospace',
        }).setOrigin(0.5),
      );
      bottomY += 28;
    }

    this._renderButton(width, bottomY + 8, data.socket);
  }

  private _getResult(data: PostGameData, my: PlayerStatSnapshot): { label: string; color: string } {
    if (my.role === 'professor') {
      const expelled = my.expelledCount ?? 0;
      const [, lbl] = PROFESSOR_RATINGS.find(([min]) => expelled >= min) ?? [0, 'Plano de Aula Ignorado'];
      return { label: lbl, color: data.winner === 'professor' ? '#4fc3f7' : '#e94560' };
    }
    const outcome = my.outcome ?? 'downed';
    return { label: OUTCOME_LABEL[outcome], color: OUTCOME_COLOR[outcome] };
  }

  private _getStatBoxes(my: PlayerStatSnapshot): { label: string; value: string }[] {
    if (my.role === 'professor') {
      return [
        { label: 'ATAQUES',    value: String(my.hitsLanded   ?? 0) },
        { label: 'DERRUBADOS', value: String(my.downedCount   ?? 0) },
        { label: 'EXPULSOS',   value: String(my.expelledCount ?? 0) },
      ];
    }
    return [
      { label: 'TERMINAIS', value: `${my.hackContributed ?? 0}%` },
      { label: 'DERRUBADO', value: `${my.timesDown ?? 0}x` },
      { label: 'CURAS',     value: String(my.healsGiven ?? 0) },
    ];
  }

  private _renderStatBoxes(width: number, height: number, my: PlayerStatSnapshot): void {
    const boxes  = this._getStatBoxes(my);
    const boxW   = 150;
    const boxH   = 80;
    const gap    = 20;
    const totalW = boxes.length * boxW + (boxes.length - 1) * gap;
    const startX = (width - totalW) / 2;
    const by     = height * 0.46;

    boxes.forEach(({ label, value }, i) => {
      const bx = startX + i * (boxW + gap);

      this.contentObjects.push(
        this.add.graphics()
          .fillStyle(0x2a2a4e, 1)
          .fillRect(bx, by, boxW, boxH),
      );

      this.contentObjects.push(
        this.add.text(bx + boxW / 2, by + 20, value, {
          fontSize: '26px',
          color: '#e0e0ff',
          fontFamily: 'monospace',
        }).setOrigin(0.5),
      );

      this.contentObjects.push(
        this.add.text(bx + boxW / 2, by + 58, label, {
          fontSize: '11px',
          color: '#666688',
          fontFamily: 'monospace',
          letterSpacing: 2,
        }).setOrigin(0.5),
      );
    });
  }

  private _renderRewardBreakdown(width: number, startY: number, breakdown: RewardBreakdown): number {
    const lineH = 18;
    const col1X = width / 2 - 90;
    const col2X = width / 2 + 90;

    breakdown.lines.forEach((line, i) => {
      const y = startY + i * lineH;
      this.contentObjects.push(
        this.add.text(col1X, y, line.label, {
          fontSize: '13px',
          color: '#888899',
          fontFamily: 'monospace',
        }).setOrigin(0, 0.5),
      );
      this.contentObjects.push(
        this.add.text(col2X, y, `+${line.amount} tj`, {
          fontSize: '13px',
          color: '#e0e0ff',
          fontFamily: 'monospace',
        }).setOrigin(1, 0.5),
      );
    });

    const divY = startY + breakdown.lines.length * lineH + 6;
    this.contentObjects.push(
      this.add.graphics()
        .lineStyle(1, 0x444466, 1)
        .lineBetween(col1X, divY, col2X, divY),
    );

    const totalY = divY + 14;
    this.contentObjects.push(
      this.add.text(col1X, totalY, 'Total', {
        fontSize: '14px',
        color: '#aaaacc',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5),
    );
    this.contentObjects.push(
      this.add.text(col2X, totalY, `+${breakdown.total} tj`, {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(1, 0.5),
    );

    return totalY + 10;
  }

  private _renderButton(width: number, y: number, socket: Socket): void {
    const goToLobby = () => {
      socket.disconnect();
      this.scene.start('LobbyScene');
    };

    const btn = this.add.text(width / 2, y, '[ JOGAR DE NOVO ]', {
      fontSize: '16px',
      color: '#aaaacc',
      fontFamily: 'monospace',
      letterSpacing: 4,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setColor('#e0e0ff'));
    btn.on('pointerout',  () => btn.setColor('#aaaacc'));
    btn.on('pointerdown', goToLobby);

    this.input.keyboard?.on('keydown-ENTER', goToLobby);
    this.input.keyboard?.on('keydown-SPACE', goToLobby);

    this.contentObjects.push(btn);
  }

  private _initFeira(data: PostGameData, my: PlayerStatSnapshot): void {
    this._feiraBreakdown = calculateReward(my, data.winner);
    this._clearContent();
    this._build(this.scale.width, this.scale.height, data);

    const rebuild = () => {
      this._clearContent();
      this._build(this.scale.width, this.scale.height, data);
    };

    google.accounts.id.initialize({
      client_id: '331191695151-ku8mdhd76pc2k36itas8lm722krn0u64.apps.googleusercontent.com',
      callback: (res: google.accounts.id.CredentialResponse) => {
        this._feiraStatus = 'pending';
        this._feiraMessage = 'Enviando crédito...';
        rebuild();

        axios
          .post(
            'https://feira-de-jogos.dev.br/api/v2/credit',
            { product: FEIRA_PRODUCT_ID, value: this._feiraBreakdown!.total },
            { headers: { Authorization: `Bearer ${res.credential}` } },
          )
          .then(() => {
            this._feiraStatus = 'done';
            this._feiraMessage = `✓ +${this._feiraBreakdown!.total} tijolinhos adicionados!`;
          })
          .catch(() => {
            this._feiraStatus = 'error';
            this._feiraMessage = 'Erro ao adicionar crédito :(';
          })
          .finally(rebuild);
      },
    });

    google.accounts.id.prompt();
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: exits 0, no errors.

---

### Task 5: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Expected: server and Vite client both start without errors.

- [ ] **Step 2: Play through a game to the PostGameScene**

Open the game in a browser, join a room, play until a game-over condition, and confirm:
1. The reward breakdown table appears below the stat boxes (label column left, `+N tj` right, divider, Total row)
2. Google One Tap popup appears
3. After authentication, "Enviando crédito..." appears briefly
4. If the API call succeeds: "✓ +N tijolinhos adicionados!" appears in green
5. If the API call fails (e.g. FEIRA_PRODUCT_ID is 0): "Erro ao adicionar crédito :(" appears in red
6. "[ JOGAR DE NOVO ]" button still works regardless of API result

- [ ] **Step 3: Verify resize behavior**

Resize the browser window while on the PostGameScene. Confirm the breakdown and status text re-render correctly without duplicate elements.

---

### Notes

- `FEIRA_PRODUCT_ID` in `src/constants.ts` is currently `0` — update it to the actual product ID once the game is registered with the Feira de Jogos.
- `tj` is used instead of the 🧱 emoji in Phaser text objects to avoid potential monospace font rendering issues. Can be swapped to `🧱` if it renders correctly in your environment.
