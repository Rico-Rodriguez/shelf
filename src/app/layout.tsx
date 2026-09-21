import type { Metadata, Viewport } from "next";
import { ZoomLock } from "@/components/ZoomLock";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shelf",
  description: "A tidy personal money room.",
  applicationName: "Shelf",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Shelf",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#FAF7F2",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className="antialiased"
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
        }}
      >
        <ZoomLock />
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
