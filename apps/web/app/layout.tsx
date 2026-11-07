import type { Metadata, Viewport } from "next";
import { Fredoka, Poppins } from "next/font/google";
import Script from "next/script";
import { INTRO_GATE_SCRIPT, IntroOverlay } from "@/components/IntroOverlay";
import { Providers } from "./providers";
import "./globals.css";

// Self-hosted at build time by next/font — no runtime requests to Google.
const fredoka = Fredoka({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-fredoka", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-poppins", display: "swap" });

export const metadata: Metadata = {
  title: "Peek! — Hide well. Seek better.",
  description: "Real-world hide and seek with friends: draw a zone, hide, and get pinged.",
  applicationName: "Peek!",
  appleWebApp: { capable: true, title: "Peek!", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192" }],
    apple: [{ url: "/icon-180.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

// Mobile-locked: no pinch zoom (the map handles its own gestures), Midnight Playground chrome.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#14151b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the intro gate script may add data-intro before hydration.
    <html lang="en" className={`${fredoka.variable} ${poppins.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex h-full flex-col bg-bg text-ink">
        <Script id="peek-intro-gate" strategy="beforeInteractive">
          {INTRO_GATE_SCRIPT}
        </Script>
        <IntroOverlay />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
