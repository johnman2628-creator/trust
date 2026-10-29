import {
  createRoomRng,
  generatePin,
} from "@trust/shared";
import { GameRoom, newPlayerId } from "./game-room.js";
import { PdRoom } from "./pd-room.js";

export { GameRoom, PdRoom };

async function allocateSandboxRoom(
  env: Env,
  hostName: string
): Promise<Response> {
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

async function allocatePdRoom(env: Env, hostName: string): Promise<Response> {
  const rng = createRoomRng(`pd:${Date.now()}`);
  let pin = generatePin(rng);
  const hostPlayerId = newPlayerId();

  for (let attempt = 0; attempt < 5; attempt++) {
    const id = env.PD_ROOM.idFromName(pin);
    const stub = env.PD_ROOM.get(id);
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
  return Response.json({ error: "Could not allocate PD room" }, { status: 503 });
}

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
      return allocateSandboxRoom(env, hostName);
    }

    if (url.pathname === "/api/pd/host" && request.method === "POST") {
      let body: { name?: string };
      try {
        body = (await request.json()) as { name?: string };
      } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
      }
      const hostName = (body.name ?? "Host").slice(0, 24);
      return allocatePdRoom(env, hostName);
    }

    const pdWs = /^\/ws\/pd\/(\d{6})$/.exec(url.pathname);
    if (pdWs) {
      const pin = pdWs[1];
      return env.PD_ROOM.get(env.PD_ROOM.idFromName(pin)).fetch(request);
    }

    const wsMatch = /^\/ws\/(\d{6})$/.exec(url.pathname);
    if (wsMatch) {
      const pin = wsMatch[1];
      return env.GAME_ROOM.get(env.GAME_ROOM.idFromName(pin)).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
