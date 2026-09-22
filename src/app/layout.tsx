import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { ZoomLock } from "@/components/ZoomLock";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
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
    <html lang="en" className={outfit.variable}>
      <body className="antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("shelf-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
        <ZoomLock />
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
