import type {
  AgentSnapshot,
  Move,
  Payoffs,
  SandboxConfig,
  StrategyId,
} from "./types.js";
import { DEFAULT_PAYOFFS } from "./types.js";
import { createStrategyLogic, defaultPopulationMix } from "./strategies.js";
import { createRoomRng } from "./rng.js";
import type { StrategyLogic } from "./types.js";

export interface SimAgent {
  id: string;
  strategy: StrategyId;
  coins: number;
  angle: number;
  eliminated: boolean;
}

interface MatchAgent {
  strategy: StrategyId;
  coins: number;
  logic: StrategyLogic;
}

function getPayoffs(mA: Move, mB: Move, p: Payoffs): [number, number] {
  if (mA === "C" && mB === "C") return [p.R, p.R];
  if (mA === "D" && mB === "D") return [p.P, p.P];
  if (mA === "C" && mB === "D") return [p.S, p.T];
  return [p.T, p.S];
}

function maybeNoise(move: Move, noisePercent: number, rng: () => number): Move {
  if (noisePercent <= 0) return move;
  if (rng() * 100 < noisePercent) return move === "C" ? "D" : "C";
  return move;
}

function playOneGame(
  a: MatchAgent,
  b: MatchAgent,
  payoffs: Payoffs,
  noisePercent: number,
  rng: () => number
): void {
  let mA = a.logic.play();
  let mB = b.logic.play();
  mA = maybeNoise(mA, noisePercent, rng);
  mB = maybeNoise(mB, noisePercent, rng);
  const [sA, sB] = getPayoffs(mA, mB, payoffs);
  a.logic.remember(mA, mB);
  b.logic.remember(mB, mA);
  a.coins += sA;
  b.coins += sB;
}

function playRepeatedGame(
  stratA: StrategyId,
  stratB: StrategyId,
  turns: number,
  payoffs: Payoffs,
  noisePercent: number,
  rng: () => number
): [number, number] {
  const logicA = createStrategyLogic(stratA, rng);
  const logicB = createStrategyLogic(stratB, rng);
  logicA.reset();
  logicB.reset();
  const a: MatchAgent = { strategy: stratA, coins: 0, logic: logicA };
  const b: MatchAgent = { strategy: stratB, coins: 0, logic: logicB };
  for (let t = 0; t < turns; t++) {
    playOneGame(a, b, payoffs, noisePercent, rng);
  }
  return [a.coins, b.coins];
}

/**
 * Run one round-robin tournament; adds match payoffs to agent coin totals.
 */
export function runRoundRobinTournament(
  agents: SimAgent[],
  config: SandboxConfig,
  payoffs: Payoffs = DEFAULT_PAYOFFS
): void {
  const rng = createRoomRng(`${config.seed}:tournament:${agents.map((a) => a.id).join(",")}`);
  for (const a of agents) {
    if (!a.eliminated) a.coins = 0;
  }
  const active = agents.filter((a) => !a.eliminated);
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const [scoreI, scoreJ] = playRepeatedGame(
        active[i].strategy,
        active[j].strategy,
        config.turnsPerMatch,
        payoffs,
        config.noisePercent,
        rng
      );
      active[i].coins += scoreI;
      active[j].coins += scoreJ;
    }
  }
}

/**
 * Eliminate worst N agents by coin total (round-robin + eliminate worst N).
 */
export function eliminateWorst(
  agents: SimAgent[],
  count: number
): StrategyId[] {
  const n = Math.min(count, Math.max(0, agents.length - 1));
  const sorted = [...agents]
    .filter((a) => !a.eliminated)
    .sort((a, b) => a.coins - b.coins);
  const removed: StrategyId[] = [];
  for (let i = 0; i < n && i < sorted.length; i++) {
    sorted[i].eliminated = true;
    removed.push(sorted[i].strategy);
  }
  return removed;
}

/**
 * Reproduce best N agents — clone winners into eliminated slots / expand counts.
 */
export function reproduceBest(agents: SimAgent[], count: number, rng: () => number): void {
  const n = Math.min(count, agents.length);
  const active = agents.filter((a) => !a.eliminated);
  const sorted = [...active].sort((a, b) => b.coins - a.coins);
  const winners = sorted.slice(0, n);
  const eliminated = agents.filter((a) => a.eliminated);
  let wi = 0;
  for (const slot of eliminated) {
    if (winners.length === 0) break;
    const parent = winners[wi % winners.length];
    slot.strategy = parent.strategy;
    slot.coins = 0;
    slot.eliminated = false;
    wi++;
  }
  layoutRing(agents, rng);
}

/** Assign agents evenly on a unit circle. */
export function layoutRing(agents: SimAgent[], _rng?: () => number): void {
  const active = agents.filter((a) => !a.eliminated);
  const step = (2 * Math.PI) / Math.max(1, active.length);
  let idx = 0;
  for (const a of agents) {
    if (a.eliminated) continue;
    a.angle = idx * step - Math.PI / 2;
    idx++;
  }
}

/**
 * Build initial population of 25 agents from seed.
 */
export function createInitialPopulation(
  config: SandboxConfig
): SimAgent[] {
  const rng = createRoomRng(`${config.seed}:init`);
  const strategies = defaultPopulationMix(rng);
  const size = Math.min(config.populationSize, strategies.length);
  const agents: SimAgent[] = [];
  for (let i = 0; i < size; i++) {
    agents.push({
      id: `a-${i}`,
      strategy: strategies[i] ?? "tft",
      coins: 0,
      angle: 0,
      eliminated: false,
    });
  }
  layoutRing(agents, rng);
  return agents;
}

export function agentsToSnapshots(agents: SimAgent[]): AgentSnapshot[] {
  return agents.map((a) => ({
    id: a.id,
    strategy: a.strategy,
    coins: a.coins,
    angle: a.angle,
    eliminated: a.eliminated,
  }));
}

/**
 * Full evolution cycle: tournament → eliminate worst N → reproduce best N.
 */
export function runEvolutionStep(
  agents: SimAgent[],
  config: SandboxConfig
): { removed: StrategyId[]; reproduced: number } {
  runRoundRobinTournament(agents, config);
  const removed = eliminateWorst(agents, config.selectionCount);
  const rng = createRoomRng(`${config.seed}:repro`);
  const before = agents.filter((a) => a.eliminated).length;
  reproduceBest(agents, config.selectionCount, rng);
  const after = agents.filter((a) => !a.eliminated).length;
  return { removed, reproduced: after - (agents.length - before) };
}

export function generatePin(rng: () => number): string {
  return String(Math.floor(100000 + rng() * 900000));
}
