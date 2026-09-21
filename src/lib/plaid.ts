import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";

export const TRIAL_ITEM_LIMIT = 10;

export function plaidConfigured(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

export function plaidEnv(): "sandbox" | "production" {
  return process.env.PLAID_ENV === "production" ? "production" : "sandbox";
}

export function getPlaidClient(): PlaidApi {
  if (!plaidConfigured()) {
    throw new Error("Plaid keys are not set. Add PLAID_CLIENT_ID and PLAID_SECRET to .env.");
  }
  const env = plaidEnv();
  const config = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
        "PLAID-SECRET": process.env.PLAID_SECRET!,
      },
    },
  });
  return new PlaidApi(config);
}

export function linkProducts() {
  return {
    products: [Products.Transactions],
    additional_consented_products: [Products.Investments, Products.Liabilities],
    country_codes: [CountryCode.Us, CountryCode.Ca],
    transactions: { days_requested: 730 },
  };
}

export function dollarsFromPlaid(amount: number | null | undefined): number {
  if (amount == null) return 0;
  return Math.round(amount * 100);
}

export function plaidErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "response" in err) {
    const data = (err as { response?: { data?: { error_code?: string; error_message?: string } } }).response?.data;
    if (data?.error_code) {
      return data.error_message ? `${data.error_code}: ${data.error_message}` : data.error_code;
    }
  }
  return err instanceof Error ? err.message : "Plaid error";
}
