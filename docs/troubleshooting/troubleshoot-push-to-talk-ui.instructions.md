---
description: 'Troubleshooting push-to-talk transcript UI and Playwright control tests.'
applyTo: 'apps/web/src/app/TranscriptPanel.tsx,apps/web/src/app/transcript-state.ts,apps/web/e2e/transcript-controls.spec.ts'
---

# Push-to-talk UI troubleshooting

- If a Playwright locator loses the hold-to-talk button while it is pressed, keep the button's accessible name stable with `aria-label` and expose the changing pressed state through `aria-pressed` plus visible text.
- For mouse-hold tests, call `scrollIntoViewIfNeeded()` before reading `boundingBox()` and sending `page.mouse.down()`; otherwise coordinates can be outside the viewport and no real pointer event reaches the control.
- If a metric parser reads `0` even though the trace shows updated values, check CSS `text-transform`; `innerText` may return transformed uppercase labels. Prefer role/label assertions or case-insensitive parsing for visual metric labels.
- When browser verification keeps showing pre-fix behavior, kill stale `vite preview` processes on ports 4173+ and rerun against a fresh build before debugging component logic.
