import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  dekSalt: text("dek_salt"),
  dekWrapped: text("dek_wrapped"),
  totpSecretEnc: text("totp_secret_enc"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  googleSub: text("google_sub"),
  googleEmail: text("google_email"),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  id: text("id").primaryKey().default("default"),
  budgetMode: text("budget_mode").notNull().default("category"),
  plannedIncomeCents: integer("planned_income_cents").notNull().default(0),
  dashboardLayout: text("dashboard_layout")
    .notNull()
    .default(
      '["netWorth","budget","unreviewed","recurring","transactions","investments"]',
    ),
  demoLoaded: boolean("demo_loaded").notNull().default(false),
  secretEnc: text("secret_enc"),
});

export const categoryGroups = pgTable("category_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  color: text("color").notNull(),
  sprite: text("sprite").notNull().default("box"),
});

export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  groupId: text("group_id")
    .notNull()
    .references(() => categoryGroups.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  kind: text("kind").notNull(),
  flexBucket: text("flex_bucket"),
  rollover: boolean("rollover").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  plaidPrimary: text("plaid_primary"),
  plaidDetailed: text("plaid_detailed"),
  sprite: text("sprite").notNull().default("box"),
}, (t) => [uniqueIndex("categories_slug_idx").on(t.slug)]);

export const plaidItems = pgTable("plaid_items", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull(),
  accessTokenEnc: text("access_token_enc").notNull(),
  institutionId: text("institution_id"),
  institutionName: text("institution_name"),
  cursor: text("cursor"),
  status: text("status").notNull().default("ok"),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("plaid_items_item_id_idx").on(t.itemId)]);

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  plaidItemId: text("plaid_item_id").references(() => plaidItems.id, {
    onDelete: "cascade",
  }),
  plaidAccountId: text("plaid_account_id"),
  name: text("name").notNull(),
  officialName: text("official_name"),
  type: text("type").notNull(),
  subtype: text("subtype"),
  mask: text("mask"),
  currentBalanceCents: integer("current_balance_cents").notNull().default(0),
  availableBalanceCents: integer("available_balance_cents"),
  isoCurrency: text("iso_currency").notNull().default("USD"),
  isManual: boolean("is_manual").notNull().default(false),
  isHidden: boolean("is_hidden").notNull().default(false),
  includeInNetWorth: boolean("include_in_net_worth").notNull().default(true),
  manualKind: text("manual_kind"),
  liabilityJson: text("liability_json"),
  secretEnc: text("secret_enc"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  plaidTransactionId: text("plaid_transaction_id"),
  amountCents: integer("amount_cents").notNull(),
  date: text("date").notNull(),
  authorizedDate: text("authorized_date"),
  merchantName: text("merchant_name"),
  originalDescription: text("original_description"),
  name: text("name").notNull(),
  categoryId: text("category_id").references(() => categories.id),
  pending: boolean("pending").notNull().default(false),
  reviewed: boolean("reviewed").notNull().default(false),
  hidden: boolean("hidden").notNull().default(false),
  notes: text("notes"),
  goalId: text("goal_id"),
  isTransfer: boolean("is_transfer").notNull().default(false),
  transferPairId: text("transfer_pair_id"),
  pfcPrimary: text("pfc_primary"),
  pfcDetailed: text("pfc_detailed"),
  secretEnc: text("secret_enc"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("tx_plaid_id_idx").on(t.plaidTransactionId)]);

export const transactionSplits = pgTable("transaction_splits", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  categoryId: text("category_id").references(() => categories.id),
  amountCents: integer("amount_cents").notNull(),
  notes: text("notes"),
  goalId: text("goal_id"),
  secretEnc: text("secret_enc"),
});

export const tags = pgTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#7BA3A0"),
}, (t) => [uniqueIndex("tags_name_idx").on(t.name)]);

export const transactionTags = pgTable(
  "transaction_tags",
  {
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.transactionId, t.tagId] })],
);

