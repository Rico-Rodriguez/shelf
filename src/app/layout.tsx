import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { ZoomLock } from "@/components/ZoomLock";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Shelf",
  description: "A private luxury money app — accounts, budget, and cash flow.",
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
  themeColor: "#f3f5f7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable}`}>
      <body className="antialiased">
        <ZoomLock />
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
