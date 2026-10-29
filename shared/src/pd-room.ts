import type { Move } from "./types.js";
import { SOLO_ROUND_COUNT } from "./iterated.js";

/** Phases for a 1v1 online iterated PD room. */
export type PdRoomPhase = "lobby" | "choosing" | "reveal" | "finished";

export interface PdPlayerInfo {
  id: string;
  name: string;
  isHost: boolean;
  totalScore: number;
}

export interface PdRoundHistoryEntry {
  round: number;
  moves: Record<string, Move>;
  points: Record<string, number>;
  totals: Record<string, number>;
}

/** Public snapshot (per-player fields may differ during choosing). */
export interface PdRoomSnapshot {
  pin: string;
  hostId: string;
  players: PdPlayerInfo[];
  phase: PdRoomPhase;
  round: number;
  maxRounds: number;
  history: PdRoundHistoryEntry[];
  /** Last completed round details (reveal / finished). */
  lastRound: PdRoundHistoryEntry | null;
  /** You locked in a move this round. */
  youSubmitted: boolean;
  /** Opponent has submitted (move hidden until reveal). */
  opponentSubmitted: boolean;
  lastEvent: string | null;
}

export const PD_ONLINE_ROUND_COUNT = SOLO_ROUND_COUNT;
