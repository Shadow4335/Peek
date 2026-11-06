import type { Metadata } from "next";
import { CreateRoomClient } from "./CreateRoomClient";

export const metadata: Metadata = { title: "Create room · Hide & Seek" };

export default function CreateRoomPage() {
  return (
    <main className="flex h-full flex-1 flex-col">
      <CreateRoomClient />
    </main>
  );
}
