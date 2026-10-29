import type { Move, PdRoomSnapshot } from "@trust/shared";
import { moveLabel } from "@trust/shared";
import { useEffect, useRef, useState } from "react";
import { AnimatedScore } from "./AnimatedScore";
import { PdMoveButtons } from "./PdMoveButtons";
import { PdRoundRevealPanel } from "./PdRoundRevealPanel";

interface Props {
  snapshot: PdRoomSnapshot;
  playerId: string | null;
  onMove: (move: Move) => void;
  onAckReveal: () => void;
  onLeave: () => void;
}

function opponent(snapshot: PdRoomSnapshot, playerId: string | null) {
  return snapshot.players.find((p) => p.id !== playerId) ?? null;
}

function self(snapshot: PdRoomSnapshot, playerId: string | null) {
  return snapshot.players.find((p) => p.id === playerId) ?? null;
}

/**
 * In-room UI for online 1v1 iterated PD (10 rounds).
 */
export function PdOnlinePlay({ snapshot, playerId, onMove, onAckReveal, onLeave }: Props) {
  const me = self(snapshot, playerId);
  const them = opponent(snapshot, playerId);
  const last = snapshot.lastRound;
  const [stageKey, setStageKey] = useState(0);
  const prevPhase = useRef(snapshot.phase);

  useEffect(() => {
    if (prevPhase.current === "reveal" && snapshot.phase === "choosing") {
      setStageKey((k) => k + 1);
    }
    prevPhase.current = snapshot.phase;
  }, [snapshot.phase]);

  const myTotal = me?.totalScore ?? 0;
  const theirTotal = them?.totalScore ?? 0;
  const totalToken = `${myTotal}-${theirTotal}-${snapshot.round}`;

  const finishSummary =
    me && them && last
      ? last.totals[me.id] > last.totals[them.id]
        ? `${me.name} wins this match.`
        : last.totals[me.id] < last.totals[them.id]
          ? `${them.name} wins this match.`
          : "It's a tie."
      : undefined;

  return (
    <div className="solo-layout">
      <aside className="panel">
        <button type="button" className="secondary linkish" onClick={onLeave}>
          ← Leave room
        </button>
        <h2 style={{ marginTop: "1rem" }}>Online PD (1v1)</h2>
        <div className="pin-badge">{snapshot.pin}</div>
        <p className="status-line pd-round-badge">
          Round {snapshot.round} of {snapshot.maxRounds} · {snapshot.phase}
          {snapshot.lastEvent ? ` · ${snapshot.lastEvent}` : ""}
        </p>
        <h3 style={{ marginTop: "1rem" }}>Players</h3>
        <ul className="player-list">
          {snapshot.players.map((p) => (
            <li key={p.id}>
              {p.name}
              {p.isHost ? " ★" : ""}
              {p.id === playerId ? " (you)" : ""}
            </li>
          ))}
        </ul>
        {me && them && snapshot.phase !== "lobby" && (
          <div className="score-totals">
            <AnimatedScore value={myTotal} label="You" token={totalToken} />
            <AnimatedScore value={theirTotal} label={them.name} token={totalToken} />
          </div>
        )}
        {snapshot.players.length < 2 && (
          <p className="status-line wait-pulse">Waiting for a second player to join…</p>
        )}
      </aside>

      <main className="panel solo-main">
        <div className="pd-stage" key={stageKey}>
          {snapshot.phase === "lobby" && (
            <div className="pd-round-enter">
              <h2>Waiting to start</h2>
              <p>Share the PIN. When two players are connected, the 10-round match starts automatically.</p>
            </div>
          )}

          {snapshot.phase === "choosing" && (
            <div className="pd-round-enter">
              <h2>Round {snapshot.round} — your move</h2>
              {snapshot.youSubmitted ? (
                <p className="wait-pulse">
                  You locked in your choice.{" "}
                  {snapshot.opponentSubmitted ? "Revealing soon…" : "Waiting for opponent…"}
                </p>
              ) : (
                <>
                  <p>Choose privately — both moves reveal when you and your opponent have chosen.</p>
                  <PdMoveButtons onCooperate={() => onMove("C")} onCheat={() => onMove("D")} />
                </>
              )}
            </div>
          )}

          {(snapshot.phase === "reveal" || snapshot.phase === "finished") && last && me && them && (
            <PdRoundRevealPanel
              data={{
                round: last.round,
                youTitle: `You (${me.name})`,
                themTitle: them.name,
                yourMove: last.moves[me.id] ?? "C",
                theirMove: last.moves[them.id] ?? "C",
                yourPoints: last.points[me.id] ?? 0,
                theirPoints: last.points[them.id] ?? 0,
                yourTotal: last.totals[me.id] ?? 0,
                theirTotal: last.totals[them.id] ?? 0,
              }}
              finished={snapshot.phase === "finished"}
              summary={finishSummary}
              onNext={snapshot.phase === "reveal" ? onAckReveal : undefined}
              onBack={snapshot.phase === "finished" ? onLeave : undefined}
            />
          )}
        </div>

        {snapshot.history.length > 0 && me && them && (
          <div className="history-block">
            <h3>Round log</h3>
            <ul className="round-log">
              {snapshot.history.map((r) => (
                <li key={r.round} className="round-log-item">
                  #{r.round}: {moveLabel(r.moves[me.id] ?? "C")} vs {moveLabel(r.moves[them.id] ?? "C")} →{" "}
                  {r.points[me.id] >= 0 ? "+" : ""}
                  {r.points[me.id]} / {r.points[them.id] >= 0 ? "+" : ""}
                  {r.points[them.id]} (totals {r.totals[me.id]}–{r.totals[them.id]})
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
