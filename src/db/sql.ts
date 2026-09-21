export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  budget_mode TEXT NOT NULL DEFAULT 'category',
  planned_income_cents INTEGER NOT NULL DEFAULT 0,
  dashboard_layout TEXT NOT NULL DEFAULT '["netWorth","budget","unreviewed","recurring","transactions","investments"]',
  demo_loaded BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS category_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL,
  sprite TEXT NOT NULL DEFAULT 'box'
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES category_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  flex_bucket TEXT,
  rollover BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  plaid_primary TEXT,
  plaid_detailed TEXT,
  sprite TEXT NOT NULL DEFAULT 'box'
);

CREATE TABLE IF NOT EXISTS plaid_items (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL UNIQUE,
  access_token_enc TEXT NOT NULL,
  institution_id TEXT,
  institution_name TEXT,
  cursor TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  plaid_item_id TEXT REFERENCES plaid_items(id) ON DELETE CASCADE,
  plaid_account_id TEXT,
  name TEXT NOT NULL,
  official_name TEXT,
  type TEXT NOT NULL,
  subtype TEXT,
  mask TEXT,
  current_balance_cents INTEGER NOT NULL DEFAULT 0,
  available_balance_cents INTEGER,
  iso_currency TEXT NOT NULL DEFAULT 'USD',
  is_manual BOOLEAN NOT NULL DEFAULT FALSE,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  include_in_net_worth BOOLEAN NOT NULL DEFAULT TRUE,
  manual_kind TEXT,
  liability_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  plaid_transaction_id TEXT UNIQUE,
  amount_cents INTEGER NOT NULL,
  date TEXT NOT NULL,
  authorized_date TEXT,
  merchant_name TEXT,
  original_description TEXT,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id),
  pending BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  goal_id TEXT,
  is_transfer BOOLEAN NOT NULL DEFAULT FALSE,
  pfc_primary TEXT,
  pfc_detailed TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transaction_splits (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES categories(id),
  amount_cents INTEGER NOT NULL,
  notes TEXT,
  goal_id TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#7BA3A0'
);

CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 0,
  match_merchant TEXT,
  match_description TEXT,
  match_amount_min INTEGER,
  match_amount_max INTEGER,
  match_account_id TEXT,
  match_category_id TEXT,
  action_rename TEXT,
  action_category_id TEXT,
  action_hide BOOLEAN,
  action_tag_names TEXT,
  action_goal_id TEXT,
  action_split_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS budget_months (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  planned_income_cents INTEGER NOT NULL DEFAULT 0,
  UNIQUE (year, month)
);

CREATE TABLE IF NOT EXISTS budget_items (
  id TEXT PRIMARY KEY,
  budget_month_id TEXT NOT NULL REFERENCES budget_months(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id),
  planned_cents INTEGER NOT NULL DEFAULT 0,
  rollover_in_cents INTEGER NOT NULL DEFAULT 0,
  UNIQUE (budget_month_id, category_id)
);

CREATE TABLE IF NOT EXISTS recurrences (
  id TEXT PRIMARY KEY,
  merchant_name TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id),
  account_id TEXT REFERENCES accounts(id),
  amount_cents INTEGER NOT NULL,
  cadence TEXT NOT NULL DEFAULT 'monthly',
  next_date TEXT NOT NULL,
  is_income BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL DEFAULT 'manual',
  last_paid_date TEXT
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  target_cents INTEGER NOT NULL DEFAULT 0,
  target_date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goal_accounts (
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (goal_id, account_id)
);

CREATE TABLE IF NOT EXISTS securities (
  id TEXT PRIMARY KEY,
  plaid_security_id TEXT UNIQUE,
  name TEXT NOT NULL,
  ticker TEXT,
  type TEXT,
  close_price_cents INTEGER,
  close_price_as_of TEXT
);

CREATE TABLE IF NOT EXISTS holdings (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  security_id TEXT NOT NULL REFERENCES securities(id),
  quantity TEXT NOT NULL,
  cost_basis_cents INTEGER,
  institution_value_cents INTEGER NOT NULL DEFAULT 0,
  institution_price_cents INTEGER
);

CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  assets_cents INTEGER NOT NULL,
  liabilities_cents INTEGER NOT NULL,
  net_worth_cents INTEGER NOT NULL
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS dek_salt TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS dek_wrapped TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret_enc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_email TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS secret_enc TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS secret_enc TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS secret_enc TEXT;
ALTER TABLE transaction_splits ADD COLUMN IF NOT EXISTS secret_enc TEXT;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS secret_enc TEXT;
ALTER TABLE budget_months ADD COLUMN IF NOT EXISTS secret_enc TEXT;
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS secret_enc TEXT;
ALTER TABLE recurrences ADD COLUMN IF NOT EXISTS secret_enc TEXT;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS secret_enc TEXT;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS secret_enc TEXT;
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS secret_enc TEXT;
ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS secret_enc TEXT;

CREATE INDEX IF NOT EXISTS tx_date_idx ON transactions (date);
CREATE INDEX IF NOT EXISTS tx_account_idx ON transactions (account_id);
CREATE INDEX IF NOT EXISTS tx_category_idx ON transactions (category_id);
`;
