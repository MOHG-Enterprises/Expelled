import Phaser from 'phaser';
import type { Socket } from '../socketClient';
import {
  INTERACT_RADIUS,
  HACK_PASSIVE_RATE_MS, HACK_PASSIVE_TICK, HACK_GREAT_BONUS, HACK_FAIL_LOCK_MS,
  HEAL_PASSIVE_TICK, HEAL_PASSIVE_RATE_MS, HEAL_GREAT_BONUS,
  HEAL_SELF_RATE_FACTOR, HEAL_SELF_CAP, HEAL_FAIL_LOCK_MS,
  GATE_TICK_MS,
} from '../constants';
import type { GateId, TerminalId } from '../types';
import type { InputState } from './InputManager';
import type { TerminalManager } from './TerminalManager';
import type { ExitGateManager } from './ExitGateManager';
import type { PlayerManager } from './PlayerManager';
import type { HUD } from './HUD';
import type { SkillCheck } from './SkillCheck';
import type { InteractionPromptManager } from './InteractionPromptManager';

export interface SurvivorInfo {
  hp: number;
  downed: boolean;
  expelled: boolean;
  escaped: boolean;
  healPct: number;
}

export class HackingSystem {
  private scene:          Phaser.Scene;
  private player:         Phaser.Physics.Arcade.Sprite;
  private socket:         Socket;
  private terminals:      TerminalManager;
  private gates:          ExitGateManager;
  private players:        PlayerManager;
  private hud:            HUD;
  private skillCheck:     SkillCheck;
  private promptManager: InteractionPromptManager;

  private hackingTerminal:    TerminalId | null = null;
  private prevHackingEmitted: TerminalId | null = null;
  private hackPassiveTimer    = 0;
  private hackHoldTimer       = 0;
  private hackNextThreshold   = 0;
  private hackTimerTerminal:  TerminalId | null = null;
  private hackLockUntil       = 0;
  private interactionActive = false;

  private healingTarget:      string | null = null;
  private prevHealingEmitted: string | null = null;
  private healPassiveTimer    = 0;
  private healHoldTimer       = 0;
  private healNextThreshold   = 0;
  private healLockUntil       = 0;

  private openingGate:   GateId | null = null;
  private gateOpenTimer  = 0;

  constructor(
    scene:          Phaser.Scene,
    player:         Phaser.Physics.Arcade.Sprite,
    socket:         Socket,
    terminals:      TerminalManager,
    gates:          ExitGateManager,
    players:        PlayerManager,
    hud:            HUD,
    skillCheck:     SkillCheck,
    promptManager:  InteractionPromptManager,
  ) {
    this.scene          = scene;
    this.player         = player;
    this.socket         = socket;
    this.terminals      = terminals;
    this.gates          = gates;
    this.players        = players;
    this.hud            = hud;
    this.skillCheck     = skillCheck;
    this.promptManager  = promptManager;
    this.hackNextThreshold = Phaser.Math.Between(6667, 11667);
    this.healNextThreshold = Phaser.Math.Between(833, 1667);
  }

  get activeHackingTerminal(): TerminalId | null { return this.hackingTerminal; }
  get activeHealingTarget():   string | null     { return this.healingTarget; }

  reset() {
    this.hackingTerminal       = null;
    this.prevHackingEmitted    = null;
    this.hackPassiveTimer      = 0;
    this.hackHoldTimer         = 0;
    this.hackTimerTerminal     = null;
    this.hackNextThreshold     = Phaser.Math.Between(6667, 11667);
    this.hackLockUntil         = 0;
    this.interactionActive     = false;
    this.healingTarget         = null;
    this.prevHealingEmitted    = null;
    this.healPassiveTimer      = 0;
    this.healHoldTimer         = 0;
    this.healNextThreshold     = Phaser.Math.Between(833, 1667);
    this.healLockUntil         = 0;
    this.openingGate           = null;
    this.gateOpenTimer         = 0;
    this.promptManager.hide();
  }

  onHackLockApplied() {
    this.hackLockUntil = this.scene.time.now + HACK_FAIL_LOCK_MS;
  }

  onHealLockApplied() {
    this.healLockUntil = this.scene.time.now + HEAL_FAIL_LOCK_MS;
  }

  onBeingHealedStart() {
    this.healPassiveTimer = 0;
    this.healHoldTimer    = 0;
  }

  clearHealingState() {
    this.healingTarget      = null;
    this.prevHealingEmitted = null;
    this.healPassiveTimer   = 0;
    this.healHoldTimer      = 0;
  }

