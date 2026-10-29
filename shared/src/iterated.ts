import type { Move, Payoffs } from "./types.js";
import { DEFAULT_PAYOFFS } from "./types.js";

/** Default number of rounds in individual (solo) play. */
export const SOLO_ROUND_COUNT = 10;

export interface RoundScores {
  player: number;
  opponent: number;
}

/**
 * Payoffs for one simultaneous PD round (player vs opponent).
 * Uses standard Evolution of Trust matrix (R=+2, P=0, T=+3, S=-1 by default).
 */
export function scoreRound(
  playerMove: Move,
  opponentMove: Move,
  payoffs: Payoffs = DEFAULT_PAYOFFS
): RoundScores {
  if (playerMove === "C" && opponentMove === "C") {
    return { player: payoffs.R, opponent: payoffs.R };
  }
  if (playerMove === "D" && opponentMove === "D") {
    return { player: payoffs.P, opponent: payoffs.P };
  }
  if (playerMove === "C" && opponentMove === "D") {
    return { player: payoffs.S, opponent: payoffs.T };
  }
  return { player: payoffs.T, opponent: payoffs.S };
}

/** UI-facing label for a move (Nicky Case wording). */
export function moveLabel(move: Move): string {
  return move === "C" ? "Cooperate" : "Cheat";
}

export interface SoloRoundRecord {
  round: number;
  playerMove: Move;
  opponentMove: Move;
  playerPoints: number;
  opponentPoints: number;
  playerTotal: number;
  opponentTotal: number;
}
