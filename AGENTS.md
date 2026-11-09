# AI Agent Instructions for ShoPoSvitlu

## 1. Operating rules

1. **Do not modify this file without the repository owner's explicit approval.** If a rule needs correction or expansion, propose the exact change first.
2. **Follow the user's intent.** Carry out clear implementation requests directly. For critique or discussion without an explicit request to change code, analyze first and wait for authorization.
3. **Communicate with the owner in Ukrainian.** Keep progress and completion reports concise and factual.
4. **For app visits or tests, use the designated non-counted test profile.**
5. **Keep repository history clean.** Do not add AI attribution, watermarks, generated-by notices, or AI-related commit trailers to source files or commit messages.
6. **Use the owner's GitHub identity for commits:** `Denys <111563751+kdinya@users.noreply.github.com>`. Never invent or substitute another author identity.
7. **Keep this entire instruction file in English.** Do not add or translate any part of it into another language.

## 2. Source of truth and Git workflow

1. Before every task, inspect the latest `main`, relevant files, and open pull requests. Check whether a PR or branch already contains related work; avoid overwriting it or duplicating its changes.
2. Make the smallest focused change that meets the request. Preserve unrelated work, configuration, and history. Do not force-push or rewrite shared history.
3. For a small isolated change, work directly on the current default branch after confirming it has not moved. For substantial work, use a dedicated branch and save meaningful checkpoints.
4. Run the relevant tests before reporting completion. Report any unverified behavior or unrelated defect you discover.
5. When a task involves creating a branch and opening a pull request, once all changes are implemented and all automated tests and syntax checks pass, merge the PR into `main` directly without waiting for an additional confirmation request. Delete the temporary feature branch after merging.

## 3. Product and architecture invariants

1. This is a lightweight, vanilla JavaScript Progressive Web App. The public client is served from `public/`; the schedule API is a Cloudflare Worker in `worker/`. Keep this architecture and avoid adding frameworks, build systems, or dependencies unless the owner explicitly asks.
2. Preserve the existing schedule API contract, Telegram source parsing, queue identifiers (`1.1`–`6.2`), refresh behavior, and Vercel/Cloudflare deployment configuration. Check both client and worker paths before changing data flow.
3. Existing browser storage is a compatibility contract. Preserve the `sho-po-svitlu.settings.v1` and `sho-po-svitlu.last-data.v1` keys and their stored shapes. Never clear or silently replace saved user settings or schedule data.
4. The displayed status is an interpretation of the published schedule, not a real-time grid sensor. Keep this distinction and the existing warning that actual supply may differ from the plan.
5. Keep the UI usable at narrow mobile widths and with safe-area insets. Respect keyboard navigation, focus visibility, ARIA labels, and reduced-motion preferences.

## 4. Interface and interaction rules

1. Keep all interactive UI consistent with the product's dark navy, blue-violet glass, and warm golden light visual language.
2. Popups, dialogs, pickers, confirmations, and notices must be application-styled and keyboard accessible. Do not use browser-native `alert`, `confirm`, or `prompt` dialogs.
3. When the selected queue changes, immediately render that queue's status and schedule before starting any network refresh. Never leave the previous queue's status visible while new data is loading.
4. Keep core controls functional: queue selection, today/tomorrow schedule tabs, manual refresh, source/channel settings, and bottom navigation.
5. **Protected outage block:** The "When the power will be off" block—including its elements, markup, styles, and position—is protected from edits made to any other app elements. Do not change this block without the owner's explicit prior permission or a separate direct request.

## 5. Key files and verification

- `public/index.html`: app structure and accessible controls.
- `public/css/style.css`: responsive visual system and components.
- `public/js/app.js`: app state, queue selection, settings, navigation, rendering, refresh lifecycle, and browser storage.
- `public/js/timeline.js`: schedule timeline and outage rendering.
- `public/js/api.js`: public Worker API client and Telegram channel normalization.
- `public/config.js`: public Worker endpoint configuration; never put secrets here.
- `public/sw.js`: offline shell and PWA cache versioning.
- `worker/index.js`: Cloudflare Worker API and Telegram schedule parsing.
- `worker/index.test.js`: Worker tests.

Use `npm test` for the Worker test suite. Also run `node --check` on changed JavaScript modules and review changes at mobile and desktop sizes when the available preview supports it. If a UI change adds static files or changes cacheable assets, update `public/sw.js` cache version and app-shell list as needed.

## 6. Security and configuration

Never commit tokens, API keys, secrets, private Telegram credentials, or local environment files. The Telegram source is public; user-supplied channels must be normalized and validated through existing code. Preserve CORS and input validation in the Worker.

## 7. Releases and versioning

1. Format new release versions as `YYYY.MM.N`, where `N` is the sequence number within that calendar month; for example, `2026.11.1`. Start at `1` for a new month and increment the sequence for each explicitly requested new release in that month.
2. Routine code changes must not create a new app version, Git tag, or GitHub Release. Keep the current release unchanged unless the owner asks to update or create one.
3. When the owner asks to update an existing release, update that release in place where possible instead of creating another version. Do not move or force-update an existing Git tag.
4. Create a new release and tag only when the owner explicitly asks for a new release. A general request to maintain this release policy is not a request to create a release.
