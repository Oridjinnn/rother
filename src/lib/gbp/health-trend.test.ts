import { describe, it, expect } from "vitest";
import { parseRunSummaryLine, computeLevel } from "./health-trend";

describe("computeLevel", () => {
  it("returns healthy when failed === 0", () => {
    expect(computeLevel(3, 0)).toBe("healthy");
  });

  it("returns critical when failed >= success", () => {
    expect(computeLevel(2, 2)).toBe("critical");
    expect(computeLevel(1, 3)).toBe("critical");
  });

  it("returns warning when failed > 0 but < success", () => {
    expect(computeLevel(10, 3)).toBe("warning");
  });
});

describe("parseRunSummaryLine", () => {
  const currentFormat =
    '2026-07-20 08:35:48,686 INFO gbp-monitor.run_all JSONLOG: {"run_id":"20260720T083548Z","stage":"run_summary","ts":"2026-07-20T08:35:48.686Z","mode":"fixtures","success":3,"failed":0,"skipped":9,"new_reviews":10,"total_reviews":10,"total_competitors":12,"duration_s":1.2,"error_count":0}';

  it("parses current JSONLOG run_summary format", () => {
    const result = parseRunSummaryLine(currentFormat);
    expect(result).not.toBeNull();
    expect(result!.success).toBe(3);
    expect(result!.failed).toBe(0);
    expect(result!.skipped).toBe(9);
    expect(result!.timestamp).toBe("2026-07-20T08:35:48Z");
    expect(result!.level).toBe("healthy");
  });

  it("parses JSONLOG format with failures", () => {
    const line =
      '2026-07-20 09:00:00,123 INFO gbp-monitor.run_all JSONLOG: {"stage":"run_summary","success":1,"failed":3,"skipped":0}';
    const result = parseRunSummaryLine(line);
    expect(result).not.toBeNull();
    expect(result!.success).toBe(1);
    expect(result!.failed).toBe(3);
    expect(result!.skipped).toBe(0);
    expect(result!.level).toBe("critical");
  });

  it("skips JSONLOG lines that are not run_summary", () => {
    const line =
      '2026-07-20 08:35:48,686 INFO gbp-monitor.run_all JSONLOG: {"stage":"listing_result","progress":"3/12"}';
    expect(parseRunSummaryLine(line)).toBeNull();
  });

  it("parses legacy Run summary format", () => {
    const legacy =
      '2026-07-20 08:30:00,000 INFO gbp-monitor.run_all Run summary: {"success":5,"failed":2,"skipped":1}';
    const result = parseRunSummaryLine(legacy);
    expect(result).not.toBeNull();
    expect(result!.success).toBe(5);
    expect(result!.failed).toBe(2);
    expect(result!.skipped).toBe(1);
    expect(result!.level).toBe("warning");
  });

  it("returns null for unrelated log lines", () => {
    expect(parseRunSummaryLine("some random log line")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseRunSummaryLine("")).toBeNull();
  });

  it("returns null for malformed JSON in JSONLOG", () => {
    const line =
      '2026-07-20 08:35:48,686 INFO gbp-monitor.run_all JSONLOG: {invalid json}';
    expect(parseRunSummaryLine(line)).toBeNull();
  });

  it("returns null for malformed JSON in legacy format", () => {
    const line =
      '2026-07-20 08:35:48,686 INFO gbp-monitor.run_all Run summary: {not really json}';
    expect(parseRunSummaryLine(line)).toBeNull();
  });

  it("handles JSONLOG with missing stage field", () => {
    const line =
      '2026-07-20 08:35:48,686 INFO gbp-monitor.run_all JSONLOG: {"success":3}';
    expect(parseRunSummaryLine(line)).toBeNull();
  });
});
