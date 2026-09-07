import { execSync } from "child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "fs";
import { resolve } from "path";

const root = resolve(import.meta.dirname, "..");

console.log("Building Next.js...");
execSync("node node_modules/next/dist/bin/next build", { cwd: root, stdio: "inherit" });

const standalone = resolve(root, ".next/standalone");

if (!existsSync(resolve(standalone, "server.js"))) {
  console.error("Standalone server.js not generated. Build may have failed.");
  process.exit(1);
}

const dotNext = resolve(standalone, ".next");
mkdirSync(dotNext, { recursive: true });

cpSync(resolve(root, ".next/static"), resolve(dotNext, "static"), {
  recursive: true,
  force: true,
});

const pub = resolve(root, "public");
if (existsSync(pub)) {
  cpSync(pub, resolve(standalone, "public"), { recursive: true, force: true });
}

// --- Trim the standalone bundle to runtime essentials -----------------------
// Next's NFT tracer pulls in the ENTIRE project (the ~1.7 GB src-tauri Rust
// build dir and the ~365 MB gbp-monitor Python dir) because the scraper route
// resolves paths via process.cwd(). The standalone server only needs
// server.js + .next + node_modules + public + package.json, so drop everything
// else. Runtime data is shipped separately via the dist-data bundle below.
const KEEP = new Set(["server.js", ".next", "node_modules", "public", "package.json"]);
for (const entry of readdirSync(standalone)) {
  if (KEEP.has(entry)) continue;
  rmSync(resolve(standalone, entry), { recursive: true, force: true });
}

// Remove non-glibc `sharp` (image optimization) platform binaries. They ship
// musl/win32/darwin variants that break linuxdeploy AppImage bundling
// (linuxdeploy cannot resolve libc.musl-x86_64.so.1) and are never loaded on
// glibc Linux anyway.
const imgDir = resolve(standalone, "node_modules/@img");
if (existsSync(imgDir)) {
  for (const dir of readdirSync(imgDir)) {
    if (/musl|win32|darwin/.test(dir)) {
      rmSync(resolve(imgDir, dir), { recursive: true, force: true });
    }
  }
}

// --- Build the runtime data bundle -----------------------------------------
// The dashboard reads JSON data from GBP_ROOT/data + GBP_ROOT/config (resolved
// via the GBP_ROOT env set by the Tauri shell). We ship ONLY the files the UI
// actually reads (config + review snapshots/deltas) and skip the ~360 MB of
// scraper debug PNGs and any active-business override, so the desktop app
// renders the real seed dashboard from real snapshots instead of an empty one.
console.log("Preparing runtime data bundle...");
const dataBundle = resolve(root, "dist-data");
rmSync(dataBundle, { recursive: true, force: true });

const copyDir = (from, to) => {
  if (!existsSync(from)) return;
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true, force: true });
};

mkdirSync(resolve(dataBundle, "config"), { recursive: true });
// Copy config but never the active-business override: it would scope the UI to
// a business data dir that does not ship, rendering an empty dashboard.
for (const f of readdirSync(resolve(root, "gbp-monitor/config"))) {
  if (f === "user-business.json") continue;
  cpSync(resolve(root, "gbp-monitor/config", f), resolve(dataBundle, "config", f), {
    force: true,
  });
}

mkdirSync(resolve(dataBundle, "data"), { recursive: true });
copyDir(resolve(root, "gbp-monitor/data/snapshots"), resolve(dataBundle, "data/snapshots"));
copyDir(resolve(root, "gbp-monitor/data/reviews_new"), resolve(dataBundle, "data/reviews_new"));
// Legacy flat snapshot files at the data root (e.g. m5_probe_*.json).
for (const f of readdirSync(resolve(root, "gbp-monitor/data"))) {
  if (f.endsWith(".json")) {
    cpSync(resolve(root, "gbp-monitor/data", f), resolve(dataBundle, "data", f), { force: true });
  }
}

console.log("Build complete — standalone at", standalone, "| data bundle at", dataBundle);
