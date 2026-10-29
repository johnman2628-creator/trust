import {
  createRoomRng,
  generatePin,
} from "@trust/shared";
import { GameRoom, newPlayerId } from "./game-room.js";

export { GameRoom };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, platform: "cloudflare" });
    }

    if (url.pathname === "/api/host" && request.method === "POST") {
      let body: { name?: string };
      try {
        body = (await request.json()) as { name?: string };
      } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
      }
      const hostName = (body.name ?? "Host").slice(0, 24);
      const rng = createRoomRng(String(Date.now()));
      let pin = generatePin(rng);
      const hostPlayerId = newPlayerId();

      for (let attempt = 0; attempt < 5; attempt++) {
        const id = env.GAME_ROOM.idFromName(pin);
        const stub = env.GAME_ROOM.get(id);
        const res = await stub.fetch(
          new Request("https://do/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin, hostPlayerId, hostName }),
          })
        );
        if (res.status === 409) {
          pin = generatePin(rng);
          continue;
        }
        if (res.ok) {
          return Response.json({ pin, playerId: hostPlayerId });
        }
        pin = generatePin(rng);
      }
      return Response.json({ error: "Could not allocate room" }, { status: 503 });
    }

    const wsMatch = /^\/ws\/(\d{6})$/.exec(url.pathname);
    if (wsMatch) {
      const pin = wsMatch[1];
      const id = env.GAME_ROOM.idFromName(pin);
      const stub = env.GAME_ROOM.get(id);
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
