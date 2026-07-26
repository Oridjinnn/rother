import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  GBP_ROOT,
  GBP_SNAPSHOTS_DIR,
  GBP_LISTINGS_PATH,
  GBP_RUN_SUMMARY_PATH,
} from "./paths";
import type { RunSummary } from "./types";
import { sanitizeErrorMessage } from "./sanitize";

export interface RunStatus {
  runId: string;
  status: "starting" | "running" | "completed" | "failed";
  mode: "fixtures" | "live";
  progress: { completed: number; total: number; label: string };
  elapsed: number;
  logTail: string[];
  summary?: RunSummary;
  error?: string;
  stderr?: string;
}

interface ActiveRun {
  proc: ChildProcess;
  mode: "fixtures" | "live";
  startedAt: number;
  status: "running" | "completed" | "failed";
  stdoutBuf: string[];
  stderrBuf: string[];
  totalCompetitors: number;
  initialSnapshotCount: number;
  summary?: RunSummary;
  error?: string;
}

function findPython(): { executable: string; version: string } | null {
  const candidates = ["python3", "python"];
  for (const cmd of candidates) {
    try {
      const result = spawnSync(cmd, ["--version"], {
        encoding: "utf-8",
        timeout: 5_000,
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (result.error) continue;
      if (result.status !== 0) continue;
      const version = (result.stdout || result.stderr || "").trim();
      if (version) return { executable: cmd, version };
    } catch {
      continue;
    }
  }
  return null;
}

async function countCompetitors(): Promise<number> {
  try {
    const buf = await fs.readFile(GBP_LISTINGS_PATH, "utf-8");
    const data = JSON.parse(buf) as { branches: { competitors: unknown[] }[] };
    let total = 0;
    for (const branch of data.branches ?? []) {
      total += (branch.competitors ?? []).length;
    }
    return total || 1;
  } catch {
    return 1;
  }
}

async function countSnapshots(): Promise<number> {
  try {
    const entries = await fs.readdir(GBP_SNAPSHOTS_DIR, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const compDir = path.join(GBP_SNAPSHOTS_DIR, entry.name);
      try {
        const files = await fs.readdir(compDir);
        if (files.some((f) => f !== "latest.json" && f.endsWith(".json"))) {
          count++;
        }
      } catch {
        continue;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

const PROCESS_TIMEOUT_MS = parseInt(
  process.env.SCRAPER_TIMEOUT_MS ?? "600_000",
  10,
);

class ScrapeRunManager {
  private runs = new Map<string, ActiveRun>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
  }

  async start(mode: "fixtures" | "live"): Promise<string> {
    const python = findPython();
    if (!python) {
      throw new Error("No Python executable found. Tried: python3, python.");
    }

    const runId = randomUUID().slice(0, 8);

    const args =
      mode === "live"
        ? ["-m", "orchestration.run_all"]
        : ["-m", "orchestration.run_all", "--fixtures"];

    const totalCompetitors = await countCompetitors();
    const initialSnapshotCount = await countSnapshots();

    const proc = spawn(python.executable, args, {
      cwd: GBP_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const activeRun: ActiveRun = {
      proc,
      mode,
      startedAt: Date.now(),
      status: "running",
      stdoutBuf: [],
      stderrBuf: [],
      totalCompetitors,
      initialSnapshotCount,
    };

    proc.stdout?.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      activeRun.stdoutBuf.push(...lines);
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      activeRun.stderrBuf.push(...lines);
    });

    proc.on("close", async (code) => {
      if (code !== 0) {
        activeRun.status = "failed";
        activeRun.error = `Python exited with code ${code}`;
        return;
      }
      try {
        const summaryJson = await fs.readFile(GBP_RUN_SUMMARY_PATH, "utf-8");
        activeRun.summary = JSON.parse(summaryJson) as RunSummary;
        activeRun.status = "completed";
      } catch (err) {
        activeRun.status = "failed";
        activeRun.error = sanitizeErrorMessage(
          err instanceof Error ? err.message : String(err),
        );
      }
    });

    proc.on("error", (err) => {
      activeRun.status = "failed";
      activeRun.error = err.message;
    });

    const timeout = setTimeout(() => {
      if (activeRun.status === "running") {
        activeRun.status = "failed";
        activeRun.error = `Process timed out after ${PROCESS_TIMEOUT_MS / 1000}s`;
        proc.kill();
      }
    }, PROCESS_TIMEOUT_MS);

    proc.on("close", () => {
      clearTimeout(timeout);
    });

    this.runs.set(runId, activeRun);
    return runId;
  }

  async getStatus(runId: string): Promise<RunStatus | null> {
    const run = this.runs.get(runId);
    if (!run) return null;

    const snapshotCount = await countSnapshots();
    const completed = Math.max(
      0,
      snapshotCount - run.initialSnapshotCount,
    );

    return {
      runId,
      status: run.status,
      mode: run.mode,
      progress: {
        completed,
        total: run.totalCompetitors,
        label: `${completed} / ${run.totalCompetitors}`,
      },
      elapsed: Date.now() - run.startedAt,
      logTail: run.stdoutBuf.slice(-50),
      summary: run.summary,
      error: run.error,
      stderr: run.stderrBuf.join("\n").slice(-2000),
    };
  }

  private cleanup() {
    const now = Date.now();
    for (const [runId, run] of this.runs.entries()) {
      // Kill processes that have been running too long
      if (run.status === "running" && now - run.startedAt > PROCESS_TIMEOUT_MS * 2) {
        run.proc.kill();
        run.status = "failed";
        run.error = `Process killed by cleanup after ${PROCESS_TIMEOUT_MS * 2 / 1000}s`;
      }
      // Remove old completed/failed entries
      if (
        (run.status === "completed" || run.status === "failed") &&
        now - run.startedAt > 300_000
      ) {
        this.runs.delete(runId);
      }
    }
  }

  destroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    for (const [, run] of this.runs) {
      if (run.status === "running") {
        run.proc.kill();
      }
    }
    this.runs.clear();
  }
}

export const scrapeRunManager = new ScrapeRunManager();
