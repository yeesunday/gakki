# Flutter / iOS implementation and feedback

Use the actual Widget tree, design tokens, localization and application/Domain Ports. Reuse temporary media ownership and cancellation behavior. A preview can replace Ports with fixtures at composition boundaries; the page itself stays the production component.

Place Flutter image assets at the page root for 1x and `2.0x/`, `3.0x/` as required by actual display density. `prepare_assets` creates these paths directly. Declare the root asset path in pubspec. Test selected density and inspect sharpness at the largest actual render size; do not upscale a small source and call it a high-resolution master.

Implement native layout constraints, scroll and SafeArea. Keep a required primary action visible or demonstrably reachable at the smallest supported size and large text. Separate a decorative skin's visual bounds from the button hit target; custom artwork still needs native semantics.

Build/launch using the project's existing Flutter/Xcode tools and explicit debug route. Check whether that route uses real local data or fixtures. Then `capture_ios` captures any listed booted simulators in one call. It records device/runtime identity and selected source hashes, but does not infer which app is visible or drive the UI. Use host computer-use/Xcode tools for system pickers and real interactions.

```json
{
  "projectRoot":"/absolute/project",
  "outputDir":"/absolute/project/tmp/gakki/settings-01",
  "files":["app/lib/pages/settings_page.dart","app/pubspec.yaml"],
  "devices":["00000000-0000-0000-0000-000000000000"]
}
```

Use actual UUIDs returned by `xcrun simctl list devices`. For a visual-only change, run its relevant Widget/geometry checks and render. Navigation, media ownership, shared state or database changes need the corresponding behavioral regressions. Golden files freeze an accepted state under a fixed renderer/font environment; generating one does not approve the design.