export const rules = pgTable("rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  matchMerchant: text("match_merchant"),
  matchDescription: text("match_description"),
  matchAmountMin: integer("match_amount_min"),
  matchAmountMax: integer("match_amount_max"),
  matchAccountId: text("match_account_id"),
  matchCategoryId: text("match_category_id"),
  actionRename: text("action_rename"),
  actionCategoryId: text("action_category_id"),
  actionHide: boolean("action_hide"),
  actionTagNames: text("action_tag_names"),
  actionGoalId: text("action_goal_id"),
  actionSplitJson: text("action_split_json"),
  secretEnc: text("secret_enc"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const budgetMonths = pgTable("budget_months", {
  id: text("id").primaryKey(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  plannedIncomeCents: integer("planned_income_cents").notNull().default(0),
  flexPoolCents: integer("flex_pool_cents").notNull().default(0),
  secretEnc: text("secret_enc"),
}, (t) => [uniqueIndex("budget_months_ym_idx").on(t.year, t.month)]);

export const budgetItems = pgTable("budget_items", {
  id: text("id").primaryKey(),
  budgetMonthId: text("budget_month_id")
    .notNull()
    .references(() => budgetMonths.id, { onDelete: "cascade" }),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id),
  plannedCents: integer("planned_cents").notNull().default(0),
  rolloverInCents: integer("rollover_in_cents").notNull().default(0),
  secretEnc: text("secret_enc"),
}, (t) => [uniqueIndex("budget_items_month_cat_idx").on(t.budgetMonthId, t.categoryId)]);

export const recurrences = pgTable("recurrences", {
  id: text("id").primaryKey(),
  merchantName: text("merchant_name").notNull(),
  categoryId: text("category_id").references(() => categories.id),
  accountId: text("account_id").references(() => accounts.id),
  amountCents: integer("amount_cents").notNull(),
  cadence: text("cadence").notNull().default("monthly"),
  nextDate: text("next_date").notNull(),
  isIncome: boolean("is_income").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  source: text("source").notNull().default("manual"),
  lastPaidDate: text("last_paid_date"),
  kind: text("kind").notNull().default("bill"),
  secretEnc: text("secret_enc"),
});

export const suppressedMerchants = pgTable("suppressed_merchants", {
  merchantKey: text("merchant_key").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const goals = pgTable("goals", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  targetCents: integer("target_cents").notNull().default(0),
  targetDate: text("target_date"),
  categoryId: text("category_id"),
  secretEnc: text("secret_enc"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const goalAccounts = pgTable(
  "goal_accounts",
  {
    goalId: text("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.goalId, t.accountId] })],
);

export const securities = pgTable("securities", {
  id: text("id").primaryKey(),
  plaidSecurityId: text("plaid_security_id"),
  name: text("name").notNull(),
  ticker: text("ticker"),
  type: text("type"),
  closePriceCents: integer("close_price_cents"),
  closePriceAsOf: text("close_price_as_of"),
  secretEnc: text("secret_enc"),
}, (t) => [uniqueIndex("securities_plaid_idx").on(t.plaidSecurityId)]);

export const holdings = pgTable("holdings", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  securityId: text("security_id")
    .notNull()
    .references(() => securities.id),
  quantity: text("quantity").notNull(),
  costBasisCents: integer("cost_basis_cents"),
  institutionValueCents: integer("institution_value_cents").notNull().default(0),
  institutionPriceCents: integer("institution_price_cents"),
  secretEnc: text("secret_enc"),
});

export const accountBalanceSnapshots = pgTable(
  "account_balance_snapshots",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    balanceCents: integer("balance_cents").notNull().default(0),
    secretEnc: text("secret_enc"),
  },
  (t) => [uniqueIndex("acct_balance_day_idx").on(t.accountId, t.date)],
);

export const households = pgTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default("Household"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const householdMembers = pgTable(
  "household_members",
  {
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] })],
);

export const householdInvites = pgTable("household_invites", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  codeHash: text("code_hash").notNull(),
  dekSalt: text("dek_salt").notNull(),
  dekWrapped: text("dek_wrapped").notNull(),
  createdBy: text("created_by"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notifications_dedupe_idx").on(t.dedupeKey)],
);

export const netWorthSnapshots = pgTable("net_worth_snapshots", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  assetsCents: integer("assets_cents").notNull(),
  liabilitiesCents: integer("liabilities_cents").notNull(),
  netWorthCents: integer("net_worth_cents").notNull(),
  secretEnc: text("secret_enc"),
}, (t) => [uniqueIndex("nw_date_idx").on(t.date)]);

export const categoryGroupRelations = relations(categoryGroups, ({ many }) => ({
  categories: many(categories),
}));

export const categoryRelations = relations(categories, ({ one }) => ({
  group: one(categoryGroups, {
    fields: [categories.groupId],
    references: [categoryGroups.id],
  }),
}));

export const accountRelations = relations(accounts, ({ one, many }) => ({
  item: one(plaidItems, {
    fields: [accounts.plaidItemId],
    references: [plaidItems.id],
  }),
  transactions: many(transactions),
}));

export const transactionRelations = relations(transactions, ({ one, many }) => ({
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  splits: many(transactionSplits),
}));