  updateSelf(
    delta:       number,
    input:       InputState,
    downed:      boolean,
    beingHealed: boolean,
    myHealPct:   number,
    escaped:     boolean,
    survivorInfo: ReadonlyMap<string, SurvivorInfo>,
  ) {
    // ── Interaction prompt ────────────────────────────────────────────────────
    const healableNearby = !downed && !beingHealed
      ? this._nearestHealablePlayer(survivorInfo)
      : null;
    const nearT = !downed ? this.terminals.nearest(this.player.x, this.player.y) : null;
    const nearS = !downed ? this.gates.getNearestActiveSwitch(this.player.x, this.player.y) : null;

    if (this.interactionActive && !healableNearby && !nearT && !nearS) {
      this.interactionActive = false;
    }
    if (input.actionJust && (healableNearby || nearT || nearS) && !this.interactionActive) {
      this.interactionActive = true;
    }
    if (input.intendedToMove) {
      if (this.interactionActive && this.skillCheck.active) this.skillCheck.cancel();
      this.interactionActive = false;
    }

    if (healableNearby) {
      const pos = this.players.getPosition(healableNearby)!;
      this.promptManager.show(pos.x, pos.y + 2, 32, 48, 'Curar', input.usingGamepad);
    } else if (nearT) {
      const pos = this.terminals.getPositions()[nearT]!;
      this.promptManager.show(pos.x, pos.y, 64, 64, 'Hackear', input.usingGamepad);
    } else if (nearS) {
      this.promptManager.show(nearS.x, nearS.y, 16, 16, 'Abrir Portão', input.usingGamepad);
    } else {
      this.promptManager.hide();
    }

    // ── Heal path ────────────────────────────────────────────────────────────
    const healTarget = this.interactionActive ? healableNearby : null;

    if (healTarget) {
      if (healTarget !== this.healingTarget) {
        if (this.prevHealingEmitted !== null) {
          this.socket.emit('setHealing', { targetId: null });
        }
        this.healingTarget      = healTarget;
        this.prevHealingEmitted = healTarget;
        this.healPassiveTimer   = 0;
        this.healHoldTimer      = 0;
        this.socket.emit('setHealing', { targetId: healTarget });

        if (this.hackingTerminal !== null) {
          this.hackingTerminal    = null;
          this.prevHackingEmitted = null;
          this.hackPassiveTimer   = 0;
          this.terminals.setWorking(null);
          this.hud.setHackProgress(null);
          this.socket.emit('setHacking', { terminalId: null });
        }
      }

      if (this.scene.time.now >= this.healLockUntil) {
        this.healPassiveTimer += delta;
        if (this.healPassiveTimer >= HEAL_PASSIVE_RATE_MS) {
          this.healPassiveTimer = 0;
          this.socket.emit('healProgress', { targetId: healTarget, amount: HEAL_PASSIVE_TICK });
        }

        this.healHoldTimer += delta;
        if (this.healHoldTimer >= this.healNextThreshold) {
          this.healHoldTimer     = 0;
          this.healNextThreshold = Phaser.Math.Between(833, 1667);
          this._runHealSkillCheck(healTarget, false);
        }
      }

      this.hud.setHealProgress(survivorInfo.get(healTarget)?.healPct ?? 0);
      return;
    }

    if (this.prevHealingEmitted !== null) {
      this.prevHealingEmitted = null;
      this.healingTarget      = null;
      this.healPassiveTimer   = 0;
      this.healHoldTimer      = 0;
      this.socket.emit('setHealing', { targetId: null });
      this.hud.setHealProgress(null);
    }

    // ── Hack path ─────────────────────────────────────────────────────────────
    const nearTerminal = nearT;

    if (nearTerminal !== this.hackTimerTerminal) {
      this.hackTimerTerminal = nearTerminal;
      this.hackHoldTimer     = 0;
    }

    if (this.interactionActive && nearTerminal && !downed) {
      this.hackingTerminal = nearTerminal;
      if (this.prevHackingEmitted !== nearTerminal) {
        this.prevHackingEmitted = nearTerminal;
        this.socket.emit('setHacking', { terminalId: nearTerminal });
      }
      this.terminals.setWorking(nearTerminal);
      this.hud.setHackProgress(this.terminals.getProgress(nearTerminal));

      this.hackPassiveTimer += delta;
      if (this.hackPassiveTimer >= HACK_PASSIVE_RATE_MS) {
        this.hackPassiveTimer = 0;
        this.socket.emit('hackProgress', { terminalId: nearTerminal, amount: HACK_PASSIVE_TICK });
      }

      if (this.scene.time.now >= this.hackLockUntil) {
        this.hackHoldTimer += delta;
        if (this.hackHoldTimer >= this.hackNextThreshold) {
          this.hackHoldTimer     = 0;
          this.hackNextThreshold = Phaser.Math.Between(6667, 11667);
          this._runHackSkillCheck(nearTerminal);
        }
      }
      return;
    }

    if (this.prevHackingEmitted !== null) {
      this.prevHackingEmitted = null;
      this.socket.emit('setHacking', { terminalId: null });
    }
    this.hackingTerminal  = null;
    this.hackPassiveTimer = 0;
    this.hackHoldTimer    = 0;
    this.terminals.setWorking(null);
    this.hud.setHackProgress(null);

    // ── Gate ─────────────────────────────────────────────────────────────────
    let nearAnyGate = false;
    for (const id of ['g1', 'g2'] as GateId[]) {
      if (!this.gates.isPowered(id) || this.gates.isOpen(id)) continue;
      if (!this.gates.isNearSwitch(id, this.player.x, this.player.y)) continue;
      nearAnyGate = true;

      if (this.openingGate !== id) {
        this.openingGate   = id;
        this.gateOpenTimer = 0;
      }

      if (this.interactionActive) {
        this.gateOpenTimer += delta;
        while (this.gateOpenTimer >= GATE_TICK_MS) {
          this.gateOpenTimer -= GATE_TICK_MS;
          this.socket.emit('gateOpenTick', { gateId: id });
        }
      } else {
        this.gateOpenTimer = 0;
      }
      break;
    }

    if (!nearAnyGate && this.openingGate !== null) {
      this.openingGate   = null;
      this.gateOpenTimer = 0;
    }

    const exitGate = this.gates.getOpenGateForExit(this.player.x, this.player.y);
    if (exitGate !== null && !escaped) {
      this.socket.emit('escape');
    }
  }

