import {
  STRATEGY_IDS,
  createInitialPopulation,
  runEvolutionStep,
  runRoundRobinTournament,
  type SandboxConfig,
  type StrategyId,
  type SimAgent,
} from "@trust/shared";

export interface RoomState {
  pin: string;
  hostId: string;
  config: SandboxConfig;
  agents: SimAgent[];
  phase: "lobby" | "running" | "between";
  generation: number;
  lastEvent: string | null;
  initialized: boolean;
  /** Set when room is created via POST /api/host; claimed on first host WebSocket. */
  pendingHost?: { playerId: string; name: string };
}

export type InboundMessage =
  | { type: "join"; name: string }
  | { type: "update_config"; config: Partial<SandboxConfig> }
  | { type: "set_agent_strategy"; agentId: string; strategy: StrategyId }
  | { type: "reset_population" }
  | { type: "run_step" }
  | { type: "run_tournament_only" };

export interface PlayerRecord {
  id: string;
  name: string;
}

/**
 * Apply an inbound sandbox message to room state (pure game logic).
 * @returns Whether the room should broadcast a snapshot after this message.
 */
export function applyRoomMessage(
  room: RoomState,
  client: PlayerRecord,
  raw: string
): { ok: boolean; error?: string; broadcast: boolean } {
  let msg: InboundMessage;
  try {
    msg = JSON.parse(raw) as InboundMessage;
  } catch {
    return { ok: false, broadcast: false };
  }

  if (msg.type === "join") {
    client.name = msg.name.slice(0, 24) || "Player";
    room.lastEvent = `${client.name} joined`;
    return { ok: true, broadcast: true };
  }

  switch (msg.type) {
    case "update_config": {
      const c = msg.config;
      if (typeof c.turnsPerMatch === "number") {
        room.config.turnsPerMatch = Math.max(1, Math.min(50, Math.floor(c.turnsPerMatch)));
      }
      if (typeof c.selectionCount === "number") {
        room.config.selectionCount = Math.max(1, Math.min(12, Math.floor(c.selectionCount)));
      }
      if (typeof c.noisePercent === "number") {
        room.config.noisePercent = Math.max(0, Math.min(50, Math.floor(c.noisePercent)));
      }
      if (typeof c.populationSize === "number") {
        room.config.populationSize = 25;
      }
      if (typeof c.seed === "string" && c.seed.length > 0) {
        room.config.seed = c.seed.slice(0, 64);
      }
      room.lastEvent = `${client.name} updated sandbox settings`;
      return { ok: true, broadcast: true };
    }
    case "set_agent_strategy": {
      if (!STRATEGY_IDS.includes(msg.strategy)) return { ok: true, broadcast: false };
      const agent = room.agents.find((a) => a.id === msg.agentId);
      if (agent) {
        agent.strategy = msg.strategy;
        room.lastEvent = `${client.name} set ${agent.id} → ${msg.strategy}`;
      }
      return { ok: true, broadcast: true };
    }
    case "reset_population": {
      room.agents = createInitialPopulation(room.config);
      room.generation = 0;
      room.phase = "lobby";
      room.lastEvent = `${client.name} reset population`;
      return { ok: true, broadcast: true };
    }
    case "run_tournament_only": {
      room.phase = "running";
      runRoundRobinTournament(room.agents, room.config);
      room.phase = "between";
      room.lastEvent = `Tournament finished (gen ${room.generation})`;
      return { ok: true, broadcast: true };
    }
    case "run_step": {
      room.phase = "running";
      const result = runEvolutionStep(room.agents, room.config);
      room.generation += 1;
      room.phase = "between";
      room.lastEvent = `Evolution step ${room.generation}: removed ${result.removed.join(", ") || "none"}`;
      return { ok: true, broadcast: true };
    }
    default:
      return { ok: true, broadcast: false };
  }
}
