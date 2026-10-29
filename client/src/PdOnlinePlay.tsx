import type { Move, PdRoomSnapshot } from "@trust/shared";
import { moveLabel } from "@trust/shared";

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

  return (
    <div className="solo-layout">
      <aside className="panel">
        <button type="button" className="secondary linkish" onClick={onLeave}>
          ← Leave room
        </button>
        <h2 style={{ marginTop: "1rem" }}>Online PD (1v1)</h2>
        <div className="pin-badge">{snapshot.pin}</div>
        <p className="status-line">
          Round {snapshot.round} of {snapshot.maxRounds} · {snapshot.phase}
          {snapshot.lastEvent ? ` · ${snapshot.lastEvent}` : ""}
        </p>
        <h3 style={{ marginTop: "1rem" }}>Players</h3>
        <ul className="player-list">
          {snapshot.players.map((p) => (
            <li key={p.id}>
              {p.name}
              {p.isHost ? " ★" : ""}
              {p.id === playerId ? " (you)" : ""} — {p.totalScore} pts
            </li>
          ))}
        </ul>
        {snapshot.players.length < 2 && (
          <p className="status-line">Waiting for a second player to join…</p>
        )}
      </aside>

      <main className="panel solo-main">
        {snapshot.phase === "lobby" && (
          <>
            <h2>Waiting to start</h2>
            <p>Share the PIN. When two players are connected, the 10-round match starts automatically.</p>
          </>
        )}

        {snapshot.phase === "choosing" && (
          <>
            <h2>Round {snapshot.round} — your move</h2>
            {snapshot.youSubmitted ? (
              <p>
                You locked in your choice.{" "}
                {snapshot.opponentSubmitted ? "Revealing soon…" : "Waiting for opponent…"}
              </p>
            ) : (
              <>
                <p>Choose privately — both moves reveal when you and your opponent have chosen.</p>
                <div className="row move-row">
                  <button type="button" className="coop-btn" onClick={() => onMove("C")}>
                    Cooperate
                  </button>
                  <button type="button" className="cheat-btn" onClick={() => onMove("D")}>
                    Cheat
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {(snapshot.phase === "reveal" || snapshot.phase === "finished") && last && me && them && (
          <div className="round-reveal">
            <h2>Round {last.round} results</h2>
            <div className="move-grid">
              <div>
                <span className="score-label">You ({me.name})</span>
                <strong className={(last.moves[me.id] ?? "C") === "C" ? "text-coop" : "text-cheat"}>
                  {moveLabel(last.moves[me.id] ?? "C")}
                </strong>
              </div>
              <div>
                <span className="score-label">{them.name}</span>
                <strong className={(last.moves[them.id] ?? "C") === "C" ? "text-coop" : "text-cheat"}>
                  {moveLabel(last.moves[them.id] ?? "C")}
                </strong>
              </div>
              <div>
                <span className="score-label">Points this round</span>
                <strong>
                  {last.points[me.id] >= 0 ? "+" : ""}
                  {last.points[me.id]} / {last.points[them.id] >= 0 ? "+" : ""}
                  {last.points[them.id]}
                </strong>
              </div>
              <div>
                <span className="score-label">Running totals</span>
                <strong>
                  {last.totals[me.id]} – {last.totals[them.id]}
                </strong>
              </div>
            </div>
            {snapshot.phase === "reveal" ? (
              <button type="button" onClick={onAckReveal}>
                Next round
              </button>
            ) : (
              <div className="finish-block">
                <h3>Final scores</h3>
                <p className="final-scores">
                  {me.name} {last.totals[me.id]} · {them.name} {last.totals[them.id]}
                </p>
                <button type="button" className="secondary" onClick={onLeave}>
                  Back to home
                </button>
              </div>
            )}
          </div>
        )}

        {snapshot.history.length > 0 && (
          <div className="history-block">
            <h3>Round log</h3>
            <ul className="round-log">
              {snapshot.history.map((r) => {
                if (!me || !them) return null;
                return (
                  <li key={r.round}>
                    #{r.round}: {moveLabel(r.moves[me.id] ?? "C")} vs {moveLabel(r.moves[them.id] ?? "C")} →{" "}
                    {r.points[me.id] >= 0 ? "+" : ""}
                    {r.points[me.id]} / {r.points[them.id] >= 0 ? "+" : ""}
                    {r.points[them.id]} (totals {r.totals[me.id]}–{r.totals[them.id]})
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
