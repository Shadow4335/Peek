import type { Metadata } from "next";
import { AdminConsole } from "@/components/admin/AdminConsole";

export const metadata: Metadata = {
  title: "Referee console · Peek!",
  robots: { index: false, follow: false },
};

// iPad-optimized admin view; the password is verified by the game server, never in the browser.
export default function AdminPage() {
  return (
    <main className="flex h-full min-h-0 flex-1 flex-col">
      <AdminConsole />
    </main>
  );
}
