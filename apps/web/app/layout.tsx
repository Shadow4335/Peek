import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hide & Seek",
  description: "Real-world hide and seek with live geofenced pings.",
  applicationName: "Hide & Seek",
  appleWebApp: { capable: true, title: "Hide&Seek", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192" }],
    apple: [{ url: "/icon-180.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

// Mobile-locked: no pinch zoom (the map handles its own gestures), OLED black chrome.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
