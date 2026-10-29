import type { Move, StrategyId, StrategyLogic } from "./types.js";
import { createRoomRng } from "./rng.js";

abstract class BaseLogic implements StrategyLogic {
  abstract play(): Move;
  remember(_ownMove: Move, _otherMove: Move): void {}
  reset(): void {}
}

/** Tit for tat — starts cooperative, then copies opponent. */
class TftLogic extends BaseLogic {
  private otherMove: Move = "C";
  play(): Move {
    return this.otherMove;
  }
  remember(_ownMove: Move, otherMove: Move): void {
    this.otherMove = otherMove;
  }
  reset(): void {
    this.otherMove = "C";
  }
}

class AllDLogic extends BaseLogic {
  play(): Move {
    return "D";
  }
}

class AllCLogic extends BaseLogic {
  play(): Move {
    return "C";
  }
}

/** Cooperates until opponent cheats once, then always defects. */
class GrudgeLogic extends BaseLogic {
  private grudged = false;
  play(): Move {
    return this.grudged ? "D" : "C";
  }
  remember(_ownMove: Move, otherMove: Move): void {
    if (otherMove === "D") this.grudged = true;
  }
  reset(): void {
    this.grudged = false;
  }
}

/**
 * Prober / Detective — probe sequence then TFT or always cheat.
 * Probe rounds: C, D, C, C
 */
class ProberLogic extends BaseLogic {
  private round = 0;
  private opponentCheatedInProbe = false;
  private otherMove: Move = "C";
  private probeDone = false;
  private alwaysCheatAfter = false;

  play(): Move {
    if (!this.probeDone) {
      const seq: Move[] = ["C", "D", "C", "C"];
      return seq[this.round] ?? "C";
    }
    if (this.alwaysCheatAfter) return "D";
    return this.otherMove;
  }

  remember(_ownMove: Move, otherMove: Move): void {
    if (!this.probeDone) {
      if (otherMove === "D") this.opponentCheatedInProbe = true;
      this.round++;
      if (this.round >= 4) {
        this.probeDone = true;
        this.alwaysCheatAfter = !this.opponentCheatedInProbe;
      }
      return;
    }
    if (!this.alwaysCheatAfter) {
      this.otherMove = otherMove;
    }
  }

  reset(): void {
    this.round = 0;
    this.opponentCheatedInProbe = false;
    this.otherMove = "C";
    this.probeDone = false;
    this.alwaysCheatAfter = false;
  }
}

/** Defect only if opponent cheated twice in a row. */
class Tf2tLogic extends BaseLogic {
  private streak = 0;
  play(): Move {
    return this.streak >= 2 ? "D" : "C";
  }
  remember(_ownMove: Move, otherMove: Move): void {
    if (otherMove === "D") this.streak++;
    else this.streak = 0;
  }
  reset(): void {
    this.streak = 0;
  }
}

/** Win-stay lose-shift (Pavlov). */
class PavlovLogic extends BaseLogic {
  private lastMove: Move = "C";
  play(): Move {
    return this.lastMove;
  }
  remember(ownMove: Move, otherMove: Move): void {
    if (otherMove === "C") {
      this.lastMove = ownMove;
    } else {
      this.lastMove = ownMove === "C" ? "D" : "C";
    }
  }
  reset(): void {
    this.lastMove = "C";
  }
}

class RandomLogic extends BaseLogic {
  private next: () => number;
  constructor(rng: () => number) {
    super();
    this.next = rng;
  }
  play(): Move {
    return this.next() < 0.5 ? "C" : "D";
  }
}

/**
 * Factory for strategy logic instances.
 * @param id - Strategy id
 * @param rng - Optional RNG (required for random strategy)
 */
export function createStrategyLogic(
  id: StrategyId,
  rng?: () => number
): StrategyLogic {
  switch (id) {
    case "tft":
      return new TftLogic();
    case "all_d":
      return new AllDLogic();
    case "all_c":
      return new AllCLogic();
    case "grudge":
      return new GrudgeLogic();
    case "prober":
      return new ProberLogic();
    case "tf2t":
      return new Tf2tLogic();
    case "pavlov":
      return new PavlovLogic();
    case "random":
      return new RandomLogic(rng ?? Math.random);
    default:
      return new TftLogic();
  }
}

/**
 * Default population mix totaling 25 agents (Nicky Case–style counts scaled).
 * @param rng - Deterministic shuffle / random slots
 */
export function defaultPopulationMix(rng: () => number): StrategyId[] {
  const mix: StrategyId[] = [
    "tft",
    "tft",
    "tft",
    "all_d",
    "all_d",
    "all_d",
    "all_c",
    "all_c",
    "all_c",
    "grudge",
    "grudge",
    "grudge",
    "prober",
    "prober",
    "prober",
    "tf2t",
    "tf2t",
    "tf2t",
    "pavlov",
    "pavlov",
    "pavlov",
    "random",
    "random",
    "random",
    "random",
  ];
  for (let i = mix.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [mix[i], mix[j]] = [mix[j], mix[i]];
  }
  return mix;
}
