// macOS development installer. Uses Codex's official marketplace/cachebuster helpers.
// No account configuration is edited, no model is invoked and nothing is published.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { copyDistribution, root } from "./distribution.mjs";

if (process.platform !== "darwin")
  throw new Error(
    "The one-command installer currently supports macOS. See README for portable build and manual installation.",
  );
const codexHome = process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
const helpers =
  process.env.GAKKI_PLUGIN_HELPERS ??
  path.join(codexHome, "skills/.system/plugin-creator/scripts");
await fs.access(path.join(helpers, "create_basic_plugin.py"));
const applicationCli = "/Applications/ChatGPT.app/Contents/Resources/codex";
const codex =
  process.env.GAKKI_CODEX_BIN ??
  (await fs.access(applicationCli).then(
    () => applicationCli,
    () => "codex",
  ));
const destination = path.join(os.homedir(), "plugins/gakki");
const marketplace = path.join(os.homedir(), ".agents/plugins/marketplace.json");
const marker = path.join(destination, ".gakki-development.json");
const owner = await fs.readFile(marker, "utf8").then(JSON.parse, (e) => {
  if (e.code === "ENOENT") return null;
  throw e;
});
const exists = await fs.access(destination).then(
  () => true,
  () => false,
);
if (exists && owner?.source !== root)
  throw new Error(
    `Refusing to overwrite an unrelated plugin at ${destination}. Resolve that path before installing.`,
  );

const runId = new Date().toISOString().replaceAll(":", "-");
const log = path.join(root, "../../achieve/dev", runId + ".log");
await fs.mkdir(path.dirname(log), { recursive: true });
async function run(command, args, cwd = root) {
  console.log(`> ${path.basename(command)} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  await fs.appendFile(
    log,
    `${command} ${args.join(" ")}\n${result.stdout ?? ""}${result.stderr ?? ""}\n`,
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `${path.basename(command)} failed: ${result.error?.message ?? result.stderr ?? result.stdout}. Log: ${log}`,
    );
  return result.stdout.trim();
}
// Validate existing marketplace identifiers before making changes.
const marketplaceExists = await fs.access(marketplace).then(
  () => true,
  () => false,
);
if (marketplaceExists)
  await run("python3", [path.join(helpers, "read_marketplace_name.py")]);
await run(process.execPath, ["scripts/build.mjs"]);
await run("python3", [path.join(helpers, "validate_plugin.py"), root]);
if (!exists) {
  await run("python3", [
    path.join(helpers, "create_basic_plugin.py"),
    "gakki",
    "--with-marketplace",
    "--with-skills",
    "--with-mcp",
    "--with-scripts",
  ]);
  await fs.writeFile(marker, JSON.stringify({ source: root }, null, 2));
}
const marketName = await run("python3", [
  path.join(helpers, "read_marketplace_name.py"),
]);
const oldLock = await fs
  .readFile(path.join(destination, "package-lock.json"), "utf8")
  .catch((e) => {
    if (e.code === "ENOENT") return null;
    throw e;
  });
await copyDistribution(destination);
const newLock = await fs.readFile(
  path.join(destination, "package-lock.json"),
  "utf8",
);
const hasRuntime = await fs
  .access(path.join(destination, "node_modules/sharp/package.json"))
  .then(
    () => true,
    () => false,
  );
if (oldLock !== newLock || !hasRuntime)
  await run(process.execPath, ["scripts/setup.mjs"], destination);
await run("python3", [
  path.join(helpers, "update_plugin_cachebuster.py"),
  destination,
]);
await run("python3", [path.join(helpers, "validate_plugin.py"), destination]);
console.log(await run(codex, ["plugin", "add", `gakki@${marketName}`]));
console.log(
  `GAKKI updated. Start a NEW Codex task to pick up changed skills/tools.\nDebug locally without reinstall: npm run debug -- doctor\nInstallation log: ${log}`,
);
