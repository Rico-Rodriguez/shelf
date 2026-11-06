import { describe, expect, it } from "vitest";
import { addCalendarMonths, requestedMonth, yearMonth } from "./dates";

describe("addCalendarMonths", () => {
  it("steps by calendar month and clamps to the month's last day", () => {
    expect(addCalendarMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addCalendarMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addCalendarMonths("2026-03-15", 1)).toBe("2026-04-15");
  });

  it("crosses years both ways", () => {
    expect(addCalendarMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addCalendarMonths("2026-01-10", -1)).toBe("2025-12-10");
  });

  it("leaves a malformed date alone", () => {
    expect(addCalendarMonths("not a date", 1)).toBe("not a date");
  });
});

describe("requestedMonth", () => {
  const at = (query: string) => requestedMonth(new URL(`http://x/api/dashboard${query}`));

  it("uses the phone's year and month when both are valid", () => {
    expect(at("?year=2026&month=12")).toEqual({ year: 2026, month: 12 });
  });

  it("falls back to the server month for missing or bad input", () => {
    const now = yearMonth();
    expect(at("")).toEqual(now);
    expect(at("?year=2026")).toEqual(now);
    expect(at("?year=2026&month=13")).toEqual(now);
    expect(at("?year=abc&month=2")).toEqual(now);
  });
});
