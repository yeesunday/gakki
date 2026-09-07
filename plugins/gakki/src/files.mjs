import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const writeJson = (file, value) =>
  fs.writeFile(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
export function absolute(value) {
  if (typeof value !== "string" || !path.isAbsolute(value))
    throw new Error("Use an absolute filesystem path");
  return path.resolve(value);
}
export async function file(value) {
  const resolved = await fs.realpath(absolute(value));
  if (!(await fs.stat(resolved)).isFile())
    throw new Error("Expected a regular file");
  return resolved;
}
export async function newOutput(value) {
  const output = absolute(value);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.mkdir(output); // Never mix this run with a previous result.
  return output;
}
export const inside = (root, value) =>
  value === root || value.startsWith(root + path.sep);
export async function snapshot(
  root,
  selected = [],
  { allowMissing = false } = {},
) {
  root = await fs.realpath(absolute(root));
  const records = [];
  for (const item of selected) {
    if (path.isAbsolute(item))
      throw new Error("Source paths must be project-relative");
    const candidate = path.resolve(root, item);
    if (!inside(root, candidate))
      throw new Error("Selected source escapes project");
    let resolved;
    try {
      resolved = await file(candidate);
    } catch (error) {
      if (!allowMissing || error.code !== "ENOENT") throw error;
      records.push({
        path: path.relative(root, candidate),
        sha256: null,
        missing: true,
      });
      continue;
    }
    if (!inside(root, resolved))
      throw new Error("Selected source escapes project");
    const bytes = await fs.readFile(resolved);
    records.push({ path: path.relative(root, resolved), sha256: hash(bytes) });
  }
  if (new Set(records.map((r) => r.path)).size !== records.length)
    throw new Error("Duplicate source file");
  return { root, files: records };
}
export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
