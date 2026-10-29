import {
  PD_ONLINE_ROUND_COUNT,
  scoreRound,
  type Move,
  type PdPlayerInfo,
  type PdRoomSnapshot,
  type PdRoundHistoryEntry,
  type PdRoomPhase,
} from "@trust/shared";
import { newPlayerId } from "./game-room.js";

const STORAGE_KEY = "pd_room";

export interface PlayerAttachment {
  id: string;
  name: string;
}

interface RoomState {
  pin: string;
  hostId: string;
  initialized: boolean;
  pendingHost?: { playerId: string; name: string };
  phase: PdRoomPhase;
  round: number;
  totals: Record<string, number>;
  history: PdRoundHistoryEntry[];
  pendingMoves: Record<string, Move>;
  revealAcks: Record<string, boolean>;
  lastRound: PdRoundHistoryEntry | null;
  lastEvent: string | null;
}

type Inbound =
  | { type: "join"; name: string }
  | { type: "submit_move"; move: Move }
  | { type: "ack_reveal" };

export class PdRoom implements DurableObject {
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
      if (!created) return new Response("exists", { status: 409 });
      return Response.json({ ok: true });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const room = await this.loadRoom();
    if (!room.initialized) return new Response("Room not found", { status: 404 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const queryPlayerId = url.searchParams.get("playerId");
    const playerId = queryPlayerId ?? newPlayerId();
    let playerName = url.searchParams.get("name")?.slice(0, 24) || "Player";

    if (room.pendingHost?.playerId === playerId) {
      playerName = room.pendingHost.name;
      room.hostId = playerId;
      room.pendingHost = undefined;
      room.lastEvent = `${playerName} hosted PD room`;
      await this.saveRoom(room);
    }

    const sockets = this.state.getWebSockets();
    if (sockets.length >= 2 && !sockets.some((ws) => (ws.deserializeAttachment() as PlayerAttachment)?.id === playerId)) {
      return new Response("Room full", { status: 403 });
    }

    const attachment: PlayerAttachment = { id: playerId, name: playerName };
    this.state.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    server.send(JSON.stringify({ type: "welcome", playerId }));

    this.broadcast(room);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const room = await this.loadRoom();
    const attachment = ws.deserializeAttachment() as PlayerAttachment | null;
    if (!attachment) return;

    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
    let msg: Inbound;
    try {
      msg = JSON.parse(raw) as Inbound;
    } catch {
      return;
    }

    if (msg.type === "join") {
      attachment.name = msg.name.slice(0, 24) || "Player";
      ws.serializeAttachment(attachment);
      room.lastEvent = `${attachment.name} joined`;
      await this.saveRoom(room);
      await this.maybeStartMatch(room);
      this.broadcast(room);
      return;
    }

    if (msg.type === "submit_move") {
      if (room.phase !== "choosing") return;
      if (msg.move !== "C" && msg.move !== "D") return;
      if (room.pendingMoves[attachment.id]) return;

      room.pendingMoves[attachment.id] = msg.move;
      room.lastEvent = null;
      await this.saveRoom(room);
      await this.resolveRoundIfReady(room);
      this.broadcast(room);
      return;
    }

    if (msg.type === "ack_reveal") {
      if (room.phase !== "reveal") return;
      room.revealAcks[attachment.id] = true;
      await this.saveRoom(room);
      await this.advanceAfterReveal(room);
      this.broadcast(room);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
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
    room.lastEvent = attachment ? `${attachment.name} left` : "Player left";
    room.phase = "lobby";
    room.pendingMoves = {};
    room.revealAcks = {};
    await this.saveRoom(room);
    this.broadcast(room);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    ws.close(1011, "WebSocket error");
  }

  private async createRoom(pin: string, hostPlayerId: string, hostName: string): Promise<boolean> {
    const existing = await this.loadRoom();
    if (existing.initialized) return false;

    const room: RoomState = {
      pin,
      hostId: hostPlayerId,
      initialized: true,
      pendingHost: { playerId: hostPlayerId, name: hostName.slice(0, 24) || "Host" },
      phase: "lobby",
      round: 1,
      totals: {},
      history: [],
      pendingMoves: {},
      revealAcks: {},
      lastRound: null,
      lastEvent: null,
    };
    await this.saveRoom(room);
    return true;
  }

  private async maybeStartMatch(room: RoomState): Promise<void> {
    const players = this.getPlayerAttachments();
    if (players.length < 2 || room.phase !== "lobby") return;
    for (const p of players) {
      if (room.totals[p.id] === undefined) room.totals[p.id] = 0;
    }
    room.phase = "choosing";
    room.round = 1;
    room.pendingMoves = {};
    room.revealAcks = {};
    room.lastEvent = "Match started — choose your moves";
    await this.saveRoom(room);
  }

  private async resolveRoundIfReady(room: RoomState): Promise<void> {
    const players = this.getPlayerAttachments();
    if (players.length !== 2) return;
    const [a, b] = players;
    const moveA = room.pendingMoves[a.id];
    const moveB = room.pendingMoves[b.id];
    if (!moveA || !moveB) return;

    const scores = scoreRound(moveA, moveB);
    const pointsA = scores.player;
    const pointsB = scores.opponent;

    room.totals[a.id] = (room.totals[a.id] ?? 0) + pointsA;
    room.totals[b.id] = (room.totals[b.id] ?? 0) + pointsB;

    const entry: PdRoundHistoryEntry = {
      round: room.round,
      moves: { [a.id]: moveA, [b.id]: moveB },
      points: { [a.id]: pointsA, [b.id]: pointsB },
      totals: { ...room.totals },
    };
    room.history.push(entry);
    room.lastRound = entry;
    room.phase = "reveal";
    room.revealAcks = {};
    room.lastEvent = `Round ${room.round} complete`;
    await this.saveRoom(room);
  }

  private async advanceAfterReveal(room: RoomState): Promise<void> {
    const players = this.getPlayerAttachments();
    if (players.length !== 2) return;
    const allAcked = players.every((p) => room.revealAcks[p.id]);
    if (!allAcked) return;

    if (room.round >= PD_ONLINE_ROUND_COUNT) {
      room.phase = "finished";
      room.pendingMoves = {};
      room.revealAcks = {};
      room.lastEvent = "Match finished";
      await this.saveRoom(room);
      return;
    }

    room.round += 1;
    room.phase = "choosing";
    room.pendingMoves = {};
    room.revealAcks = {};
    room.lastEvent = `Round ${room.round} — choose your moves`;
    await this.saveRoom(room);
  }

  private getPlayerAttachments(): PlayerAttachment[] {
    return this.state.getWebSockets().map((ws) => ws.deserializeAttachment() as PlayerAttachment);
  }

  private async loadRoom(): Promise<RoomState> {
    const stored = await this.state.storage.get<RoomState>(STORAGE_KEY);
    if (stored) return stored;
    return {
      pin: "",
      hostId: "",
      initialized: false,
      phase: "lobby",
      round: 1,
      totals: {},
      history: [],
      pendingMoves: {},
      revealAcks: {},
      lastRound: null,
      lastEvent: null,
    };
  }

  private async saveRoom(room: RoomState): Promise<void> {
    await this.state.storage.put(STORAGE_KEY, room);
  }

  private buildSnapshot(room: RoomState, viewerId: string): PdRoomSnapshot {
    const attachments = this.getPlayerAttachments();
    const players: PdPlayerInfo[] = attachments.map((a) => ({
      id: a.id,
      name: a.name,
      isHost: a.id === room.hostId,
      totalScore: room.totals[a.id] ?? 0,
    }));

    const opponent = attachments.find((a) => a.id !== viewerId);
    const youSubmitted = Boolean(room.pendingMoves[viewerId]);
    const opponentSubmitted = opponent ? Boolean(room.pendingMoves[opponent.id]) : false;

    return {
      pin: room.pin,
      hostId: room.hostId,
      players,
      phase: room.phase,
      round: room.round,
      maxRounds: PD_ONLINE_ROUND_COUNT,
      history: room.history,
      lastRound: room.lastRound,
      youSubmitted,
      opponentSubmitted,
      lastEvent: room.lastEvent,
    };
  }

  private broadcast(room: RoomState): void {
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment() as PlayerAttachment;
      const payload = JSON.stringify({
        type: "pd_snapshot",
        data: this.buildSnapshot(room, att.id),
      });
      ws.send(payload);
    }
  }
}
