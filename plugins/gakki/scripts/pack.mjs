import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { copyDistribution, root } from "./distribution.mjs";
const destination = path.resolve(
  process.argv[2] ??
    path.join(
      root,
      "../../achieve/packages",
      new Date().toISOString().replaceAll(":", "-"),
      "gakki",
    ),
);
await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.mkdir(destination); // A previous package must remain inspectable.
await copyDistribution(destination);
const archive = `${destination}.tar.gz`;
execFileSync(
  "tar",
  ["--no-xattrs", "--no-acls", "-czf", archive, "-C", path.dirname(destination), "--", path.basename(destination)],
  // Exclude both extended attributes and macOS AppleDouble metadata from releases.
  { env: { ...process.env, COPYFILE_DISABLE: "1" } },
);
console.log(archive);
