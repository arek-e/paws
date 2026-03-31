import type { WsSessionMsg as WsSessionMessage } from '@paws/domain-session';
import { useEffect, useRef, useState } from 'react';

interface UseWebSocketResult {
  messages: WsSessionMessage[];
  connected: boolean;
}

export function useWebSocket(url: string | null): UseWebSocketResult {
  const [messages, setMessages] = useState<WsSessionMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!url) return;

    let reconnectTimer: ReturnType<typeof setTimeout>;
    let unmounted = false;

    function connect() {
      if (unmounted) return;

      const ws = new WebSocket(url!);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        if (!unmounted) setConnected(true);
      });

      ws.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(event.data as string) as WsSessionMessage;
          if (!unmounted) {
            setMessages((prev) => [...prev, msg]);
          }
        } catch {
          // ignore non-JSON messages
        }
      });

      ws.addEventListener('close', () => {
        if (!unmounted) {
          setConnected(false);
          reconnectTimer = setTimeout(connect, 3000);
        }
      });

      ws.addEventListener('error', () => {
        ws.close();
      });
    }

    connect();

    return () => {
      unmounted = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [url]);

  return { messages, connected };
}
