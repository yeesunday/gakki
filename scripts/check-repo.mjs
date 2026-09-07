// Inspect the files that a normal `git add .` would include, without staging them.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rootFiles = new Set([
  ".gitignore",
  "AGENTS.md",
  "LICENSE",
  "README.md",
  "package.json",
]);
const pluginFiles = new Set([
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "LICENSE",
  "NOTICE.md",
  "README.md",
  "package.json",
  "package-lock.json",
]);
const pluginTrees = new Set(["src", "scripts", "skills", "tests"]);
const sourceExtensions = new Set([".mjs", ".json", ".md", ".yaml"]);
function allowed(relative) {
  if (rootFiles.has(relative)) return true;
  if (/^scripts\/[^/]+\.mjs$/.test(relative)) return true;
  if (!relative.startsWith("plugins/gakki/")) return false;
  const local = relative.slice("plugins/gakki/".length);
  return (
    pluginFiles.has(local) ||
    (pluginTrees.has(local.split("/")[0]) &&
      sourceExtensions.has(path.extname(local)))
  );
}

const candidates = [
  ...new Set(
    execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: root, encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean),
  ),
].sort();
const errors = [];
const files = new Map();
for (const relative of candidates) {
  const location = path.join(root, relative);
  let stat;
  try {
    stat = await fs.lstat(location);
  } catch (error) {
    if (error.code === "ENOENT") continue;
    throw error;
  }
  if (!allowed(relative)) {
    errors.push(`${relative}: outside the public source allowlist`);
    continue;
  }
  if (!stat.isFile()) {
    errors.push(`${relative}: public source must be a regular file`);
    continue;
  }
  if (stat.size > 1024 * 1024) {
    errors.push(`${relative}: unexpected large source file`);
    continue;
  }
  const text = await fs.readFile(location, "utf8");
  files.set(relative, text);
  if (text.includes("\0") || text.includes("\uFFFD"))
    errors.push(`${relative}: non-text content`);
  if (/\/(?:Users|home)\/[A-Za-z0-9_.-]+\//.test(text))
    errors.push(`${relative}: machine-specific home path`);
  if (/-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/.test(text))
    errors.push(`${relative}: private key`);
  if (/\b(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{20,}\b/.test(text))
    errors.push(`${relative}: credential-like value`);
  if (path.extname(relative) === ".json") {
    try {
      JSON.parse(text);
    } catch {
      errors.push(`${relative}: invalid JSON`);
    }
  }
  if (relative.endsWith(".md")) {
    const prose = text.replace(/```[\s\S]*?```/g, "");
    for (const match of prose.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].replace(/^<|>$/g, "");
      if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target)) continue;
      const linked = path.resolve(
        path.dirname(location),
        decodeURIComponent(target.split("#")[0]),
      );
      if (
        !linked.startsWith(root + path.sep) ||
        !allowed(path.relative(root, linked).split(path.sep).join("/"))
      ) {
        errors.push(`${relative}: link outside published source: ${target}`);
      } else {
        await fs
          .access(linked)
          .catch(() => errors.push(`${relative}: missing link: ${target}`));
      }
    }
  }
  if (relative.endsWith("/SKILL.md")) {
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text)?.[1];
    if (
      !frontmatter ||
      !/^name: [a-z0-9-]+$/m.test(frontmatter) ||
      !/^description: \S.+$/m.test(frontmatter)
    ) {
      errors.push(
        `${relative}: expected skill name and description frontmatter`,
      );
    }
  }
}

for (const required of [
  ...rootFiles,
  "scripts/check-repo.mjs",
  "plugins/gakki/.codex-plugin/plugin.json",
  "plugins/gakki/.mcp.json",
  "plugins/gakki/package-lock.json",
  "plugins/gakki/LICENSE",
  "plugins/gakki/src/mcp.mjs",
  "plugins/gakki/src/cli.mjs",
  "plugins/gakki/src/operations.mjs",
  "plugins/gakki/skills/gakki/SKILL.md",
  "plugins/gakki/skills/gakki-assets/SKILL.md",
  "plugins/gakki/tests/mcp.test.mjs",
])
  if (!files.has(required)) errors.push(`Missing public source: ${required}`);

if (!files.get(".gitignore")?.split(/\r?\n/).includes("/achieve/"))
  errors.push("achieve/ must be ignored");
if (files.get("LICENSE") !== files.get("plugins/gakki/LICENSE"))
  errors.push("Repository and distribution licenses differ");
try {
  const manifest = JSON.parse(
    files.get("plugins/gakki/.codex-plugin/plugin.json"),
  );
  const pkg = JSON.parse(files.get("plugins/gakki/package.json"));
  if (manifest.name !== "gakki" || manifest.version !== pkg.version)
    errors.push("Plugin identity/version mismatch");
} catch {
  errors.push("Cannot validate plugin metadata");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Public source check passed: ${files.size} candidate files; archives, dependencies and builds excluded.`,
  );
}
