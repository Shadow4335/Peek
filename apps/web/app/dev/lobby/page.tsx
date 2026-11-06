import { notFound } from "next/navigation";
import { LobbyFixture } from "./LobbyFixture";

// Dev-only QA harness for the lobby UI without Supabase. 404 in production builds.
export default function DevLobbyPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="flex h-full min-h-0 flex-1 flex-col">
      <LobbyFixture />
    </main>
  );
}
