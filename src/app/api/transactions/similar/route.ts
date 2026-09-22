import { withAuth } from "@/lib/api-guard";
import { requireWriter } from "@/lib/auth";
import { getDb } from "@/db";
import { categorizeSimilarUnreviewed } from "@/lib/rules";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withAuth(async () => {
    const dek = await requireWriter();
    const body = (await request.json()) as { matchMerchant?: unknown; categoryId?: unknown };
    const matchMerchant = typeof body.matchMerchant === "string" ? body.matchMerchant : "";
    const categoryId = typeof body.categoryId === "string" ? body.categoryId : "";
    const db = await getDb();
    return categorizeSimilarUnreviewed(db, dek, { matchMerchant, categoryId });
  });
}
