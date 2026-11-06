import { Suspense } from "react";
import { RoomScreen } from "@/components/room/RoomScreen";
import { cleanCode } from "@/lib/player";

async function Room({ params }: { params: PageProps<"/room/[code]">["params"] }) {
  const { code } = await params;
  return <RoomScreen code={cleanCode(code)} />;
}

export default function RoomPage(props: PageProps<"/room/[code]">) {
  return (
    <main className="flex h-full min-h-0 flex-1 flex-col">
      <Suspense fallback={null}>
        <Room params={props.params} />
      </Suspense>
    </main>
  );
}
