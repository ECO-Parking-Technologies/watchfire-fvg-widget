# CLAUDE.md

Context for working in this repo.

## What this is

A **Watchfire Ignite/Presto content-player widget**. It runs inside Watchfire's
Ignite platform (on a physical LED sign or in Ignite's web editor preview) and
polls EcoParking's **Falcon Vision Gateway (FVG)** REST API to display a
parking count/status on the sign. It is read-only: it never writes to the FVG
API and never pushes anything to the physical sign.

Related repo: `/home/lopezemi/projects/falcon/falcon-vision-gateway` — the
FVG server this widget talks to. Its `os/ubuntu-core/snaps/falcon-vision-gateway-core/README.md`
is the best reference for the server side (endpoints, auth, sign manager,
heartbeat mechanism).

## Architecture

- [index.html](index.html) — widget shell: two flex cells (`nameCell`,
  `valueCell`), loads `widget.support.min.js` (Watchfire player SDK, do not
  edit), then `FvgClient.js`, then `start.js`.
- [js/FvgClient.js](js/FvgClient.js) — minimal XHR client for
  `GET {apiBaseUrl}/api/v1/signs/{signId}/value`. Sends `X-Client-Id`
  (configurable per placement, defaults to `watchfiresigns`) and optional
  `X-API-KEY`. Supports an optional CORS proxy via `_proxyURL`.
- [js/start.js](js/start.js) — all widget logic: reads config from the query
  string (Ignite injects these from `template.xml` Parameters), polls on an
  interval, renders name/value, autoscales text to fit each cell, handles
  offline/blank/alert states, and drives the Watchfire player lifecycle hooks
  (`prestoWidgetProceed`, `prestoWidgetProceedPostCliff`, `prestoWidgetStop`,
  `PlayerCallback.signalDelayedLoadEvent`).
- [template.xml](template.xml) — property schema shown in Ignite's widget
  editor (Properties → Parameters tab). This is how each placement of the
  widget on a sign is configured (FVG base URL, sign ID, API key, colors,
  fonts, poll interval, offline delay, alert regex).
- [css/default.css](css/default.css) — layout only; text sizing is computed
  in JS (`refitCell`), not CSS.
- `js/widget.support.min.js` — third-party Watchfire player SDK
  (`PlayerCallback`, `QueryStringParser`, `Transformers`). Don't modify.

## Constraints to respect

- **Target runtime is old Chromium (55), not a modern browser.** The sign
  player ships this engine. Write ES5-style JS (`var`, function expressions,
  no arrow functions/`let`/`const`/template literals/optional chaining), and
  don't assume modern DOM/CSS APIs are present — `start.js` already has a
  fallback for missing `document.fonts.ready`, follow that pattern for
  anything else browser-API-dependent.
- **No build step.** This is plain HTML/CSS/JS served/packaged as-is for
  upload to Ignite. Don't introduce bundlers, npm, or transpilation.
- **No source maps / minification needed for our own files** — only
  `widget.support.min.js` (third-party) is minified.
- Poll interval is throttled to a 5s floor in Ignite's edit-mode preview
  (`_editMode=true`) even if the configured interval is lower, to avoid
  hammering a customer's gateway from a designer's browser. Keep that
  behavior if touching `start.js`'s polling logic.
- The `clientId` Parameter (see below) defaults to `watchfiresigns` for
  backward compat with existing FVG `heartbeat_header_value` configs. Don't
  change that default without coordinating with the FVG/portal team, since
  any placement left unconfigured silently keeps the old shared value.

## Per-placement sign identity (X-Client-Id)

FVG's sign-manager has a per-sign `heartbeat_header_name`/
`heartbeat_header_value` config that can flip a sign's online/offline status
when a matching header arrives. Every widget placement used to send the same
hardcoded `X-Client-Id: watchfiresigns`, so FVG (and the EcoParking portal,
which surfaces sign health) had no way to programmatically confirm *which*
Watchfire sign/placement was actually polling a given FVG sign counter —
discussed with Matt Jonker on 2026-09-01.

**Implemented and shipped** (post-1.0.0): `template.xml` exposes a
`clientId` Parameter (default `watchfiresigns`), threaded through
`start.js` → `FvgClient.js` into the `X-Client-Id` header (`FvgClient.js`:
`clientIdHeader = (clientId || '').trim() || 'watchfiresigns'`). To get a
real per-sign link, set a unique value per placement (e.g.
`watchfire-carmel-1`) in Ignite's Parameters tab, and configure that same
value as the matching FVG sign's `heartbeat_header_value`.

**Confirmed root cause, 2026-09-01**: uploading a package with a `clientId`
`<Property>` whose `<Description>` was 288 characters long failed Ignite's
`/content/upload/template/` endpoint with a generic `INTERNAL_SERVER_ERROR`.
**It is a `Description` length limit, not a "can't add a new property"
restriction** — an earlier round of testing (a 5-way permutation matrix)
concluded the latter, but that conclusion had a confound: every test that
added the new property also happened to use the same long description, so
"new property" and "long description on that property" were never tested
independently. Some follow-up tests closed the gap:

- `test7.zip`: new `clientId` property, `Description` shortened to `"Test"`
  (4 chars) → uploaded successfully.
- `test8.zip`: new `clientId` property, `Description` set to 54 chars →
  uploaded successfully.
- The longest `Description` in the widget's already-registered, known-good
  property set is `offlineDelaySeconds` at 122 chars.
- Our original `clientId` description was 288 chars, and every attempt that
  used it failed regardless of `lastModified` or property count.

So the real threshold sits somewhere in (122, 288] chars — a classic
`VARCHAR(255)` column limit on the server side is a plausible fit, but
unconfirmed. **Fix**: keep new/edited `Description` text well under ~150
chars (in line with the existing properties' style). The current `clientId`
description in `template.xml` (152 chars) was re-tested against the live
Ignite upload endpoint and **uploaded successfully** — this is closed.
Adding a new `<Property>` node itself was never the problem; only overlong
text within it was.

Still open: even once uploadable, this is opt-in per placement — nothing
enforces that Ignite operators actually set a unique value, so it's still
"good faith" unless someone goes through and configures it for existing
placements.

## Deploying / packaging

- `VERSION` — plain-text file, source of truth for the release version
  (e.g. `1.0.0`). Bump by hand as part of a release.
- `build-package.sh` — zips the widget for Ignite upload. Reads `VERSION`
  (falling back to a HEAD-pinned git tag, then the abbreviated commit hash)
  to build the output filename (`<repo>-<version>-<commit>-<UTC timestamp>.zip` in `dist/`, gitignored), but does **not** put any of that
  metadata inside the archive — Ignite's `/content/upload/template/` returned
  an `INTERNAL_SERVER_ERROR` on a package containing extra files (`VERSION`,
  a generated `build-info.txt`), so the zip's contents are kept identical to
  the widget's own file set (index.html, css/, js/, fonts/, template.xml,
  icon/preview images). Don't add files to the archive without confirming
  Ignite actually tolerates it.
- `.github/workflows/build-widget-package.yml` — runs `build-package.sh` only
  on `release: published` (or manual `workflow_dispatch`), uploads the zip as
  a workflow artifact, and attaches it to the GitHub release via
  `gh release upload`. Modeled on `falcon-vision-gateway`'s
  `build-all-snaps.yml` pattern.

## Git

Remote: `git@github.com:ECO-Parking-Technologies/watchfire-fvg-widget.git`
(transferred from a personal account on 2026-09-01; the old personal URL
redirects to this one). `v1.0.0` is tagged and released as the original,
unmodified widget from Watchfire plus this repo's packaging tooling — treat
it as the baseline to diff future changes against.
