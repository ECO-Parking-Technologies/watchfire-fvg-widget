# watchfire-fvg-widget

A Watchfire Ignite widget that shows a live parking count on a Watchfire
sign, pulled from EcoParking's Falcon Vision Gateway (FVG).

## What it does

1. You place this widget on a Watchfire sign layout in Ignite and point it
   at one FVG sign (by ID) via the widget's Parameters.
2. The widget polls FVG's REST API every half second (configurable) for that
   sign's current name and value.
3. It renders the name and value as auto-sized text, with color-coded alerts
   (e.g. red for "FULL"/"0"/"CLOSED") and an offline `--` state if FVG stops
   responding.

**It is read-only.** This widget never pushes data to a physical sign — it
only displays a value that was already set on FVG through a separate process.
Think of it as a mirror, not a controller.

## Requirements

- Runs inside Watchfire's Ignite content player only — it depends on
  Watchfire's player SDK and won't work as a standalone webpage.
- Needs network access from the sign to your Falcon Vision Gateway.
- An FVG API key with `signs.read` permission, if the gateway requires auth.

## Configuring a placement

In Ignite: **Schedules → Programs → View All → (your program) →** double-click
a track → **Properties → Parameters**. Key fields:

| Property | What it does |
|---|---|
| FVG Base URL | Address of the gateway, e.g. `http://192.168.1.100` |
| Sign ID | Which FVG-managed sign to display |
| API Key | Optional, if the gateway requires it |
| Sign Name / Sign Count | Toggle each on/off independently |
| Text Font / Colors | Styling, including a separate alert color |
| Alert Values | Regex — counts matching this show in the alert color |
| Poll Interval | How often to check FVG, in ms |
| Offline Delay | How long to wait before showing `--` on failure |

## Known limitation

FVG currently has no reliable way to tell *which* physical Watchfire sign is
polling a given counter — every widget instance identifies itself the same
way. Correctness today depends on the Ignite Parameters being set up
correctly for each placement. See `CLAUDE.md` for details and the proposed
fix.

## More detail

See `CLAUDE.md` for architecture, file-by-file breakdown, and constraints
(this targets an old embedded Chromium build, so no modern JS/build tooling).
