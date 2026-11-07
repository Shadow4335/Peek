"use client";

import QRCode from "qrcode";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

/** Full-screen QR so nearby players join by pointing their camera — no typing. */
export function InviteQr({ code, onClose }: { code: string; onClose: () => void }) {
  const [svg, setSvg] = useState<string | null>(null);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/room/${code}`;

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then((s) => !cancelled && setSvg(s))
      .catch(() => !cancelled && setSvg(null));
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div
      role="dialog"
      aria-label="Invite QR code"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/95 p-6"
      onClick={onClose}
    >
      <p className="text-sm uppercase tracking-[0.3em] text-neutral-400">Scan to join</p>
      <div
        data-testid="invite-qr"
        className="w-full max-w-xs rounded-3xl bg-white p-4 [&>svg]:h-auto [&>svg]:w-full"
        // Generated locally by the qrcode library from our own URL.
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      />
      <p className="font-mono text-4xl font-black tracking-[0.3em] text-hider">{code}</p>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="grid size-12 place-items-center rounded-full bg-neutral-900 ring-1 ring-neutral-700"
      >
        <X className="size-5" />
      </button>
    </div>
  );
}
