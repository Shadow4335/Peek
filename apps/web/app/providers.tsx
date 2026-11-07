"use client";

import { useEffect } from "react";
import { installPressFeedback } from "@/lib/pressFeedback";
import { SessionProvider } from "@/lib/session";
import { SocketProvider } from "@/lib/socket";

export function Providers({ children }: { children: React.ReactNode }) {
  // One press animation for every button / link-button / tab in the app.
  useEffect(() => installPressFeedback(), []);
  return (
    <SessionProvider>
      <SocketProvider>{children}</SocketProvider>
    </SessionProvider>
  );
}
