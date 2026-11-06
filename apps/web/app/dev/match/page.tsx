import { notFound } from "next/navigation";
import { MatchFixture } from "./MatchFixture";

// Dev-only QA harness for the match views with a simulated game server. 404 in production.
export default function DevMatchPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="flex h-full min-h-0 flex-1 flex-col">
      <MatchFixture />
    </main>
  );
}
