# Evolution of Trust — Multiplayer Sandbox

A shared WebSocket sandbox for [Nicky Case’s *The Evolution of Trust*](https://ncase.me/trust/) (CC0). Host or join a room with a **6-digit PIN**, tweak payoff tournament settings together, and watch **25 strategy agents** play round-robin iterated Prisoner’s Dilemma on a ring canvas.

> **Credit:** Game design and original explorable by [Nicky Case](https://ncase.me/) — [*The Evolution of Trust*](https://ncase.me/trust/) (CC0). This project is an unofficial multiplayer sandbox inspired by that work.

## Monorepo layout

| Package | Role |
|---------|------|
| `shared/` | TypeScript PD strategies (`tft`, `all_d`, `all_c`, `grudge`, `prober`, `tf2t`, `pavlov`, `random`), round-robin tournament, eliminate-worst / reproduce-best evolution, deterministic RNG from room seed |
| `server/` | Node WebSocket room server (6-digit PIN, shared controls, authoritative simulation, snapshot broadcast). In production serves `client/dist` on `process.env.PORT` |
| `client/` | Vite + React lobby, player list, sandbox controls, canvas ring of peeps |

## Local development

Requirements: **Node 20** (see `.node-version`).

```bash
npm install
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000). One player **Host room**, others **Join** with the PIN.

For hot reload during development (optional):

```bash
npm install
npm run dev -w server   # terminal 1 — API + WS on :3000
npm run dev -w client   # terminal 2 — Vite on :5173 (proxies /ws)
```

## Deploy on Render

This repo includes a [Render Blueprint](https://render.com/docs/blueprint-spec) (`render.yaml`) for a **free Node web service** in **Singapore**:

- **Build:** `npm install && npm run build`
- **Start:** `npm start`
- Binds to `0.0.0.0` and `PORT` automatically.

1. Push this repository to GitHub.
2. In the [Render Dashboard](https://dashboard.render.com/), create a **Blueprint** from the repo (or add a **Web Service** manually with the same build/start commands).
3. After deploy, share the `onrender.com` URL; players connect in the browser — WebSocket path is `/ws`.

Do not commit secrets; no database is required (ephemeral in-memory rooms).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Builds `shared`, then `client`, then `server` |
| `npm start` | Production server (`@trust/server`) |

## License

Application code in this repository: MIT (or your choice). *Evolution of Trust* concepts and strategy names follow Nicky Case’s CC0 original.
