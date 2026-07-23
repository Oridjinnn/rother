import { execSync } from "child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";

const root = resolve(import.meta.dirname, "..");

console.log("Building Next.js...");
execSync("npx next build", { cwd: root, stdio: "inherit" });

const standalone = resolve(root, ".next/standalone");

if (existsSync(resolve(standalone, "server.js"))) {
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

  console.log("Build complete — standalone output ready at", standalone);
} else {
  console.error("Standalone server.js not generated. Build may have failed.");
  process.exit(1);
}
