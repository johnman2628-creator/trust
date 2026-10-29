import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomSnapshot } from "@trust/shared";

type Outbound =
  | { type: "join"; name: string }
  | { type: "update_config"; config: Partial<RoomSnapshot["config"]> }
  | { type: "set_agent_strategy"; agentId: string; strategy: string }
  | { type: "reset_population" }
  | { type: "run_step" }
  | { type: "run_tournament_only" };

function wsUrlForPin(pin: string, playerId?: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${proto}//${window.location.host}/ws/${pin}`;
  if (!playerId) return base;
  return `${base}?playerId=${encodeURIComponent(playerId)}`;
}

export function useTrustSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingJoinName = useRef<string | null>(null);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  const connectToRoom = useCallback(
    (pin: string, options?: { playerId?: string; name?: string }) => {
      disconnect();
      pendingJoinName.current = options?.name ?? null;
      const ws = new WebSocket(wsUrlForPin(pin, options?.playerId));
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
      };

      ws.onclose = () => {
        setConnected(false);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as {
            type: string;
            playerId?: string;
            data?: RoomSnapshot;
            message?: string;
          };
          if (msg.type === "welcome" && msg.playerId) {
            setPlayerId(msg.playerId);
            const joinName = pendingJoinName.current;
            if (joinName && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "join", name: joinName }));
              pendingJoinName.current = null;
            }
          }
          if (msg.type === "snapshot" && msg.data) {
            setSnapshot(msg.data);
            setError(null);
          }
          if (msg.type === "error" && msg.message) setError(msg.message);
        } catch {
          /* ignore */
        }
      };
    },
    [disconnect]
  );

  useEffect(() => () => disconnect(), [disconnect]);

  const send = useCallback((msg: Outbound) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const host = useCallback(
    async (name: string) => {
      setError(null);
      try {
        const res = await fetch("/api/host", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          setError("Could not create room");
          return;
        }
        const data = (await res.json()) as { pin: string; playerId: string };
        connectToRoom(data.pin, { playerId: data.playerId, name });
      } catch {
        setError("Could not reach server");
      }
    },
    [connectToRoom]
  );

  const join = useCallback(
    (pin: string, name: string) => {
      const normalized = pin.replace(/\D/g, "").slice(0, 6);
      if (normalized.length < 6) {
        setError("Enter a 6-digit PIN");
        return;
      }
      setError(null);
      connectToRoom(normalized, { name });
    },
    [connectToRoom]
  );

  return { connected, playerId, snapshot, error, send, host, join };
}
