"use client";

import type { ClientToServerEvents, ServerToClientEvents } from "@hideseek/shared";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { publicEnv } from "./env";
import { useSession } from "./session";
import { getSupabase } from "./supabase";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SocketContextValue {
  socket: GameSocket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue>({ socket: null, connected: false });

/**
 * One Socket.io connection to the Render game server per signed-in tab. The access
 * token is read fresh on every (re)connect and pushed via "auth:refresh" on rotation.
 */
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const hasSession = Boolean(session);
  const tokenRef = useRef<string | null>(null);
  useEffect(() => {
    tokenRef.current = session?.access_token ?? null;
  }, [session]);

  const [socket, setSocket] = useState<GameSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!hasSession) return;
    const s: GameSocket = io(publicEnv.gameServerUrl, {
      transports: ["websocket"],
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      auth: (cb) => {
        getSupabase()
          .auth.getSession()
          .then(({ data }) => cb({ token: data.session?.access_token ?? tokenRef.current ?? "" }))
          .catch(() => cb({ token: tokenRef.current ?? "" }));
      },
    });
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onDisconnect);
    setSocket(s);
    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("connect_error", onDisconnect);
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [hasSession]);

  // Push rotated tokens to the live connection.
  const token = session?.access_token;
  useEffect(() => {
    if (socket?.connected && token) socket.emit("auth:refresh", { token });
  }, [socket, token]);

  return <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>;
}

export function useGameSocket() {
  return useContext(SocketContext);
}
