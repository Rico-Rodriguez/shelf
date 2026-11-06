import { describe, expect, it } from "vitest";
import { merchantMatchKey, sameMerchant } from "./plan";

describe("merchantMatchKey", () => {
  it("drops store numbers so every location shares one key", () => {
    expect(merchantMatchKey("STARBUCKS #1234")).toBe("starbucks");
    expect(merchantMatchKey("Target 00012345")).toBe("target");
    expect(merchantMatchKey("TRADER JOE'S # 552")).toBe("trader joe s");
  });

  it("drops one trailing place", () => {
    expect(merchantMatchKey("Whole Foods Market - Seattle")).toBe("whole foods market");
  });

  it("keeps short numbers that are part of the name", () => {
    expect(merchantMatchKey("7-Eleven")).toBe("7 eleven");
    expect(merchantMatchKey("76 Gas")).toBe("76 gas");
  });

  it("falls back to the plain name when stripping leaves nothing", () => {
    expect(merchantMatchKey("#1234")).toBe("1234");
  });
});

describe("sameMerchant", () => {
  it("matches one-word merchants across store numbers", () => {
    expect(sameMerchant("Starbucks", "STARBUCKS #1234")).toBe(true);
    expect(sameMerchant("STARBUCKS #1234", "STARBUCKS #5678")).toBe(true);
  });

  it("matches names that share a two-word prefix", () => {
    expect(sameMerchant("Whole Foods", "Whole Foods Market - Seattle")).toBe(true);
  });

  it("does not glue different payees on one shared word", () => {
    expect(sameMerchant("Uber", "Uber Eats")).toBe(false);
    expect(sameMerchant("Amazon", "Amazon Prime")).toBe(false);
  });

  it("never matches an empty name", () => {
    expect(sameMerchant("", "Starbucks")).toBe(false);
  });
});
