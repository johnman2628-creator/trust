import type { Move } from "@trust/shared";
import { moveLabel } from "@trust/shared";
import { useFlashClass } from "./useFlashClass";

export interface RoundRevealView {
  round: number;
  youTitle: string;
  themTitle: string;
  yourMove: Move;
  theirMove: Move;
  yourPoints: number;
  theirPoints: number;
  yourTotal: number;
  theirTotal: number;
}

interface Props {
  data: RoundRevealView;
  finished?: boolean;
  summary?: string;
  onNext?: () => void;
  onPlayAgain?: () => void;
  onBack?: () => void;
  nextLabel?: string;
}

/**
 * Animated round reveal: flip cards, score pop, optional finish celebration.
 */
export function PdRoundRevealPanel({
  data,
  finished,
  summary,
  onNext,
  onPlayAgain,
  onBack,
  nextLabel = "Next round",
}: Props) {
  const revealKey = `${data.round}-${data.yourMove}-${data.theirMove}`;
  const roundPointsFlash = useFlashClass(`${revealKey}-pts`);
  const totalsFlash = useFlashClass(`${revealKey}-tot`);

  return (
    <div
      className={`round-reveal round-reveal-animate${finished ? " round-reveal-finished" : ""}`}
      key={revealKey}
    >
      <h2 className="reveal-title">Round {data.round} results</h2>
      <div className="move-card-row">
        <div className="move-card move-card-you">
          <span className="score-label">{data.youTitle}</span>
          <span
            className={`move-card-face ${data.yourMove === "C" ? "move-coop" : "move-cheat"}`}
          >
            {moveLabel(data.yourMove)}
          </span>
        </div>
        <div className="move-card move-card-them">
          <span className="score-label">{data.themTitle}</span>
          <span
            className={`move-card-face ${data.theirMove === "C" ? "move-coop" : "move-cheat"}`}
          >
            {moveLabel(data.theirMove)}
          </span>
        </div>
      </div>
      <div className="move-grid reveal-stats">
        <div>
          <span className="score-label">Points this round</span>
          <strong className={`reveal-stat ${roundPointsFlash}`}>
            {data.yourPoints >= 0 ? "+" : ""}
            {data.yourPoints} / {data.theirPoints >= 0 ? "+" : ""}
            {data.theirPoints}
          </strong>
        </div>
        <div>
          <span className="score-label">Running totals</span>
          <strong className={`reveal-stat ${totalsFlash}`}>
            {data.yourTotal} – {data.theirTotal}
          </strong>
        </div>
      </div>
      {!finished && onNext && (
        <button type="button" className="btn-next-round" onClick={onNext}>
          {nextLabel}
        </button>
      )}
      {finished && (
        <div className="finish-block finish-celebrate">
          <h3>Final scores</h3>
          <p className="final-scores">
            {data.yourTotal} – {data.theirTotal}
          </p>
          {summary && <p className="finish-summary">{summary}</p>}
          <div className="row">
            {onPlayAgain && (
              <button type="button" onClick={onPlayAgain}>
                Play again
              </button>
            )}
            {onBack && (
              <button type="button" className="secondary" onClick={onBack}>
                Back to home
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
