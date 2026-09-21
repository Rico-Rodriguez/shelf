import { withAuth } from "@/lib/api-guard";
import { seedDemoHouse } from "@/lib/demo";

export const dynamic = "force-dynamic";

export async function POST() {
  return withAuth(() => seedDemoHouse());
}
