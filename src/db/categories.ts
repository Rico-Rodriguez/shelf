import { count } from "drizzle-orm";
import type { AppDb } from "./index";
import { categories, categoryGroups, settings } from "./schema";

type SeedCategory = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  flexBucket?: string;
  rollover?: boolean;
  sortOrder: number;
  plaidPrimary?: string;
  plaidDetailed?: string;
  sprite: string;
};

type SeedGroup = {
  id: string;
  name: string;
  kind: string;
  sortOrder: number;
  color: string;
  sprite: string;
  categories: SeedCategory[];
};

export const DEFAULT_GROUPS: SeedGroup[] = [
  {
    id: "grp-income",
    name: "Income",
    kind: "income",
    sortOrder: 0,
    color: "#6B8F5E",
    sprite: "leaf",
    categories: [
      { id: "cat-paycheck", name: "Paycheck", slug: "paycheck", kind: "income", sortOrder: 0, plaidPrimary: "INCOME", plaidDetailed: "INCOME_WAGES", sprite: "coins" },
      { id: "cat-interest", name: "Interest", slug: "interest", kind: "income", sortOrder: 1, plaidPrimary: "INCOME", plaidDetailed: "INCOME_INTEREST_EARNED", sprite: "coins" },
      { id: "cat-dividends", name: "Dividends", slug: "dividends", kind: "income", sortOrder: 2, plaidPrimary: "INCOME", plaidDetailed: "INCOME_DIVIDENDS", sprite: "leaf" },
      { id: "cat-other-income", name: "Other income", slug: "other-income", kind: "income", sortOrder: 3, plaidPrimary: "INCOME", sprite: "coins" },
    ],
  },
  {
    id: "grp-home",
    name: "Home",
    kind: "expense",
    sortOrder: 1,
    color: "#C4A484",
    sprite: "house",
    categories: [
      { id: "cat-rent", name: "Rent / Mortgage", slug: "rent", kind: "expense", flexBucket: "fixed", sortOrder: 0, plaidPrimary: "RENT_AND_UTILITIES", plaidDetailed: "RENT_AND_UTILITIES_RENT", sprite: "house" },
      { id: "cat-utilities", name: "Utilities", slug: "utilities", kind: "expense", flexBucket: "fixed", sortOrder: 1, plaidPrimary: "RENT_AND_UTILITIES", sprite: "plug" },
      { id: "cat-home", name: "Home supplies", slug: "home", kind: "expense", flexBucket: "flex", sortOrder: 2, plaidPrimary: "HOME_IMPROVEMENT", sprite: "plant" },
    ],
  },
  {
    id: "grp-food",
    name: "Food",
    kind: "expense",
    sortOrder: 2,
    color: "#E07A5F",
    sprite: "fork",
    categories: [
      { id: "cat-groceries", name: "Groceries", slug: "groceries", kind: "expense", flexBucket: "flex", sortOrder: 0, plaidPrimary: "FOOD_AND_DRINK", plaidDetailed: "FOOD_AND_DRINK_GROCERIES", sprite: "cart" },
      { id: "cat-restaurants", name: "Restaurants", slug: "restaurants", kind: "expense", flexBucket: "flex", sortOrder: 1, plaidPrimary: "FOOD_AND_DRINK", plaidDetailed: "FOOD_AND_DRINK_RESTAURANT", sprite: "fork" },
      { id: "cat-coffee", name: "Coffee", slug: "coffee", kind: "expense", flexBucket: "flex", sortOrder: 2, plaidPrimary: "FOOD_AND_DRINK", plaidDetailed: "FOOD_AND_DRINK_COFFEE", sprite: "mug" },
    ],
  },
  {
    id: "grp-transport",
    name: "Transport",
    kind: "expense",
    sortOrder: 3,
    color: "#4A6FA5",
    sprite: "car",
    categories: [
      { id: "cat-gas", name: "Gas", slug: "gas", kind: "expense", flexBucket: "flex", sortOrder: 0, plaidPrimary: "TRANSPORTATION", plaidDetailed: "TRANSPORTATION_GAS", sprite: "car" },
      { id: "cat-transit", name: "Transit", slug: "transit", kind: "expense", flexBucket: "flex", sortOrder: 1, plaidPrimary: "TRANSPORTATION", sprite: "car" },
      { id: "cat-auto", name: "Auto", slug: "auto", kind: "expense", flexBucket: "non_monthly", rollover: true, sortOrder: 2, plaidPrimary: "GENERAL_SERVICES", plaidDetailed: "GENERAL_SERVICES_AUTOMOTIVE", sprite: "car" },
    ],
  },
  {
    id: "grp-life",
    name: "Life",
    kind: "expense",
    sortOrder: 4,
    color: "#D4847C",
    sprite: "shirt",
    categories: [
      { id: "cat-shopping", name: "Shopping", slug: "shopping", kind: "expense", flexBucket: "flex", sortOrder: 0, plaidPrimary: "GENERAL_MERCHANDISE", sprite: "cart" },
      { id: "cat-clothing", name: "Clothing", slug: "clothing", kind: "expense", flexBucket: "flex", sortOrder: 1, plaidPrimary: "GENERAL_MERCHANDISE", plaidDetailed: "GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES", sprite: "shirt" },
      { id: "cat-personal", name: "Personal care", slug: "personal-care", kind: "expense", flexBucket: "flex", sortOrder: 2, plaidPrimary: "PERSONAL_CARE", sprite: "brush" },
      { id: "cat-medical", name: "Medical", slug: "medical", kind: "expense", flexBucket: "non_monthly", rollover: true, sortOrder: 3, plaidPrimary: "MEDICAL", sprite: "plus" },
      { id: "cat-pets", name: "Pets", slug: "pets", kind: "expense", flexBucket: "flex", sortOrder: 4, plaidPrimary: "GENERAL_MERCHANDISE", plaidDetailed: "GENERAL_MERCHANDISE_PET_SUPPLIES", sprite: "paw" },
    ],
  },
  {
    id: "grp-fun",
    name: "Fun",
    kind: "expense",
    sortOrder: 5,
    color: "#E0A84A",
    sprite: "game",
    categories: [
      { id: "cat-entertainment", name: "Entertainment", slug: "entertainment", kind: "expense", flexBucket: "flex", sortOrder: 0, plaidPrimary: "ENTERTAINMENT", sprite: "game" },
      { id: "cat-streaming", name: "Streaming", slug: "streaming", kind: "expense", flexBucket: "fixed", sortOrder: 1, plaidPrimary: "ENTERTAINMENT", plaidDetailed: "ENTERTAINMENT_TV_AND_MOVIES", sprite: "tv" },
      { id: "cat-travel", name: "Travel", slug: "travel", kind: "expense", flexBucket: "non_monthly", rollover: true, sortOrder: 2, plaidPrimary: "TRAVEL", sprite: "bag" },
    ],
  },
  {
    id: "grp-bills",
    name: "Bills",
    kind: "expense",
    sortOrder: 6,
    color: "#7BA3A0",
    sprite: "paper",
    categories: [
      { id: "cat-phone", name: "Phone", slug: "phone", kind: "expense", flexBucket: "fixed", sortOrder: 0, plaidPrimary: "RENT_AND_UTILITIES", plaidDetailed: "RENT_AND_UTILITIES_TELEPHONE", sprite: "phone" },
      { id: "cat-internet", name: "Internet", slug: "internet", kind: "expense", flexBucket: "fixed", sortOrder: 1, plaidPrimary: "RENT_AND_UTILITIES", plaidDetailed: "RENT_AND_UTILITIES_INTERNET_AND_CABLE", sprite: "plug" },
      { id: "cat-insurance", name: "Insurance", slug: "insurance", kind: "expense", flexBucket: "fixed", sortOrder: 2, plaidPrimary: "GENERAL_SERVICES", plaidDetailed: "GENERAL_SERVICES_INSURANCE", sprite: "shield" },
      { id: "cat-software", name: "Software", slug: "software", kind: "expense", flexBucket: "fixed", sortOrder: 3, plaidPrimary: "GENERAL_SERVICES", sprite: "computer" },
      { id: "cat-fees", name: "Fees", slug: "fees", kind: "expense", flexBucket: "flex", sortOrder: 4, plaidPrimary: "BANK_FEES", sprite: "paper" },
    ],
  },
  {
    id: "grp-giving",
    name: "Giving",
    kind: "expense",
    sortOrder: 7,
    color: "#8B6B9A",
    sprite: "gift",
    categories: [
      { id: "cat-gifts", name: "Gifts", slug: "gifts", kind: "expense", flexBucket: "non_monthly", rollover: true, sortOrder: 0, plaidPrimary: "GENERAL_MERCHANDISE", plaidDetailed: "GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES", sprite: "gift" },
      { id: "cat-charity", name: "Charity", slug: "charity", kind: "expense", flexBucket: "flex", sortOrder: 1, sprite: "heart" },
    ],
  },
  {
    id: "grp-transfer",
    name: "Transfers",
    kind: "transfer",
    sortOrder: 8,
    color: "#8B7355",
    sprite: "swap",
    categories: [
      { id: "cat-transfer", name: "Transfer", slug: "transfer", kind: "transfer", sortOrder: 0, plaidPrimary: "TRANSFER_IN", sprite: "swap" },
      { id: "cat-cc-payment", name: "Credit card payment", slug: "cc-payment", kind: "transfer", sortOrder: 1, plaidPrimary: "TRANSFER_OUT", plaidDetailed: "TRANSFER_OUT_ACCOUNT_TRANSFER", sprite: "swap" },
      { id: "cat-invest", name: "Investment transfer", slug: "invest-transfer", kind: "transfer", sortOrder: 2, sprite: "chart" },
    ],
  },
  {
    id: "grp-other",
    name: "Other",
    kind: "expense",
    sortOrder: 9,
    color: "#9A8B7A",
    sprite: "box",
    categories: [
      { id: "cat-uncategorized", name: "Uncategorized", slug: "uncategorized", kind: "expense", flexBucket: "flex", sortOrder: 0, sprite: "box" },
    ],
  },
];

