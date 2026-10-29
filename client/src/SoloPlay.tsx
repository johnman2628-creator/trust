import { useCallback, useMemo, useRef, useState } from "react";
import {
  SOLO_ROUND_COUNT,
  STRATEGY_IDS,
  STRATEGY_LABELS,
  createStrategyLogic,
  moveLabel,
  scoreRound,
  type Move,
  type SoloRoundRecord,
  type StrategyId,
  type StrategyLogic,
} from "@trust/shared";
import { AnimatedScore } from "./AnimatedScore";
import { PdMoveButtons } from "./PdMoveButtons";
import { PdRoundRevealPanel } from "./PdRoundRevealPanel";

type Phase = "playing" | "reveal" | "finished";

interface Props {
  onBack: () => void;
}

/**
 * Client-only iterative Prisoner's Dilemma vs a bot strategy.
 */
export function SoloPlay({ onBack }: Props) {
  const [strategyId, setStrategyId] = useState<StrategyId>("tft");
  const [round, setRound] = useState(1);
  const [phase, setPhase] = useState<Phase>("playing");
  const [history, setHistory] = useState<SoloRoundRecord[]>([]);
  const [lastReveal, setLastReveal] = useState<SoloRoundRecord | null>(null);
  const [stageKey, setStageKey] = useState(0);
  const botRef = useRef<StrategyLogic>(createStrategyLogic("tft"));

  const totals = useMemo(() => {
    const last = history[history.length - 1];
    return {
      player: last?.playerTotal ?? 0,
      opponent: last?.opponentTotal ?? 0,
    };
  }, [history]);

  const resetGame = useCallback(
    (nextStrategy: StrategyId = strategyId) => {
      botRef.current = createStrategyLogic(nextStrategy, Math.random);
      botRef.current.reset();
      setRound(1);
      setPhase("playing");
      setHistory([]);
      setLastReveal(null);
      setStageKey((k) => k + 1);
    },
    [strategyId]
  );

  const onStrategyChange = (id: StrategyId) => {
    setStrategyId(id);
    resetGame(id);
  };

  const playMove = (playerMove: Move) => {
    if (phase !== "playing") return;
    const bot = botRef.current;
    const opponentMove = bot.play();
    const scores = scoreRound(playerMove, opponentMove);
    bot.remember(opponentMove, playerMove);

    const prevPlayer = history[history.length - 1]?.playerTotal ?? 0;
    const prevOpponent = history[history.length - 1]?.opponentTotal ?? 0;
    const record: SoloRoundRecord = {
      round,
      playerMove,
      opponentMove,
      playerPoints: scores.player,
      opponentPoints: scores.opponent,
      playerTotal: prevPlayer + scores.player,
      opponentTotal: prevOpponent + scores.opponent,
    };

    setHistory((h) => [...h, record]);
    setLastReveal(record);
    setPhase(round >= SOLO_ROUND_COUNT ? "finished" : "reveal");
  };

  const nextRound = () => {
    if (phase !== "reveal") return;
    setRound((r) => r + 1);
    setPhase("playing");
    setLastReveal(null);
    setStageKey((k) => k + 1);
  };

  const summary =
    totals.player > totals.opponent
      ? "You outscored your opponent — trust paid off (this time)."
      : totals.player < totals.opponent
        ? "Your opponent came out ahead — the dilemma is real."
        : "A tie — perfectly balanced cooperation and betrayal.";

  const totalToken = `${totals.player}-${totals.opponent}`;

  return (
    <div className="solo-layout">
      <aside className="panel">
        <button type="button" className="secondary linkish" onClick={onBack}>
          ← Back to home
        </button>
        <h2 style={{ marginTop: "1rem" }}>Play vs bot</h2>
        <p className="status-line pd-round-badge">
          Round {Math.min(round, SOLO_ROUND_COUNT)} of {SOLO_ROUND_COUNT}
        </p>
        <div className="field">
          <label htmlFor="solo-bot">Opponent strategy</label>
          <select
            id="solo-bot"
            value={strategyId}
            onChange={(e) => onStrategyChange(e.target.value as StrategyId)}
            disabled={history.length > 0 && phase !== "finished"}
          >
            {STRATEGY_IDS.map((id) => (
              <option key={id} value={id}>
                {STRATEGY_LABELS[id]}
              </option>
            ))}
          </select>
        </div>
        <div className="score-totals">
          <AnimatedScore value={totals.player} label="You" token={totalToken} />
          <AnimatedScore
            value={totals.opponent}
            label={STRATEGY_LABELS[strategyId]}
            token={totalToken}
          />
        </div>
        <p className="credit">
          Payoffs: both cooperate +2/+2 · both cheat 0/0 · cheat vs cooperate +3/−1
        </p>
      </aside>

      <main className="panel solo-main">
        <div className="pd-stage" key={stageKey}>
          {phase === "playing" && (
            <div className="pd-round-enter">
              <h2>Round {round} — your move</h2>
              <p>Choose cooperate or cheat before your opponent acts.</p>
              <PdMoveButtons onCooperate={() => playMove("C")} onCheat={() => playMove("D")} />
            </div>
          )}

          {(phase === "reveal" || phase === "finished") && lastReveal && (
            <PdRoundRevealPanel
              data={{
                round: lastReveal.round,
                youTitle: "You played",
                themTitle: "They played",
                yourMove: lastReveal.playerMove,
                theirMove: lastReveal.opponentMove,
                yourPoints: lastReveal.playerPoints,
                theirPoints: lastReveal.opponentPoints,
                yourTotal: lastReveal.playerTotal,
                theirTotal: lastReveal.opponentTotal,
              }}
              finished={phase === "finished"}
              summary={summary}
              onNext={phase === "reveal" ? nextRound : undefined}
              onPlayAgain={phase === "finished" ? () => resetGame() : undefined}
              onBack={phase === "finished" ? onBack : undefined}
            />
          )}
        </div>

        {history.length > 0 && (
          <div className="history-block">
            <h3>Round log</h3>
            <ul className="round-log">
              {history.map((r) => (
                <li key={r.round} className="round-log-item">
                  #{r.round}: you {moveLabel(r.playerMove)}, they {moveLabel(r.opponentMove)} →{" "}
                  {r.playerPoints >= 0 ? "+" : ""}
                  {r.playerPoints} / {r.opponentPoints >= 0 ? "+" : ""}
                  {r.opponentPoints} (totals {r.playerTotal}–{r.opponentTotal})
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
