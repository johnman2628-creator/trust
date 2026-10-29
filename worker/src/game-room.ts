import {
  DEFAULT_SANDBOX,
  agentsToSnapshots,
  createInitialPopulation,
  type RoomSnapshot,
} from "@trust/shared";
import { applyRoomMessage, type PlayerRecord, type RoomState } from "./room-logic.js";

const STORAGE_KEY = "room";

export interface PlayerAttachment {
  id: string;
  name: string;
}

/** @returns A unique player connection id. */
export function newPlayerId(): string {
  return `p-${crypto.randomUUID().slice(0, 8)}`;
}

export class GameRoom implements DurableObject {
  private state: DurableObjectState;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/create" && request.method === "POST") {
      const body = (await request.json()) as {
        pin: string;
        hostPlayerId: string;
        hostName: string;
      };
      const created = await this.createRoom(body.pin, body.hostPlayerId, body.hostName);
      if (!created) {
        return new Response("Room already exists", { status: 409 });
      }
      return Response.json({ ok: true });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const room = await this.loadRoom();
    if (!room.initialized) {
      return new Response("Room not found", { status: 404 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const queryPlayerId = url.searchParams.get("playerId");
    const playerId = queryPlayerId ?? newPlayerId();
    let playerName = url.searchParams.get("name")?.slice(0, 24) || "Player";

    if (room.pendingHost?.playerId === playerId) {
      playerName = room.pendingHost.name;
      room.hostId = playerId;
      room.pendingHost = undefined;
      room.lastEvent = `${playerName} hosted the room`;
      await this.saveRoom(room);
    }

    const attachment: PlayerAttachment = { id: playerId, name: playerName };
    this.state.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    server.send(JSON.stringify({ type: "welcome", playerId }));

    if (room.pendingHost === undefined && playerName !== "Player") {
      this.broadcastSnapshot(room);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const room = await this.loadRoom();
    const attachment = ws.deserializeAttachment() as PlayerAttachment | null;
    if (!attachment) return;

    const client: PlayerRecord = { id: attachment.id, name: attachment.name };
    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);

    let parsed: { type?: string };
    try {
      parsed = JSON.parse(raw) as { type?: string };
    } catch {
      return;
    }

    if (parsed.type === "run_step" || parsed.type === "run_tournament_only") {
      room.phase = "running";
      await this.saveRoom(room);
      this.broadcastSnapshot(room);
    }

    const result = applyRoomMessage(room, client, raw);
    if (result.error) {
      ws.send(JSON.stringify({ type: "error", message: result.error }));
      return;
    }

    if (client.name !== attachment.name) {
      attachment.name = client.name;
      ws.serializeAttachment(attachment);
    }

    if (!room.hostId) {
      room.hostId = attachment.id;
    }

    await this.saveRoom(room);

    if (result.broadcast) {
      this.broadcastSnapshot(room);
    }
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    const room = await this.loadRoom();
    const attachment = ws.deserializeAttachment() as PlayerAttachment | null;
    const remaining = this.state.getWebSockets().filter((s) => s !== ws);

    if (remaining.length === 0) {
      await this.saveRoom(room);
      return;
    }

    if (attachment && room.hostId === attachment.id) {
      const next = remaining[0].deserializeAttachment() as PlayerAttachment;
      room.hostId = next.id;
    }
    room.lastEvent = "Player left";
    await this.saveRoom(room);
    this.broadcastSnapshot(room);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    ws.close(1011, "WebSocket error");
  }

  /** @returns false if the room was already initialized (PIN collision). */
  private async createRoom(
    pin: string,
    hostPlayerId: string,
    hostName: string
  ): Promise<boolean> {
    const existing = await this.loadRoom();
    if (existing.initialized) {
      return false;
    }

    const config = { ...DEFAULT_SANDBOX, seed: pin };
    const room: RoomState = {
      pin,
      hostId: hostPlayerId,
      config,
      agents: createInitialPopulation(config),
      phase: "lobby",
      generation: 0,
      lastEvent: null,
      initialized: true,
      pendingHost: { playerId: hostPlayerId, name: hostName.slice(0, 24) || "Host" },
    };
    await this.saveRoom(room);
    return true;
  }

  private async loadRoom(): Promise<RoomState> {
    const stored = await this.state.storage.get<RoomState>(STORAGE_KEY);
    if (stored) return stored;
    return {
      pin: "",
      hostId: "",
      config: DEFAULT_SANDBOX,
      agents: [],
      phase: "lobby",
      generation: 0,
      lastEvent: null,
      initialized: false,
    };
  }

  private async saveRoom(room: RoomState): Promise<void> {
    await this.state.storage.put(STORAGE_KEY, room);
  }

  private buildSnapshot(room: RoomState): RoomSnapshot {
    const players = this.state.getWebSockets().map((ws) => {
      const a = ws.deserializeAttachment() as PlayerAttachment;
      return {
        id: a.id,
        name: a.name,
        isHost: a.id === room.hostId,
      };
    });

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

  private broadcastSnapshot(room: RoomState): void {
    const payload = JSON.stringify({
      type: "snapshot",
      data: this.buildSnapshot(room),
    });
    for (const ws of this.state.getWebSockets()) {
      ws.send(payload);
    }
  }
}
