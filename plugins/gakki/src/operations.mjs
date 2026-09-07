import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { inspectDesign, prepareAssets, sharpRuntime } from "./images.mjs";
import { captureWeb, captureIos } from "./capture.mjs";
import { compareRender } from "./compare.mjs";
import { file, snapshot } from "./files.mjs";

export const VERSION = "0.4.0-alpha.1";
const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const pathname = z.string().min(1);
const rect = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().positive(),
  z.number().int().positive(),
]);
const regions = z.array(z.object({ id, rect }).strict()).max(8).default([]);
const sources = {
  projectRoot: pathname,
  files: z.array(pathname).max(300).default([]),
  outputDir: pathname,
};
const tool = (description, schema, run, readOnly = false) => ({
  description,
  schema,
  run,
  readOnly,
});

export const operations = {
  doctor: tool(
    "Check GAKKI runtime capabilities without downloading, starting a server or reading account credentials.",
    z.object({}).strict(),
    async () => {
      let images = false,
        browserLibrary = false;
      let imageRuntime = null;
      try {
        const sharp = await sharpRuntime();
        images = true;
        imageRuntime = {
          sharp: sharp.versions.sharp,
          libvips: sharp.versions.vips,
        };
      } catch {}
      try {
        await import("playwright-core");
        browserLibrary = true;
      } catch {}
      const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
      const bundled =
        path.basename(path.dirname(fileURLToPath(import.meta.url))) === "dist";
      let build = null;
      try {
        if (bundled)
          build = JSON.parse(
            await fs.readFile(path.join(root, "dist/build-info.json"), "utf8"),
          );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      return {
        version: VERSION,
        entrypoint: fileURLToPath(import.meta.url),
        execution: bundled ? "bundle" : "source",
        node: process.version,
        build,
        images,
        imageRuntime,
        browserLibrary,
        ios: process.platform === "darwin",
        setupCommand: `node "${path.join(root, "scripts/setup.mjs")}"`,
        note: "Browser library availability does not prove a browser executable is installed. Codex supplies reasoning and image generation; no API key is read.",
      };
    },
    true,
  ),
  inspect_design: tool(
    "Inspect a design image and exact source-pixel crops. Returns visual previews, alpha content bounds and measured region colors; does not infer application data or layouts.",
    z.object({ imagePath: pathname, regions }).strict(),
    inspectDesign,
    true,
  ),
  prepare_assets: tool(
    "Batch deterministic static skins or explicitly marked fixtures into Flutter/Web density folders. Preserves alpha, refuses upscaling and aspect distortion, writes source provenance automatically.",
    z
      .object({
        outputDir: pathname,
        target: z.enum(["flutter", "web"]).default("flutter"),
        assets: z
          .array(
            z
              .object({
                id,
                source: pathname,
                rect: rect.optional(),
                logicalSize: z.tuple([
                  z.number().min(1).max(10000),
                  z.number().min(1).max(10000),
                ]),
                scales: z
                  .array(z.number().min(1).max(4))
                  .min(1)
                  .max(4)
                  .refine(
                    (a) => new Set(a).size === a.length,
                    "Duplicate scale",
                  )
                  .default([1, 2, 3]),
                usage: z.enum(["static", "fixture"]),
                alpha: z.enum(["preserve", "required"]).default("preserve"),
              })
              .strict(),
          )
          .min(1)
          .max(40),
      })
      .strict(),
    prepareAssets,
  ),
  capture_web: tool(
    "Capture the real local development page at multiple viewports with DOM/style measurements, interaction steps and executable geometry/content checks. Uses an existing Chrome/Chromium. Automatically records timing and selected source hashes.",
    z
      .object({
        ...sources,
        url: z.url(),
        locale: z.string().default("zh-CN"),
        browserExecutable: pathname.optional(),
        readySelector: pathname.optional(),
        timeoutMs: z.number().int().min(500).max(30000).default(15000),
        viewports: z
          .array(
            z
              .object({
                id,
                width: z.number().int().min(240).max(3000),
                height: z.number().int().min(240).max(3000),
                dpr: z.number().min(1).max(3).default(1),
              })
              .strict(),
          )
          .min(1)
          .max(6)
          .refine(
            (v) => new Set(v.map((i) => i.id)).size === v.length,
            "Duplicate viewport id",
          ),
        selectors: z.array(pathname).max(40).default([]),
        steps: z
          .array(
            z.discriminatedUnion("action", [
              z
                .object({
                  action: z.enum(["click", "wait"]),
                  selector: pathname,
                })
                .strict(),
              z
                .object({
                  action: z.enum(["fill", "press"]),
                  selector: pathname,
                  value: z.string(),
                })
                .strict(),
            ]),
          )
          .max(20)
          .default([]),
        expectations: z
          .array(
            z
              .object({
                selector: pathname,
                visible: z.boolean().optional(),
                inViewport: z.boolean().optional(),
                minWidth: z.number().nonnegative().optional(),
                minHeight: z.number().nonnegative().optional(),
                textIncludes: z.string().optional(),
                rect: z
                  .tuple([
                    z.number(),
                    z.number(),
                    z.number().nonnegative(),
                    z.number().nonnegative(),
                  ])
                  .optional(),
                tolerance: z.number().nonnegative().max(20).default(1),
              })
              .strict(),
          )
          .max(40)
          .default([]),
      })
      .strict(),
    async (args) =>
      captureWeb({
        ...args,
        selectors: [
          ...new Set([
            ...args.selectors,
            ...args.expectations.map((e) => e.selector),
          ]),
        ],
      }),
  ),
  capture_ios: tool(
    "Capture the current screens of specified booted iOS simulators in one call, with runtime identity and selected source hashes. Build, launch and navigate with existing Codex/Xcode tools first; no UI state is inferred.",
    z
      .object({
        ...sources,
        context: z
          .object({
            scenario: z.string().min(1).max(200).optional(),
            route: z.string().min(1).max(500).optional(),
            dataMode: z.enum(["local", "fixture", "unknown"]).optional(),
            buildEvidence: z.string().min(1).max(2000).optional(),
          })
          .strict()
          .optional(),
        devices: z
          .array(z.string().uuid())
          .min(1)
          .max(6)
          .refine((v) => new Set(v).size === v.length, "Duplicate simulator"),
      })
      .strict(),
    captureIos,
  ),
  compare_render: tool(
    "Generate a local visual review with reference/current/overlay/diff and optional exact regions. Equal pixel dimensions required. Difference metrics remain diagnostics, never automatic design acceptance.",
    z
      .object({
        reference: pathname,
        actual: pathname,
        outputDir: pathname,
        regions,
      })
      .strict(),
    compareRender,
  ),
  verify_capture: tool(
    "Check whether selected source files changed since a recorded capture. Does not rerun tests or claim visual acceptance.",
    z.object({ report: pathname, projectRoot: pathname }).strict(),
    async (args) => {
      const saved = JSON.parse(
        await fs.readFile(await file(args.report), "utf8"),
      );
      if (saved.schema !== "gakki.capture/2")
        throw new Error("Expected GAKKI capture/2 report");
      const now = await snapshot(
        args.projectRoot,
        saved.sources.files.map((f) => f.path),
        { allowMissing: true },
      );
      if (now.root !== saved.sources.root)
        throw new Error("Capture belongs to another project");
      const differences = now.files.filter(
        (f) =>
          !saved.sources.files.some(
            (old) => old.path === f.path && old.sha256 === f.sha256,
          ),
      );
      return {
        status:
          saved.sourceChanged || differences.length
            ? "stale"
            : now.files.length
              ? "current"
              : "untracked",
        selectedFiles: now.files.length,
        differences,
        fidelity: "not_evaluated",
        scope:
          "Only explicitly selected source files; not an automatic dependency graph or rerun.",
      };
    },
    true,
  ),
};

export async function execute(name, input) {
  const operation = operations[name];
  if (!operation) throw new Error(`Unknown operation: ${name}`);
  return operation.run(operation.schema.parse(input));
}
