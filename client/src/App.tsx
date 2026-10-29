import { useCallback, useState } from "react";
import type { RoomSnapshot, StrategyId } from "@trust/shared";
import { STRATEGY_IDS, STRATEGY_LABELS } from "@trust/shared";
import { PeepRing } from "./PeepRing";
import { SoloPlay } from "./SoloPlay";
import { useTrustSocket } from "./useTrustSocket";

type AppMode = "home" | "solo";

export function App() {
  const { playerId, snapshot, error, send, host, join } = useTrustSocket();
  const [mode, setMode] = useState<AppMode>("home");
  const [name, setName] = useState("Explorer");
  const [pinInput, setPinInput] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const inRoom = Boolean(snapshot);

  const onHost = () => void host(name);
  const onJoin = () => join(pinInput, name);

  const updateConfig = useCallback(
    (partial: Partial<RoomSnapshot["config"]>) => {
      send({ type: "update_config", config: partial });
    },
    [send]
  );

  if (mode === "solo" && !inRoom) {
    return <SoloPlay onBack={() => setMode("home")} />;
  }

  if (!inRoom) {
    return (
      <div className="lobby-center">
        <div className="panel">
          <h1>Evolution of Trust</h1>
          <p>Play solo or share a multiplayer sandbox with a 6-digit PIN.</p>
          <button type="button" style={{ width: "100%", marginBottom: "1rem" }} onClick={() => setMode("solo")}>
            Individual play
          </button>
          <p className="status-line" style={{ marginBottom: "1rem" }}>
            Multiplayer sandbox
          </p>
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
            />
          </div>
          <div className="row" style={{ justifyContent: "center", marginTop: "1rem" }}>
            <button type="button" onClick={() => void onHost()}>
              Host room
            </button>
          </div>
          <div className="field" style={{ marginTop: "1.25rem" }}>
            <label htmlFor="pin">Join PIN</label>
            <input
              id="pin"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
            />
          </div>
          <button type="button" className="secondary" onClick={onJoin} disabled={pinInput.length < 6}>
            Join room
          </button>
          {error && <p className="status-line">{error}</p>}
          <p className="credit">
            Based on{" "}
            <a href="https://ncase.me/trust/" target="_blank" rel="noreferrer">
              The Evolution of Trust
            </a>{" "}
            by Nicky Case (CC0).
          </p>
        </div>
      </div>
    );
  }

  const snap = snapshot!;

  return (
    <div className="layout">
      <aside className="panel">
        <h2>Room</h2>
        <div className="pin-badge">{snap.pin}</div>
        <p className="status-line">
          Gen {snap.generation} · {snap.phase}
          {snap.lastEvent ? ` · ${snap.lastEvent}` : ""}
        </p>
        <h2 style={{ marginTop: "1rem" }}>Players</h2>
        <ul className="player-list">
          {snap.players.map((p) => (
            <li key={p.id}>
              {p.name}
              {p.isHost ? " ★" : ""}
              {p.id === playerId ? " (you)" : ""}
            </li>
          ))}
        </ul>
        <h2 style={{ marginTop: "1rem" }}>Sandbox</h2>
        <div className="field">
          <label htmlFor="turns">Rounds per match</label>
          <input
            id="turns"
            type="number"
            min={1}
            max={50}
            value={snap.config.turnsPerMatch}
            onChange={(e) => updateConfig({ turnsPerMatch: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label htmlFor="sel">Eliminate / reproduce (N)</label>
          <input
            id="sel"
            type="number"
            min={1}
            max={12}
            value={snap.config.selectionCount}
            onChange={(e) => updateConfig({ selectionCount: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label htmlFor="noise">Noise %</label>
          <input
            id="noise"
            type="number"
            min={0}
            max={50}
            value={snap.config.noisePercent}
            onChange={(e) => updateConfig({ noisePercent: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label htmlFor="seed">RNG seed</label>
          <input
            id="seed"
            value={snap.config.seed}
            onChange={(e) => updateConfig({ seed: e.target.value })}
          />
        </div>
        <div className="row">
          <button type="button" onClick={() => send({ type: "run_step" })} disabled={snap.phase === "running"}>
            Play → evolve
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => send({ type: "run_tournament_only" })}
            disabled={snap.phase === "running"}
          >
            Tournament only
          </button>
        </div>
        <button
          type="button"
          className="secondary"
          style={{ marginTop: "0.5rem", width: "100%" }}
          onClick={() => send({ type: "reset_population" })}
        >
          Reset population
        </button>
        {selectedAgent && (
          <div className="agent-picker">
            <label htmlFor="strat">Strategy for {selectedAgent}</label>
            <select
              id="strat"
              onChange={(e) => {
                send({
                  type: "set_agent_strategy",
                  agentId: selectedAgent,
                  strategy: e.target.value as StrategyId,
                });
              }}
              defaultValue=""
            >
              <option value="" disabled>
                Choose…
              </option>
              {STRATEGY_IDS.map((id) => (
                <option key={id} value={id}>
                  {STRATEGY_LABELS[id]}
                </option>
              ))}
            </select>
          </div>
        )}
        <p className="credit">
          <a href="https://ncase.me/trust/" target="_blank" rel="noreferrer">
            Nicky Case — The Evolution of Trust
          </a>{" "}
          (CC0)
        </p>
      </aside>
      <main className="panel">
        <h2>Population ({snap.agents.filter((a) => !a.eliminated).length}/25)</h2>
        <div className="canvas-wrap">
          <PeepRing agents={snap.agents} onSelect={setSelectedAgent} selectedId={selectedAgent} />
        </div>
      </main>
    </div>
  );
}
