# GAKKI · 0.4 alpha

A local Codex plugin for turning design inputs into working frontend pages, with image inspection, deterministic asset preparation and real render feedback. Codex owns visual judgment and coding; your project owns components, business data and its design system.

This is an alpha release. Validate the tools and workflow against your project’s requirements.

## Use in Codex

Install the plugin, start a **new task in your application project**, then ask:

- “Use GAKKI to implement this design in the real page.”
- “Use GAKKI to inspect this page at compact and large sizes and fix the biggest visible problems.”
- “Use GAKKI Assets to prepare these existing transparent skins for Flutter.”

The `gakki` skill routes to Web or Flutter guidance only when needed. `gakki-assets` also works independently. Existing `gakki.toml` is a useful project context index, not required onboarding. New projects need no copy of GAKKI's implementation or a mandatory IR/Figma reconstruction.

## Runtime and setup

Node.js 22+ and npm are required. In a copied distribution:

```sh
node scripts/setup.mjs
node dist/cli.mjs doctor
```

Setup installs **locked production dependencies only**: Sharp and Playwright Core. It downloads no browser, model weights or paid service client. Web capture uses an installed Chrome, an explicit `browserExecutable`, or an existing Playwright Chromium. If none is available, explicitly install one with `npx playwright-core install chromium`. iOS capture needs macOS, Xcode and a booted simulator. macOS/Chrome and macOS/iOS Simulator are tested; other platforms are not yet validated.

The MCP server starts even before image/browser dependencies are installed, so `doctor` can explain missing setup. No API key, Codex credential or account token is read. Image generation uses available Codex host capabilities when needed, not a separate model-provider server.

## Develop and update

From the **repository root**, once:

```sh
npm run setup
```

Then:

```sh
npm run debug -- doctor                 # execute source directly; no build/reinstall
npm run debug -- capture_web /absolute/input.json
npm run check                          # build + image/browser/stdio tests
npm run debug:mcp -- doctor             # probe the actual built stdio entry
npm run dev:update                     # build, stage, cachebust, install locally
npm run pack                           # create a local .tar.gz under achieve/packages; does not publish
```

`dev:update` supports macOS and the Codex desktop/plugin-creator helpers. It uses `~/plugins/gakki` and the personal marketplace at `~/.agents/plugins/marketplace.json`, refuses to overwrite an unrelated plugin, preserves other marketplace entries, and logs each update under the repository's `achieve/dev/`. It reuses dependencies when the lockfile is unchanged. Override helper location with `GAKKI_PLUGIN_HELPERS` and CLI location with `GAKKI_CODEX_BIN` if your Codex installation differs. Python 3 is used by Codex's installer helpers; the plugin runtime itself does not require Python.

**After updating, start a new Codex task.** Already-running tasks may hold the old MCP process and skill instructions. This version deliberately does not claim to hot-reload an existing Codex task. Source debugging is immediate; an app installation update is a separate step. `doctor` shows `entrypoint`, execution mode, Node version, build time and source fingerprint so you can distinguish source, staging and cached installations. A development install is a local copy; editing the checkout alone does not update that copy.

To replay a failure, save just the tool's JSON arguments under the consuming project's run directory and run `npm run debug -- <operation> /absolute/input.json`. Use a new `outputDir` each time; failed and prior runs are never overwritten. For transport or packaging problems, use `npm run debug:mcp -- <operation> /absolute/input.json /absolute/installed/dist/mcp.mjs`. The debug client prints text results and the number of returned image blocks; actual images remain in the reported paths. It requires the checkout's development dependencies.

For a machine without the installer helpers, build/package locally and use Codex's plugin creation/install workflow to add the unpacked `gakki` directory to your own marketplace. Installation is independent of application repositories and private design inputs.

## Callable capabilities

| Tool | Result and boundary |
| --- | --- |
| `doctor` | Runtime, build and install identity; library presence is not a browser launch test. |
| `inspect_design` | EXIF-oriented source coordinates, focused image previews, alpha distribution/bounds and region colors. Optional `transparencyPreview: true` adds paired light/dark composites for the source and crops. Layout and cutout quality remain human/model judgments. |
| `prepare_assets` | A batch of PNG skins or explicit fixtures in Flutter/Web density paths. Refuses missing resolution, distorted crops and falsely opaque cutouts. |
| `capture_web` | Local URL, viewport matrix, click/fill/press/wait steps, DOM/style observations, executable geometry/text checks, runtime errors, screenshots and selected source hashes. |
| `capture_ios` | Current screens of specified booted simulators, runtime identity and selected source hashes. Build, launch, locale and navigation are the host's responsibility. |
| `compare_render` | Aligned reference/current/overlay/diff review and named crops. Metrics diagnose differences; they do not accept a design. |
| `verify_capture` | Detects changed/deleted selected source files. Empty selections are `untracked`; this is not a dependency graph or test rerun. |

MCP image inspection returns visual image blocks; capture replies return up to two resized previews alongside measurements. Full originals remain in the run. CLI and MCP share the same validation and operations. CLI exit codes: `0` completed, `1` failed executed checks/stale sources, `2` invalid input/runtime error. A zero exit code does not mean visual approval.

Reference-led work uses a state-matched visual contract before implementation: focused reference crops, explicit hierarchy/proportion/type relationships, fixture-only sample content where needed, and focused reference/render review after material changes. A full-page capture, successful build or different runtime state cannot stand in for that comparison. Later user corrections update the affected contract properties while unchanged reference relationships stay anchored.

For a generated or edited cutout, call `inspect_design` with `transparencyPreview: true` on each candidate. `source.hasAlpha` records the input channel; `alpha` reports transparent, translucent and opaque pixel counts plus `opaque`, `invisible` or `has_transparency` status. Each requested region includes the same measurements. This detects fully opaque output even when it has an Alpha channel; it does not automatically classify checkerboard texture or certify clean edges. `prepare_assets` with `alpha: required` rejects opaque crops and fully invisible artwork before writing output.

If image tools are not exposed in the current host session, use `node dist/cli.mjs inspect_design /absolute/input.json` for measurements. To save the paired image previews as well, run `node scripts/mcp-call.mjs inspect_design /absolute/input.json /absolute/installed/dist/mcp.mjs /absolute/new-preview-directory` from a source checkout with development dependencies, then open the returned PNGs.

The executable input schemas are in `src/operations.mjs`. Working Web examples are in [the Web reference](skills/gakki/references/web.md); native guidance is in [the Flutter reference](skills/gakki/references/flutter.md). All filesystem paths passed to tools are absolute, except selected `files`, which are relative to `projectRoot`.

## Capability boundaries

- No arbitrary screenshot-to-layout compiler. Reconstructed screenshots cannot establish production data contracts or unseen interaction states.
- No automatic white/edge-color removal. Existing alpha is preserved. Complex segmentation remains an explicit, justified task using appropriate host or local tools.
- Web observations use supplied selectors and optional source hints; framework source-map integration is not implemented. Async application states need explicit readiness steps/selectors.
- iOS captures do not verify which app or state is visible. Inspect them and run the project's actual interaction tests.
- Selected source hashes do not prove that a served bundle or native binary was rebuilt from those sources. Build/launch evidence and visual inspection are still necessary.
- Tools write `gakki.assets/2`, `gakki.capture/2` and `gakki.comparison/2` records in the supplied output directories. These are operation records, not application data contracts.

The plugin has no telemetry, background daemon, queue, remote storage or payment integration. Browser pages can make their own network requests; local URL capture is not a network sandbox. No public release is performed by any development command.
