import { describe, expect, it } from "vitest";
import { generateRecoveryCodes, hashRecoveryCode } from "./recovery";

describe("recovery codes", () => {
  it("issues eight distinct XXXXX-XXXXX codes from the unambiguous alphabet", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  });

  it("hashes the same code typed loosely to the same value", () => {
    const [code] = generateRecoveryCodes(1);
    const loose = ` ${code.toLowerCase().replace("-", " ")} `;
    expect(hashRecoveryCode(loose)).toBe(hashRecoveryCode(code));
  });
});
