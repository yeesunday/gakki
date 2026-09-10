---
name: gakki-assets
description: Prepare existing design assets or screenshot crops for frontend use, preserving dynamic content boundaries, real transparency, source pixels and Flutter/Web density paths. Use for asset inspection and packaging, not full-page implementation or general photo editing.
---

# GAKKI assets

Inspect the existing source before generating anything. Reuse an accepted independent asset or export structured design nodes when available. Use Codex's native image tools only when a new bitmap or actual editing is needed; GAKKI does not read model keys or provide a paid image backend.

`inspect_design` returns exact source dimensions, alpha content bounds and optional source-pixel crops. Its preview may be smaller; all crop coordinates remain the displayed EXIF-oriented source pixels. Identify the asset's purpose and surrounding dynamic content before selecting a box.

For transparent candidates, inspect every generated or edited output independently with `inspect_design(transparencyPreview: true)`. Check `source.hasAlpha`, the measured `alpha` distribution and content bounds, including relevant `regions[].alpha` for text openings. The paired preview places the image on light and dark backgrounds to expose baked checkerboards, halos and lost detail. A model's transparency claim, a checkerboard preview or a prior version's Alpha is not evidence about the current file. Fully opaque RGBA is still opaque; fully invisible output is not usable artwork. Measurements do not certify edge quality or remove backgrounds.

`prepare_assets` batches selected sources/crops into Flutter or Web density folders. Supply an ID, source path, logical size, scales and usage (`static` or `fixture`). The tool writes provenance automatically, refuses aspect distortion/upscaling and preserves alpha by default. Required transparency must already be real; it never guesses that a pale frame or border is disposable background.

Opaque scene backgrounds/photos are valid assets. For a blocked transparent cutout, choose a method justified by that asset (structured export, known source mask, native image editing or a tested local segmentation tool). Never infer a clean cutout from the existence of an alpha channel alone. Generative reconstruction can change identity/geometry; inspect the result at its intended display size before integration.

Keep changing names, photos, labels and counts native. A sample crop stays an explicit fixture and does not become production artwork. Check irregular edges over contrasting backgrounds and confirm visible structure, complete subject and absence of baked UI. Structural parts and identity need accuracy; decorative atmosphere has task-specific tolerance. Once fit for purpose, verify it in the real page and stop repeated no-gain regeneration.

Example input:

```json
{
  "outputDir":"/absolute/project/.gakki/assets/frame-01",
  "target":"flutter",
  "assets":[{"id":"frame","source":"/absolute/frame.png","logicalSize":[132,186],"scales":[1,2,3],"usage":"static","alpha":"required"}]
}
```

Only install generated files after inspecting them in context. Asset export success is not final visual acceptance. The plugin has no Python runtime dependency.

Keep rejected candidates and successful source files distinct. After an edit, repeat the Alpha check and `prepare_assets(alpha: required)` for any cutout before installation. Assess both transparency and fidelity: either can fail independently. Do not erase checkerboard colors automatically or accept a heavy reconstruction merely because it has Alpha.

If an operation is absent from the host's callable tools, use the installed plugin's documented CLI or debug MCP client with the same JSON arguments. CLI measurements and MCP image previews share the same operations; save/open returned previews for visual inspection instead of silently skipping the asset step. The debug client and preview output arguments are documented in the plugin README.
