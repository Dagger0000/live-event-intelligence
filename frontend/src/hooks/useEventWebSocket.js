import { useEffect, useRef, useCallback, useState } from "react";

export function useEventWebSocket(eventId, onMessage) {
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (!eventId) return;
    const token = localStorage.getItem("token");
    const base = import.meta.env.VITE_WS_URL || "ws://localhost:8000";
    const url = `${base}/ws/events/${eventId}${token ? `?token=${token}` : ""}`;

    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
      setConnected(true);
      console.log(`[WS] Connected to event ${eventId}`);
      // Keep-alive ping every 25s
      const pingInterval = setInterval(() => {
        if (ws.current?.readyState === WebSocket.OPEN) ws.current.send("ping");
      }, 25000);
      ws.current._pingInterval = pingInterval;
    };

    ws.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        onMessageRef.current(data);
      } catch (_) {}
    };

    ws.current.onclose = () => {
      setConnected(false);
      clearInterval(ws.current?._pingInterval);
      // Reconnect after 3s
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.current.onerror = () => {
      ws.current?.close();
    };
  }, [eventId]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      clearInterval(ws.current?._pingInterval);
      ws.current?.close();
    };
  }, [connect]);

  return { connected };
}
