import { describe, expect, it } from "vitest";
import type { Transaction } from "plaid";
import { collectLogo, logoLookup, plaidLogo } from "./merchant-logos";

const tx = (over: Partial<Transaction>) => over as Transaction;

describe("plaidLogo", () => {
  it("prefers the transaction's own logo", () => {
    expect(plaidLogo(tx({ logo_url: "https://plaid-merchant-logos.plaid.com/a.png" }))).toBe("https://plaid-merchant-logos.plaid.com/a.png");
  });
  it("falls back to the merchant counterparty and ignores non-https", () => {
    const found = plaidLogo(
      tx({
        logo_url: "http://insecure.example/a.png",
        counterparties: [
          { name: "Bank", type: "financial_institution", website: null, logo_url: "https://x.example/bank.png" },
          { name: "Starbucks", type: "merchant", website: null, logo_url: "https://x.example/sbux.png" },
        ] as Transaction["counterparties"],
      }),
    );
    expect(found).toBe("https://x.example/sbux.png");
  });
  it("returns null without a logo", () => {
    expect(plaidLogo(tx({}))).toBeNull();
  });
});

describe("collectLogo and logoLookup", () => {
  it("keys by merchant name and maps renamed display names", () => {
    const into = new Map<string, string>();
    collectLogo(into, tx({ merchant_name: "Uber Eats", name: "UBER *EATS PENDING", logo_url: "https://x.example/uber.png" }));
    expect(into.get("uber eats")).toBe("https://x.example/uber.png");
    const logos = logoLookup(Object.fromEntries(into), [
      { name: "Dinner delivery", merchantName: "Uber Eats", originalDescription: null },
    ]);
    expect(logos["dinner delivery"]).toBe("https://x.example/uber.png");
  });
});
