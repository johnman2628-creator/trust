# Evolution of Trust — Multiplayer Sandbox

A shared WebSocket sandbox for [Nicky Case’s *The Evolution of Trust*](https://ncase.me/trust/) (CC0). Host or join a room with a **6-digit PIN**, tweak payoff tournament settings together, and watch **25 strategy agents** play round-robin iterated Prisoner’s Dilemma on a ring canvas.

> **Credit:** Game design and original explorable by [Nicky Case](https://ncase.me/) — [*The Evolution of Trust*](https://ncase.me/trust/) (CC0). This project is an unofficial multiplayer sandbox inspired by that work.

## Monorepo layout

| Package | Role |
|---------|------|
| `shared/` | TypeScript PD strategies, tournament + evolution, deterministic RNG (used by the Worker DO) |
| `worker/` | **Production:** Cloudflare Worker (static assets + `/api/host`) and **GameRoom** Durable Object (WebSocket hibernation, authoritative sim) |
| `client/` | Vite + React UI; connects to same-origin `wss://…/ws/:pin` |
| `server/` | Optional legacy Node + Express server for local comparison (`npm run build:legacy` / `npm start`) |

## Requirements

- **Node 20** (see `.node-version`)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (installed via `npm install` in this repo)
- Cloudflare account for deploy (you run deploy locally — no tokens in chat)

## Build

```bash
npm install
npm run build
```

Builds `shared`, the Vite client (`client/dist`), and validates the Worker bundle with `wrangler deploy --dry-run`.

## Local development (Cloudflare)

Terminal 1 — Worker + static assets + Durable Objects (default port **8787**):

```bash
npm run dev
# or: npm run dev -w worker
```

Terminal 2 — optional Vite hot reload for UI (proxies `/ws`, `/api`, `/health` to 8787):

```bash
npm run dev:client
```

Open [http://localhost:8787](http://localhost:8787) when using Wrangler alone, or [http://localhost:5173](http://localhost:5173) with the Vite dev server.

## Deploy to Cloudflare Workers (free tier)

1. Log in once on your machine: `npx wrangler login`
2. From the repo root:

```bash
npm run deploy
```

Or:

```bash
npm run build
npx wrangler deploy --config worker/wrangler.jsonc
```

3. Share the `*.workers.dev` URL (or attach a custom domain in the Cloudflare dashboard).

### Architecture

- **Workers Static Assets** serve `client/dist` (SPA fallback).
- **`POST /api/host`** allocates a 6-digit PIN and creates a **GameRoom** Durable Object via `idFromName(pin)`.
- **WebSocket** clients connect to **`/ws/:pin`** on the same origin; the DO uses the [WebSocket Hibernation API](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) (`acceptWebSocket`, `webSocketMessage`, `webSocketClose`).
- Room state and simulation use the same rules as `shared/` (population 25, noise, eliminate / reproduce).

`worker/wrangler.jsonc` includes a Durable Object binding and a `new_sqlite_classes` migration for `GameRoom`.

## Legacy Node server (optional)

```bash
npm run build:legacy
npm start
```

Serves on `http://localhost:3000` with a single-process WebSocket server (no Cloudflare).

## Render (optional)

`render.yaml` remains for the legacy Node stack if you prefer Render; **production for this repo is Cloudflare Workers**.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build shared + client + Worker dry-run bundle |
| `npm run dev` | `wrangler dev` (Worker + DO + assets) |
| `npm run deploy` | Build and `wrangler deploy` |
| `npm run build:legacy` | Build shared + client + Node server |
| `npm start` | Legacy Node production server |

## License

Application code in this repository: MIT (or your choice). *Evolution of Trust* concepts and strategy names follow Nicky Case’s CC0 original.