export async function seedCategoriesIfNeeded(db: AppDb) {
  const [{ n }] = await db.select({ n: count() }).from(categoryGroups);
  if (n > 0) {
    const existing = await db.select().from(settings);
    if (existing.length === 0) {
      await db.insert(settings).values({ id: "default" });
    }
    return;
  }

  for (const group of DEFAULT_GROUPS) {
    await db.insert(categoryGroups).values({
      id: group.id,
      name: group.name,
      kind: group.kind,
      sortOrder: group.sortOrder,
      color: group.color,
      sprite: group.sprite,
    });
    for (const cat of group.categories) {
      await db.insert(categories).values({
        id: cat.id,
        groupId: group.id,
        name: cat.name,
        slug: cat.slug,
        kind: cat.kind,
        flexBucket: cat.flexBucket,
        rollover: cat.rollover ?? false,
        sortOrder: cat.sortOrder,
        plaidPrimary: cat.plaidPrimary,
        plaidDetailed: cat.plaidDetailed,
        sprite: cat.sprite,
      });
    }
  }

  await db.insert(settings).values({ id: "default" }).onConflictDoNothing();
}

export function mapPlaidCategory(primary?: string | null, detailed?: string | null): string {
  if (detailed) {
    for (const group of DEFAULT_GROUPS) {
      for (const cat of group.categories) {
        if (cat.plaidDetailed === detailed) return cat.id;
      }
    }
  }
  if (primary) {
    for (const group of DEFAULT_GROUPS) {
      for (const cat of group.categories) {
        if (cat.plaidPrimary === primary) return cat.id;
      }
    }
    if (primary.startsWith("TRANSFER")) return "cat-transfer";
    if (primary === "LOAN_PAYMENTS") return "cat-cc-payment";
  }
  return "cat-uncategorized";
}
