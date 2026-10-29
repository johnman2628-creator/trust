/** Prisoner's Dilemma move. */
export type Move = "C" | "D";

/** Built-in strategy identifiers (Nicky Case / Evolution of Trust). */
export type StrategyId =
  | "tft"
  | "all_d"
  | "all_c"
  | "grudge"
  | "prober"
  | "tf2t"
  | "pavlov"
  | "random";

export const STRATEGY_IDS: StrategyId[] = [
  "tft",
  "all_d",
  "all_c",
  "grudge",
  "prober",
  "tf2t",
  "pavlov",
  "random",
];

export const STRATEGY_LABELS: Record<StrategyId, string> = {
  tft: "Copycat (Tit for Tat)",
  all_d: "Always Cheat",
  all_c: "Always Cooperate",
  grudge: "Grudger",
  prober: "Prober",
  tf2t: "Tit for Two Tats",
  pavlov: "Pavlov",
  random: "Random",
};

export interface Payoffs {
  R: number;
  P: number;
  T: number;
  S: number;
}

export const DEFAULT_PAYOFFS: Payoffs = { R: 2, P: 0, T: 3, S: -1 };

export interface SandboxConfig {
  seed: string;
  populationSize: number;
  turnsPerMatch: number;
  selectionCount: number;
  noisePercent: number;
  tournamentMode: "round_robin";
}

export const DEFAULT_SANDBOX: SandboxConfig = {
  seed: "trust",
  populationSize: 25,
  turnsPerMatch: 10,
  selectionCount: 5,
  noisePercent: 0,
  tournamentMode: "round_robin",
};

export interface AgentSnapshot {
  id: string;
  strategy: StrategyId;
  coins: number;
  angle: number;
  eliminated: boolean;
}

export interface RoomSnapshot {
  pin: string;
  hostId: string | null;
  players: PlayerInfo[];
  config: SandboxConfig;
  agents: AgentSnapshot[];
  phase: "lobby" | "running" | "between";
  generation: number;
  lastEvent: string | null;
}

export interface PlayerInfo {
  id: string;
  name: string;
  isHost: boolean;
}

export interface StrategyLogic {
  play(): Move;
  remember(ownMove: Move, otherMove: Move): void;
  reset(): void;
}
