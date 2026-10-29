import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import {
  DEFAULT_SANDBOX,
  type RoomSnapshot,
  type SandboxConfig,
  type StrategyId,
  STRATEGY_IDS,
  createInitialPopulation,
  runEvolutionStep,
  runRoundRobinTournament,
  agentsToSnapshots,
  generatePin,
  createRoomRng,
  type SimAgent,
} from "@trust/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const CLIENT_DIST = path.resolve(__dirname, "../../client/dist");

interface ClientState {
  id: string;
  name: string;
  ws: WebSocket;
}

interface Room {
  pin: string;
  hostId: string;
  clients: Map<string, ClientState>;
  config: SandboxConfig;
  agents: SimAgent[];
  phase: RoomSnapshot["phase"];
  generation: number;
  lastEvent: string | null;
}

const rooms = new Map<string, Room>();

/** @returns A unique player connection id. */
function newPlayerId(): string {
  return `p-${Math.random().toString(36).slice(2, 11)}`;
}

function buildSnapshot(room: Room): RoomSnapshot {
  const players = [...room.clients.values()].map((c) => ({
    id: c.id,
    name: c.name,
    isHost: c.id === room.hostId,
  }));
  return {
    pin: room.pin,
    hostId: room.hostId,
    players,
    config: { ...room.config },
    agents: agentsToSnapshots(room.agents),
    phase: room.phase,
    generation: room.generation,
    lastEvent: room.lastEvent,
  };
}

function broadcast(room: Room, message: unknown): void {
  const payload = JSON.stringify(message);
  for (const c of room.clients.values()) {
    if (c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(payload);
    }
  }
}

function sendSnapshot(room: Room): void {
  broadcast(room, { type: "snapshot", data: buildSnapshot(room) });
}

function findRoomByPin(pin: string): Room | undefined {
  return rooms.get(pin);
}

function createRoom(host: ClientState): Room {
  const rng = createRoomRng(String(Date.now()));
  let pin = generatePin(rng);
  while (rooms.has(pin)) {
    pin = generatePin(rng);
  }
  const config: SandboxConfig = {
    ...DEFAULT_SANDBOX,
    seed: pin,
  };
  const room: Room = {
    pin,
    hostId: host.id,
    clients: new Map([[host.id, host]]),
    config,
    agents: createInitialPopulation(config),
    phase: "lobby",
    generation: 0,
    lastEvent: null,
  };
  rooms.set(pin, room);
  return room;
}

type InboundMessage =
  | { type: "host"; name: string }
  | { type: "join"; pin: string; name: string }
  | { type: "update_config"; config: Partial<SandboxConfig> }
  | { type: "set_agent_strategy"; agentId: string; strategy: StrategyId }
  | { type: "reset_population" }
  | { type: "run_step" }
  | { type: "run_tournament_only" };

function handleMessage(client: ClientState, room: Room | null, raw: string): void {
  let msg: InboundMessage;
  try {
    msg = JSON.parse(raw) as InboundMessage;
  } catch {
    return;
  }

  if (msg.type === "host") {
    if (room) return;
    client.name = msg.name.slice(0, 24) || "Host";
    const newRoom = createRoom(client);
    sendSnapshot(newRoom);
    return;
  }

  if (msg.type === "join") {
    if (room) return;
    const pin = msg.pin.replace(/\D/g, "").slice(0, 6);
    const target = findRoomByPin(pin);
    if (!target) {
      client.ws.send(JSON.stringify({ type: "error", message: "Room not found" }));
      return;
    }
    client.name = msg.name.slice(0, 24) || "Player";
    target.clients.set(client.id, client);
    target.lastEvent = `${client.name} joined`;
    sendSnapshot(target);
    return;
  }

  if (!room) {
    client.ws.send(JSON.stringify({ type: "error", message: "Not in a room" }));
    return;
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
      sendSnapshot(room);
      break;
    }
    case "set_agent_strategy": {
      if (!STRATEGY_IDS.includes(msg.strategy)) break;
      const agent = room.agents.find((a) => a.id === msg.agentId);
      if (agent) {
        agent.strategy = msg.strategy;
        room.lastEvent = `${client.name} set ${agent.id} → ${msg.strategy}`;
      }
      sendSnapshot(room);
      break;
    }
    case "reset_population": {
      room.agents = createInitialPopulation(room.config);
      room.generation = 0;
      room.phase = "lobby";
      room.lastEvent = `${client.name} reset population`;
      sendSnapshot(room);
      break;
    }
    case "run_tournament_only": {
      room.phase = "running";
      sendSnapshot(room);
      runRoundRobinTournament(room.agents, room.config);
      room.phase = "between";
      room.lastEvent = `Tournament finished (gen ${room.generation})`;
      sendSnapshot(room);
      break;
    }
    case "run_step": {
      room.phase = "running";
      sendSnapshot(room);
      const result = runEvolutionStep(room.agents, room.config);
      room.generation += 1;
      room.phase = "between";
      room.lastEvent = `Evolution step ${room.generation}: removed ${result.removed.join(", ") || "none"}`;
      sendSnapshot(room);
      break;
    }
    default:
      break;
  }
}

function findRoomForClient(clientId: string): Room | undefined {
  for (const room of rooms.values()) {
    if (room.clients.has(clientId)) return room;
  }
  return undefined;
}

function removeClient(clientId: string): void {
  for (const [pin, room] of rooms.entries()) {
    if (!room.clients.has(clientId)) continue;
    room.clients.delete(clientId);
    if (room.clients.size === 0) {
      rooms.delete(pin);
      return;
    }
    if (room.hostId === clientId) {
      const next = room.clients.values().next().value as ClientState;
      room.hostId = next.id;
    }
    room.lastEvent = "Player left";
    sendSnapshot(room);
    return;
  }
}

const app = express();
app.use(express.static(CLIENT_DIST));
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});
app.get("*", (_req, res) => {
  res.sendFile(path.join(CLIENT_DIST, "index.html"), (err) => {
    if (err) res.status(404).send("Client not built. Run npm run build.");
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  const client: ClientState = {
    id: newPlayerId(),
    name: "Guest",
    ws,
  };

  ws.on("message", (data) => {
    const room = findRoomForClient(client.id) ?? null;
    handleMessage(client, room, data.toString());
  });

  ws.on("close", () => {
    removeClient(client.id);
  });

  ws.send(JSON.stringify({ type: "welcome", playerId: client.id }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Trust multiplayer listening on 0.0.0.0:${PORT}`);
});
