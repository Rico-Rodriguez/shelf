import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shelf",
  description: "Shelf runs as an iOS and Android app. This server keeps your data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f3f5f7", color: "#1c1f24", fontFamily: "Georgia, 'Times New Roman', serif" }}>
        {children}
      </body>
    </html>
  );
}
