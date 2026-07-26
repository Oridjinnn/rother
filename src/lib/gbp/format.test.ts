import { describe, it, expect } from "vitest";
import { parseRelativeDate } from "./format";

describe("parseRelativeDate", () => {
  const scrapedAt = "2026-07-23T09:53:45.695184+00:00";

  it("parses Indonesian: X hari lalu", () => {
    expect(parseRelativeDate("5 hari lalu", scrapedAt)).toBe("2026-07-18");
  });

  it("parses Indonesian: sehari lalu", () => {
    expect(parseRelativeDate("sehari lalu", scrapedAt)).toBe("2026-07-22");
  });

  it("parses Indonesian: X minggu lalu", () => {
    expect(parseRelativeDate("2 minggu lalu", scrapedAt)).toBe("2026-07-09");
  });

  it("parses Indonesian: seminggu lalu", () => {
    expect(parseRelativeDate("seminggu lalu", scrapedAt)).toBe("2026-07-16");
  });

  it("parses Indonesian: X bulan lalu", () => {
    expect(parseRelativeDate("3 bulan lalu", scrapedAt)).toBe("2026-04-23");
  });

  it("parses Indonesian: sebulan lalu", () => {
    expect(parseRelativeDate("sebulan lalu", scrapedAt)).toBe("2026-06-23");
  });

  it("parses Indonesian: 2 bulan lalu", () => {
    expect(parseRelativeDate("2 bulan lalu", scrapedAt)).toBe("2026-05-23");
  });

  it("parses Indonesian: X tahun lalu", () => {
    expect(parseRelativeDate("1 tahun lalu", scrapedAt)).toBe("2025-07-23");
  });

  it("parses Indonesian: setahun lalu", () => {
    expect(parseRelativeDate("setahun lalu", scrapedAt)).toBe("2025-07-23");
  });

  it("parses English: X days ago", () => {
    expect(parseRelativeDate("5 days ago", scrapedAt)).toBe("2026-07-18");
  });

  it("parses English: a day ago", () => {
    expect(parseRelativeDate("a day ago", scrapedAt)).toBe("2026-07-22");
  });

  it("parses English: X weeks ago", () => {
    expect(parseRelativeDate("2 weeks ago", scrapedAt)).toBe("2026-07-09");
  });

  it("parses English: a week ago", () => {
    expect(parseRelativeDate("a week ago", scrapedAt)).toBe("2026-07-16");
  });

  it("parses English: X months ago", () => {
    expect(parseRelativeDate("3 months ago", scrapedAt)).toBe("2026-04-23");
  });

  it("parses English: a month ago", () => {
    expect(parseRelativeDate("a month ago", scrapedAt)).toBe("2026-06-23");
  });

  it("parses English: X years ago", () => {
    expect(parseRelativeDate("2 years ago", scrapedAt)).toBe("2024-07-23");
  });

  it("returns null for null input", () => {
    expect(parseRelativeDate(null, scrapedAt)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseRelativeDate(undefined, scrapedAt)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseRelativeDate("", scrapedAt)).toBeNull();
  });

  it("returns null for unparseable string", () => {
    expect(parseRelativeDate("some random text", scrapedAt)).toBeNull();
  });

  it("returns null for invalid scrapedAt", () => {
    expect(parseRelativeDate("5 days ago", "not-a-date")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(parseRelativeDate("5 HARI LALU", scrapedAt)).toBe("2026-07-18");
    expect(parseRelativeDate("5 Days Ago", scrapedAt)).toBe("2026-07-18");
  });
});
