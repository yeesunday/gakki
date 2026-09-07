---
name: gakki
description: Build or refine frontend pages from designs in the actual project, using precise visual inspection and real browser or iOS render feedback. Use for screenshot implementation, responsive layout fixes and visual refinement; ordinary non-UI changes do not need this workflow.
---

# GAKKI

Optimize the time to a useful, maintainable page. Codex supplies design judgment, coding and tool orchestration; GAKKI supplies repeatable measurements and transforms. Prefer the project's real components and data boundaries.

## Choose the smallest useful loop

- **Refine an existing page:** inspect the affected component and current render, change it, then run the relevant check and inspect that region. Capture more states only when they can expose the change's actual risk.
- **Implement a page:** identify its real route, key states and design source; establish the layout and dynamic content using project components; add necessary static assets; render early, fix the largest observed differences, then check the actual user flow.
- **Prepare assets only:** use `gakki-assets`. Do not require a page rewrite.

Read project `AGENTS.md` and the relevant component/token source. Use an existing `gakki.toml` as a context index, not an obligatory onboarding step. Separate observed design pixels from inferred responsive rules. A screenshot cannot reveal an API contract, hidden states or a component's runtime behavior.

## Reuse components and complete the design

Inspect the closest existing pages as well as the component library before drawing common controls. Reuse suitable navigation, buttons, fields, media treatments and spacing tokens. A screenshot-specific control is not a reason to duplicate an established component.

If a missing pattern could become a new shared component, describe the proposed API, likely consumers and migration scope to the developer and wait for an explicit affirmative answer before extracting it. Continue the authorized page work with a local implementation while that decision is pending. Reusing an existing component or refining a page-local layout does not require this extra decision.

A supplied design usually shows one state. Complete required empty, loading, error, optional-content and ordinary-photo states with the same hierarchy, proportions, spacing, surfaces and interaction language. Do not invent business features from decorative examples. Distinguish opaque photos from transparent subjects: choose a deliberate frame, crop or contained presentation instead of leaving a tiny rectangular photo at the bottom of a decorative shell. Preserve the original media and access to its full content.

## See the result while implementing

Use `inspect_design` for source dimensions and focused crops when precision matters. Classify changing text/photos/counts as native data; decorative frames and material detail may be independent static skins. Preserve content and interaction semantics across viewport changes.

For Web, read [web.md](references/web.md). For Flutter/iOS, read [flutter.md](references/flutter.md). Use the host's browser, terminal and image tools for live interaction; the MCP tools automate repeatable captures and measurements without introducing another model account.

Use `capture_web` or `capture_ios` on the actual project. Inspect the returned images/files and failures. `compare_render` creates a local visual review for aligned images; its metrics identify differences, not design correctness. Tie critical observed elements to source selectors/Widget keys so corrections land in the right component.

## Finish at the right level

Select verification by the change: layout needs affected viewport/content checks; state or navigation needs a real interaction test; shared contracts need their impacted regression. Follow stronger project requirements when applicable. After a full review, recheck the fix and direct interactions instead of reopening unrelated architecture on every iteration.

The tools record their own measurements, timing and selected source files. Choose those files when a capture will support delivery; `verify_capture` detects later changes within that scope. A tiny correction does not need a hand-written IR or five manually signed checks. Save a reusable case only when it will actually be rerun.

Before delivery, inspect the whole rendered page in the states users will actually encounter. Fix obvious imbalance, awkward media placement, mismatched controls, crowded labels and unfinished placeholders within the authorized scope. Passing tests or recording a poor-looking screen is not completion. Judge the composition against the supplied design and neighboring pages; explain necessary responsive or state differences. Respect the user's supported settings and requested test scope instead of expanding an unrelated setting matrix.

Report the page change, useful visual evidence, tests actually run and material unfinished items. Keep functional results, rendered constraints, design judgment and user acceptance distinct. Record end-to-end time and repair rounds for comparable real tasks before claiming a speedup.
