import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomSnapshot } from "@trust/shared";

type Outbound =
  | { type: "host"; name: string }
  | { type: "join"; pin: string; name: string }
  | { type: "update_config"; config: Partial<RoomSnapshot["config"]> }
  | { type: "set_agent_strategy"; agentId: string; strategy: string }
  | { type: "reset_population" }
  | { type: "run_step" }
  | { type: "run_tournament_only" };

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

export function useTrustSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let closed = false;
    const connect = () => {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        if (!closed) setConnected(true);
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) setTimeout(connect, 1500);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as {
            type: string;
            playerId?: string;
            data?: RoomSnapshot;
            message?: string;
          };
          if (msg.type === "welcome" && msg.playerId) setPlayerId(msg.playerId);
          if (msg.type === "snapshot" && msg.data) {
            setSnapshot(msg.data);
            setError(null);
          }
          if (msg.type === "error" && msg.message) setError(msg.message);
        } catch {
          /* ignore */
        }
      };
    };
    connect();
    return () => {
      closed = true;
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((msg: Outbound) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const host = useCallback(
    (name: string) => send({ type: "host", name }),
    [send]
  );

  const join = useCallback(
    (pin: string, name: string) => send({ type: "join", pin, name }),
    [send]
  );

  return { connected, playerId, snapshot, error, send, host, join };
}
