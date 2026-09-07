import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = await build({
  absWorkingDir: root,
  entryPoints: { mcp: "src/mcp.mjs", cli: "src/cli.mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  external: ["sharp", "playwright-core"],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  legalComments: "linked",
  metafile: true,
});

// Preserve the full license of every package whose code enters our bundle.
const packages = new Map();
for (const input of Object.keys(output.metafile.inputs).filter((p) =>
  p.includes("node_modules/"),
)) {
  let directory = path.dirname(path.join(root, input));
  while (directory.startsWith(root + path.sep)) {
    try {
      const pkg = JSON.parse(
        await fs.readFile(path.join(directory, "package.json"), "utf8"),
      );
      if (pkg.name) {
        packages.set(directory, pkg);
        break;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    directory = path.dirname(directory);
  }
}
let notices = "Bundled third-party code\n========================\n";
for (const [directory, pkg] of [...packages].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  const licenses = (await fs.readdir(directory)).filter((p) =>
    /^licen[sc]e(?:\.|$)/i.test(p),
  );
  if (!licenses.length)
    throw new Error(`Missing license for bundled package ${pkg.name}`);
  notices += `\n${pkg.name}@${pkg.version} (${pkg.license ?? "see below"})\n`;
  for (const name of licenses)
    notices += (await fs.readFile(path.join(directory, name), "utf8")) + "\n";
}
await fs.writeFile(path.join(root, "dist/THIRD_PARTY_LICENSES.txt"), notices);

const fingerprint = createHash("sha256");
async function digest(relative) {
  const location = path.join(root, relative);
  if ((await fs.stat(location)).isDirectory()) {
    for (const child of (await fs.readdir(location)).sort())
      await digest(path.join(relative, child));
  } else {
    fingerprint
      .update(relative)
      .update("\0")
      .update(await fs.readFile(location))
      .update("\0");
  }
}
for (const item of [
  "src",
  "skills",
  "scripts",
  ".codex-plugin",
  ".mcp.json",
  "package-lock.json",
  "README.md",
  "LICENSE",
  "NOTICE.md",
])
  await digest(item);
await fs.writeFile(
  path.join(root, "dist/build-info.json"),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      sourceFingerprint: fingerprint.digest("hex"),
    },
    null,
    2,
  ) + "\n",
);
