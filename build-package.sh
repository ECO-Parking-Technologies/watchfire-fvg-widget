#!/usr/bin/env bash
# Packages this widget for upload to Watchfire Ignite.
#
# Zips everything in the repo except git/CI metadata (.git, .github,
# .gitignore), Markdown docs (README.md, CLAUDE.md, etc), and this repo's own
# VERSION file — those are for developers, not the player. Ignite's uploader
# appears to reject packages containing files outside the widget's own set
# (index.html, css/, js/, fonts/, template.xml, icon/preview images), so the
# zip's contents match the widget exactly; version/commit/build-time
# traceability lives only in the output filename.
#
# Usage: ./build-package.sh [output-name.zip]

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if [[ ! -f index.html ]]; then
    echo "error: index.html not found — run this from the widget repo root" >&2
    exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
    echo "error: 'zip' is not installed" >&2
    exit 1
fi

# Version comes from the VERSION file (source of truth, bumped by hand per
# release). If it's missing, fall back to a tag pointing exactly at HEAD, and
# finally to the abbreviated commit hash (same %h format as
# `git log --pretty="%h"`).
if [[ -f VERSION ]]; then
    VERSION="$(tr -d '[:space:]' < VERSION)"
else
    VERSION="$(git describe --tags --exact-match HEAD 2>/dev/null || git rev-parse --short HEAD)"
fi
COMMIT="$(git rev-parse --short HEAD)"
BUILD_TIME_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
# Filesystem/filename-safe stamp (no colons) for the default output name.
BUILD_STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"

OUT_DIR="dist"
OUT_NAME="${1:-$(basename "$(pwd)")-${VERSION}-${COMMIT}-${BUILD_STAMP}.zip}"
OUT_PATH="$OUT_DIR/$OUT_NAME"

mkdir -p "$OUT_DIR"
rm -f "$OUT_PATH"

zip -r "$OUT_PATH" . \
    -x '.git/*' \
    -x '.github/*' \
    -x '.gitignore' \
    -x '*.md' \
    -x 'VERSION' \
    -x "$OUT_DIR/*" \
    -x 'build-package.sh' \
    -x '*.DS_Store' \
    > /dev/null

echo "Wrote $OUT_PATH (version=$VERSION, commit=$COMMIT, built=$BUILD_TIME_UTC)"
echo
echo "Contents:"
unzip -l "$OUT_PATH"
