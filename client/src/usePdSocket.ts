import { useCallback, useEffect, useRef, useState } from "react";
import type { Move, PdRoomSnapshot } from "@trust/shared";

type Outbound =
  | { type: "join"; name: string }
  | { type: "submit_move"; move: Move }
  | { type: "ack_reveal" };

function wsUrlForPin(pin: string, playerId?: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${proto}//${window.location.host}/ws/pd/${pin}`;
  if (!playerId) return base;
  return `${base}?playerId=${encodeURIComponent(playerId)}`;
}

export function usePdSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PdRoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingJoinName = useRef<string | null>(null);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setSnapshot(null);
  }, []);

  const connectToRoom = useCallback(
    (pin: string, options?: { playerId?: string; name?: string }) => {
      disconnect();
      pendingJoinName.current = options?.name ?? null;
      const ws = new WebSocket(wsUrlForPin(pin, options?.playerId));
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as {
            type: string;
            playerId?: string;
            data?: PdRoomSnapshot;
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
          if (msg.type === "pd_snapshot" && msg.data) {
            setSnapshot(msg.data);
            setError(null);
          }
          if (msg.type === "error" && msg.message) setError(msg.message);
        } catch {
          /* ignore */
        }
      };

      ws.onerror = () => setError("Connection error");
    },
    [disconnect]
  );

  useEffect(() => () => disconnect(), [disconnect]);

  const send = useCallback((msg: Outbound) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const hostPd = useCallback(
    async (name: string) => {
      setError(null);
      try {
        const res = await fetch("/api/pd/host", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          setError("Could not create PD room");
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

  const joinPd = useCallback(
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

  return { playerId, snapshot, error, send, hostPd, joinPd, disconnect };
}
