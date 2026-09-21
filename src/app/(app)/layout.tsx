import { AuthGate } from "@/components/AuthGate";

export const dynamic = "force-dynamic";

export default function AppSegmentLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