  updateDownedSelf(
    delta:       number,
    beingHealed: boolean,
    moving:      boolean,
    myHealPct:   number,
  ) {
    if (moving) {
      this.healPassiveTimer = 0;
      this.healHoldTimer    = 0;
      this.hud.setHealProgress(null);
      return;
    }
    if (myHealPct < HEAL_SELF_CAP && this.scene.time.now >= this.healLockUntil) {
      this.healPassiveTimer += delta;
      if (this.healPassiveTimer >= HEAL_PASSIVE_RATE_MS) {
        this.healPassiveTimer = 0;
        this.socket.emit('healProgress', {
          targetId: this.socket.id,
          amount:   HEAL_PASSIVE_TICK * HEAL_SELF_RATE_FACTOR,
        });
      }
      if (!beingHealed) {
        this.healHoldTimer += delta;
        if (this.healHoldTimer >= this.healNextThreshold) {
          this.healHoldTimer     = 0;
          this.healNextThreshold = Phaser.Math.Between(833, 1667);
          this._runHealSkillCheck(this.socket.id!, true);
        }
      }
    }
  }

  private _runHackSkillCheck(terminalId: TerminalId) {
    this.skillCheck.show(
      (isGreat) => {
        if (isGreat) this.socket.emit('hackProgress', { terminalId, amount: HACK_GREAT_BONUS });
      },
      () => {
        this.socket.emit('skillCheckFailed', { terminalId });
      },
    );
  }

  private _runHealSkillCheck(targetId: string, isSelf: boolean) {
    this.skillCheck.show(
      (isGreat) => {
        if (isGreat) {
          const bonus = isSelf ? HEAL_GREAT_BONUS * HEAL_SELF_RATE_FACTOR : HEAL_GREAT_BONUS;
          this.socket.emit('healProgress', { targetId, amount: bonus });
        }
      },
      () => {
        this.socket.emit('healSkillCheckFailed', { targetId });
        this.healLockUntil = this.scene.time.now + HEAL_FAIL_LOCK_MS;
      },
    );
  }

  private _nearestHealablePlayer(survivorInfo: ReadonlyMap<string, SurvivorInfo>): string | null {
    let bestId:      string | null = null;
    let bestDist     = INTERACT_RADIUS + 1;
    let bestPriority = 999;

    for (const [id, info] of survivorInfo) {
      if (id === this.socket.id) continue;
      if (info.expelled || info.escaped) continue;
      if (info.hp >= 2 && !info.downed) continue;

      const pos = this.players.getPosition(id);
      if (!pos) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, pos.x, pos.y);
      if (dist > INTERACT_RADIUS) continue;

      const priority = info.downed ? 1 : 2;
      if (priority < bestPriority || (priority === bestPriority && dist < bestDist)) {
        bestId       = id;
        bestDist     = dist;
        bestPriority = priority;
      }
    }
    return bestId;
  }
}
