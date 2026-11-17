import { useEffect, useState } from 'react';
import type { ClientToServerEvents, ServerInfo, ServerToClientEvents } from '@bang/contracts';
import { io, type Socket } from 'socket.io-client';

type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export function useServerConnection() {
  const [status, setStatus] = useState<ConnectionState>('connecting');
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
      autoConnect: false,
    });

    socket.on('connect', () => setStatus('connected'));
    socket.on('disconnect', () => {
      setStatus('disconnected');
      setServerInfo(null);
    });
    socket.on('connect_error', () => setStatus('disconnected'));
    socket.io.on('reconnect_attempt', () => setStatus('connecting'));
    socket.on('server:info', setServerInfo);
    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  return { status, serverInfo };
}
