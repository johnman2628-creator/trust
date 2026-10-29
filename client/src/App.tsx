import { useCallback, useState } from "react";
import type { RoomSnapshot, StrategyId } from "@trust/shared";
import { STRATEGY_IDS, STRATEGY_LABELS } from "@trust/shared";
import { PdOnlinePlay } from "./PdOnlinePlay";
import { PeepRing } from "./PeepRing";
import { SoloPlay } from "./SoloPlay";
import { usePdSocket } from "./usePdSocket";
import { useTrustSocket } from "./useTrustSocket";

type AppMode = "home" | "solo-bot";

export function App() {
  const sandbox = useTrustSocket();
  const pd = usePdSocket();
  const [mode, setMode] = useState<AppMode>("home");
  const [name, setName] = useState("Explorer");
  const [sandboxPin, setSandboxPin] = useState("");
  const [pdPin, setPdPin] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const inSandbox = Boolean(sandbox.snapshot);
  const inPdRoom = Boolean(pd.snapshot);

  const updateConfig = useCallback(
    (partial: Partial<RoomSnapshot["config"]>) => {
      sandbox.send({ type: "update_config", config: partial });
    },
    [sandbox.send]
  );

  if (mode === "solo-bot" && !inSandbox && !inPdRoom) {
    return <SoloPlay onBack={() => setMode("home")} />;
  }

  if (inPdRoom && pd.snapshot) {
    return (
      <PdOnlinePlay
        snapshot={pd.snapshot}
        playerId={pd.playerId}
        onMove={(move) => pd.send({ type: "submit_move", move })}
        onAckReveal={() => pd.send({ type: "ack_reveal" })}
        onLeave={() => {
          pd.disconnect();
          setMode("home");
        }}
      />
    );
  }

  if (inSandbox) {
    const snap = sandbox.snapshot!;

    return (
      <div className="layout">
        <aside className="panel">
          <h2>Sandbox room</h2>
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
                {p.id === sandbox.playerId ? " (you)" : ""}
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
            <button
              type="button"
              onClick={() => sandbox.send({ type: "run_step" })}
              disabled={snap.phase === "running"}
            >
              Play → evolve
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => sandbox.send({ type: "run_tournament_only" })}
              disabled={snap.phase === "running"}
            >
              Tournament only
            </button>
          </div>
          <button
            type="button"
            className="secondary"
            style={{ marginTop: "0.5rem", width: "100%" }}
            onClick={() => sandbox.send({ type: "reset_population" })}
          >
            Reset population
          </button>
          {selectedAgent && (
            <div className="agent-picker">
              <label htmlFor="strat">Strategy for {selectedAgent}</label>
              <select
                id="strat"
                onChange={(e) => {
                  sandbox.send({
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

  return (
    <div className="lobby-center">
      <div className="panel home-panel">
        <h1>Evolution of Trust</h1>
        <p>Classic iterated Prisoner's Dilemma — solo, online 1v1, or the full sandbox tournament.</p>

        <section className="home-section">
          <h2>Individual</h2>
          <button type="button" style={{ width: "100%" }} onClick={() => setMode("solo-bot")}>
            Play vs bot
          </button>
          <p className="status-line">10 rounds against a strategy bot (client-only).</p>
        </section>

        <section className="home-section">
          <h2>Individual · online 1v1</h2>
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
            />
          </div>
          <button type="button" style={{ width: "100%" }} onClick={() => void pd.hostPd(name)}>
            Host PD room
          </button>
          <div className="field" style={{ marginTop: "0.75rem" }}>
            <label htmlFor="pd-pin">Join PIN</label>
            <input
              id="pd-pin"
              inputMode="numeric"
              value={pdPin}
              onChange={(e) => setPdPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
            />
          </div>
          <button
            type="button"
            className="secondary"
            style={{ width: "100%" }}
            onClick={() => pd.joinPd(pdPin, name)}
            disabled={pdPin.length < 6}
          >
            Join PD room
          </button>
          <p className="status-line">Human vs human — 10 rounds, private choices then reveal.</p>
        </section>

        <section className="home-section">
          <h2>Sandbox tournament</h2>
          <button type="button" className="secondary" style={{ width: "100%" }} onClick={() => void sandbox.host(name)}>
            Host sandbox
          </button>
          <div className="field" style={{ marginTop: "0.75rem" }}>
            <label htmlFor="sandbox-pin">Join PIN</label>
            <input
              id="sandbox-pin"
              inputMode="numeric"
              value={sandboxPin}
              onChange={(e) => setSandboxPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
            />
          </div>
          <button
            type="button"
            className="secondary"
            style={{ width: "100%" }}
            onClick={() => sandbox.join(sandboxPin, name)}
            disabled={sandboxPin.length < 6}
          >
            Join sandbox
          </button>
          <p className="status-line">Shared population of 25 agents — evolve together.</p>
        </section>

        {(sandbox.error || pd.error) && (
          <p className="status-line">{sandbox.error || pd.error}</p>
        )}

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
