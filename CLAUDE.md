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
  `GET {apiBaseUrl}/api/v1/signs/{signId}/value`. Sends `X-Client-Id:
  watchfiresigns` and optional `X-API-KEY`. Supports an optional CORS proxy
  via `_proxyURL`.
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
- Widget instances currently cannot be distinguished on the FVG side — every
  instance sends the identical `X-Client-Id: watchfiresigns` header. This is
  a known gap (see below), not a bug to "fix" unilaterally without
  coordinating the header/value convention with the FVG team and EcoParking
  portal team (Emilio/Matt/Sanjay).

## Known open issue: no sign identity in the heartbeat header

FVG's sign-manager has a per-sign `heartbeat_header_name`/
`heartbeat_header_value` config that can flip a sign's online/offline status
when a matching header arrives. Today this widget sends the same
`X-Client-Id: watchfiresigns` from every placement, so FVG (and the EcoParking
portal, which surfaces sign health) has no way to programmatically confirm
*which* Watchfire sign/placement is actually polling a given FVG sign
counter — it's "good faith" that Ignite was configured correctly by whoever
set up the Parameters tab.

Proposed fix (not yet implemented, discussed with Matt Jonker on 2026-09-01):
add a per-placement identifier as a new `template.xml` Parameter (e.g.
`clientId`, default `watchfiresigns` for backward compat), thread it through
`start.js` into `FvgClient.js`'s `X-Client-Id` header, and have each FVG
sign's `heartbeat_header_value` configured to match its specific placement's
value (e.g. `watchfire-carmel-1`). Needs sign-off from Sanjay before shipping
since this widget is meant to go through QA as a vetted release, not be
hand-uploaded to Ignite ad hoc.

## Deploying / packaging

There is no packaging script in this repo yet. Widgets are uploaded to
Ignite as a bundle (this whole directory). Confirm the exact packaging
mechanism (zip format, manifest requirements) with the team before assuming
one — it hasn't been established in this repo.

## Git

Only `README.md` was committed on `first commit`; everything else
(`index.html`, `js/`, `css/`, `fonts/`, `template.xml`, images) is currently
untracked working-tree content. Check `git status` before assuming what's
tracked.
