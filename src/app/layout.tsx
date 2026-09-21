import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ZoomLock } from "@/components/ZoomLock";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

const inter = localFont({
  src: "../fonts/InterVariable.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
});

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
  themeColor: "#F2F2F7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">
        <ZoomLock />
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
