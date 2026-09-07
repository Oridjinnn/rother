export interface HealthPoint {
  success: number;
  failed: number;
  skipped: number;
  timestamp: string;
  level: string;
}

export function computeLevel(success: number, failed: number): string {
  if (failed === 0) return "healthy";
  if (failed >= success && success >= 0) return "critical";
  return "warning";
}

/** Parse a run_summary line from data/run.log. Supports current JSONLOG and legacy formats. */
export function parseRunSummaryLine(line: string): HealthPoint | null {
  // Match JSONLOG format (current): "... INFO gbp-monitor.run_all JSONLOG: {...stage:"run_summary"...}"
  const jsonlogMatch = line.match(
    /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d+\s+INFO\s+gbp-monitor\.run_all\s+JSONLOG:\s*(\{.+\})\s*$/,
  );
  if (jsonlogMatch) {
    try {
      const data = JSON.parse(jsonlogMatch[2]);
      if (data?.stage === "run_summary") {
        const timestamp = jsonlogMatch[1].replace(" ", "T") + "Z";
        const success = Number(data.success) || 0;
        const failed = Number(data.failed) || 0;
        const skipped = Number(data.skipped) || 0;
        return { success, failed, skipped, timestamp, level: computeLevel(success, failed) };
      }
    } catch {
      return null;
    }
  }

  // Fallback: match legacy "Run summary: {...}" format for backward compatibility.
  const legacyMatch = line.match(
    /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d+\s+INFO\s+gbp-monitor\.run_all\s+Run summary:\s*(\{.+\})\s*$/,
  );
  if (legacyMatch) {
    try {
      const data = JSON.parse(legacyMatch[2]);
      const timestamp = legacyMatch[1].replace(" ", "T") + "Z";
      const success = Number(data.success) || 0;
      const failed = Number(data.failed) || 0;
      const skipped = Number(data.skipped) || 0;
      return { success, failed, skipped, timestamp, level: computeLevel(success, failed) };
    } catch {
      return null;
    }
  }

  return null;
}
