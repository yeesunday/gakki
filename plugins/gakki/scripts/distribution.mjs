import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Deliberate allowlist: no consumer projects, inputs, research, credentials or node_modules.
export const distributionFiles = [
  ".codex-plugin",
  ".mcp.json",
  "dist",
  "skills",
  "scripts/setup.mjs",
  "package.json",
  "package-lock.json",
  "README.md",
  "LICENSE",
  "NOTICE.md",
];
export async function copyDistribution(destination) {
  for (const item of distributionFiles) {
    await fs.mkdir(path.dirname(path.join(destination, item)), {
      recursive: true,
    });
    await fs.rm(path.join(destination, item), { recursive: true, force: true });
    await fs.cp(path.join(root, item), path.join(destination, item), {
      recursive: true,
    });
  }
}
