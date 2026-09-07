# Web implementation and feedback

Use the app's framework, CSS system and actual route. Preserve native controls and model bindings. A source screenshot's absolute boxes are measurements, not permission to absolutely position every responsive element.

`capture_web` accepts a running loopback development URL, explicit viewports, optional ready selector, interaction steps and expectations. It uses a fresh browser context per viewport and an installed Chrome/Chromium. The tool waits for fonts/images and the caller's ready selector; provide a unique ready selector for async data. Readiness and action selectors must resolve to one element; list containers make better readiness anchors than repeated cards. Capture failures stay errors, not best-effort screenshots labelled complete.

Measure only useful selectors. Expectations can check a control's minimum hit size, initial viewport visibility, required text or an observed rectangle with a declared tolerance. All expectation selectors are measured automatically. Returned CSS, text and bounds help locate a defect. `data-gakki-source` / `data-source`, if already present, are hints only; the tool does not claim to recover a framework source map.

For live debugging use the host browser tools or the project's existing Playwright tooling. React Grab is useful when repeatedly selecting a rendered React component is the actual bottleneck; it is optional development instrumentation, not a prerequisite or a production dependency.

Example MCP input for a real responsive page:

```json
{
  "url": "http://127.0.0.1:5173/settings",
  "projectRoot": "/absolute/project",
  "outputDir": "/absolute/project/.gakki/captures/settings-01",
  "files": ["src/pages/Settings.vue", "src/styles.css"],
  "viewports": [{"id":"compact","width":375,"height":667},{"id":"wide","width":960,"height":800}],
  "readySelector": "[data-testid=settings-panel]",
  "expectations": [{"selector":"[data-testid=save-settings]","minHeight":44,"visible":true,"inViewport":true}]
}
```

Use `steps` with `fill`, `click`, `press` and `wait` for a known local flow; run complex scenarios in the app's tests. Capture checks do not replace accessibility audits, semantic test assertions or performance profiling. Design-image comparison needs identical source and actual pixel dimensions: reproduce the reference viewport and DPR, or explicitly record prior normalization.
