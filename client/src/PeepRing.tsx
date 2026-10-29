import { useEffect, useRef, type MouseEvent } from "react";
import type { AgentSnapshot } from "@trust/shared";

const COLORS: Record<string, string> = {
  tft: "#5bc0de",
  all_d: "#d9534f",
  all_c: "#5cb85c",
  grudge: "#9966cc",
  prober: "#f0ad4e",
  tf2t: "#428bca",
  pavlov: "#ff77aa",
  random: "#cccccc",
};

interface Props {
  agents: AgentSnapshot[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/**
 * Canvas ring visualization of tournament agents (Nicky Case–style peeps).
 */
export function PeepRing({ agents, selectedId, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = rect.width;
    const h = rect.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.38;

    ctx.fillStyle = "#15111f";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "#3d3552";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    const active = agents.filter((a) => !a.eliminated);
    const maxCoins = Math.max(1, ...active.map((a) => a.coins));

    for (const agent of agents) {
      if (agent.eliminated) continue;
      const x = cx + Math.cos(agent.angle) * radius;
      const y = cy + Math.sin(agent.angle) * radius;
      const r = 10 + (agent.coins / maxCoins) * 8;
      const color = COLORS[agent.strategy] ?? "#aaa";

      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      if (agent.id === selectedId) {
        ctx.strokeStyle = "#e8c547";
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      ctx.fillStyle = "#f4f0e8";
      ctx.font = "10px IBM Plex Sans, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(agent.strategy, x, y + r + 12);
    }

    ctx.fillStyle = "#a89fb8";
    ctx.font = "12px IBM Plex Sans, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Click a peep to change strategy", cx, h - 12);
  }, [agents, selectedId]);

  const handleClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const radius = Math.min(rect.width, rect.height) * 0.38;

    let hit: string | null = null;
    for (const agent of agents) {
      if (agent.eliminated) continue;
      const ax = cx + Math.cos(agent.angle) * radius;
      const ay = cy + Math.sin(agent.angle) * radius;
      const dist = Math.hypot(x - ax, y - ay);
      if (dist < 22) hit = agent.id;
    }
    onSelect(hit);
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      aria-label="Ring of strategy agents"
      role="img"
    />
  );
}
