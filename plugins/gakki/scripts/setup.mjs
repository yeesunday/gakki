import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const child = spawn(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["ci", "--omit=dev", "--no-audit", "--no-fund"],
  { cwd: root, stdio: "inherit", shell: false },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
