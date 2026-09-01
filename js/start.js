/** @copyright Copyright (c) 2026 Watchfire Signs, LLC. All rights reserved. */

/* global QueryStringParser */
/* global Transformers */
/* global PlayerCallback */
/* global FvgClient */

(function () {
    'use strict';

    var parameters = QueryStringParser.parse(document.location.search);
    window.entryId = parameters.entryId;

    var isEditMode = parameters._editMode === 'true';
    var configuredIntervalMs = clampInt(parameters.pollIntervalMs, 100, 60000, 500);
    // Web-UI preview throttle: 500ms hammering the FVG box from a designer's
    // browser is wasteful and shows the gateway as a noisy client.
    var previewIntervalMs = 5000;
    var pollIntervalMs = isEditMode ? Math.max(configuredIntervalMs, previewIntervalMs) : configuredIntervalMs;

    var signId = (parameters.signId || '').trim();
    var showName = parameters.showName !== 'Hide';
    var showValue = parameters.showValue !== 'Hide';
    var nameColor = cssColor(parameters.nameColor, '#c8d2e0');
    var valueColor = cssColor(parameters.valueColor, '#3ddc84');
    var alertColor = cssColor(parameters.alertColor, '#ff0000');
    var alertRegex = compileRegex(parameters.alertRegex);
    var offlineDelayMs = clampInt(parameters.offlineDelaySeconds, 0, 300, 5) * 1000;

    var client = FvgClient(parameters.apiBaseUrl, parameters.apiKey, parameters._proxyURL);

    var content = document.getElementById('content');
    var nameCell = document.getElementById('nameCell');
    var valueCell = document.getElementById('valueCell');
    var nameSpan = nameCell.firstElementChild;
    var valueSpan = valueCell.firstElementChild;

    var inFlight = false;
    var lastName = null;
    var lastValue = null;
    var firstFailureAt = null;
    var refreshTimer;
    var hasSignaledLoad = false;

    var ro = (typeof ResizeObserver === 'function')
        ? new ResizeObserver(function (entries) {
            entries.forEach(function (entry) { refitCell(entry.target); });
        })
        : null;

    function start() {
        PlayerCallback.setStartTime(new Date());
        setBodyFont();
        nameSpan.style.color = nameColor;
        valueSpan.style.color = valueColor;
        if (!showName) { content.classList.add('hide-name'); }
        if (!showValue) { content.classList.add('hide-value'); }

        if (!signId) {
            setText(showName ? nameSpan : valueSpan, 'NO SIGN ID');
            refitAll();
            signalLoadOnce();
            return;
        }

        setText(nameSpan, '--');
        setText(valueSpan, '--');
        content.classList.add('offline');

        if (ro) {
            ro.observe(nameCell);
            ro.observe(valueCell);
        }

        // Custom fonts may not be ready when we first measure. Re-fit once
        // they are so width measurements reflect the actual rendered glyphs.
        refitAll();
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(refitAll);
        } else {
            // Chromium 55 (which the sign player ships) doesn't expose the
            // Font Loading API; fall back to a delayed second pass.
            setTimeout(refitAll, 1000);
        }

        poll();
    }

    function refitAll() {
        refitCell(nameCell);
        refitCell(valueCell);
    }

    /** Scale the cell's text to fill its width/height. Renders at 100px,
     *  measures, then scales. */
    function refitCell(cell) {
        var span = cell.firstElementChild;
        if (!span) { return; }
        var availW = cell.clientWidth;
        var availH = cell.clientHeight;
        if (availW <= 0 || availH <= 0) { return; }
        if (!span.textContent) { return; }

        span.style.fontSize = '100px';
        var spanW = span.scrollWidth;
        var spanH = span.scrollHeight;
        if (spanW <= 0 || spanH <= 0) { return; }

        var scale = Math.min(availW / spanW, availH / spanH);
        // Floor to avoid sub-pixel rounding pushing text past the cell edge.
        var size = Math.max(6, Math.floor(100 * scale));
        span.style.fontSize = size + 'px';
    }

    function setText(span, str) {
        span.textContent = str || '';
    }

    function poll() {
        if (inFlight) { return; }
        inFlight = true;
        client.getSignValue(signId, function (data) {
            inFlight = false;
            if (!data) { return handleFailure(); }
            applyValue(data);
        }, function () {
            inFlight = false;
            handleFailure();
        });
        signalLoadOnce();
    }

    function applyValue(data) {
        if (data.name) {
            var nextName = String(data.name).toUpperCase();
            if (lastName !== nextName) {
                nameSpan.textContent = nextName;
                lastName = nextName;
                refitCell(nameCell);
            }
        }

        var raw = (data.value === null || data.value === undefined) ? '' : String(data.value);
        var trimmed = raw.trim();
        // Treat an empty value the same as an unreachable sign so the offline
        // class stays in sync with the offline styling.
        if (!trimmed) { return handleFailure(); }

        firstFailureAt = null;

        if (/^blank$/i.test(trimmed)) {
            content.classList.remove('offline');
            content.classList.add('blanked');
            return;
        }
        content.classList.remove('blanked');

        var displayText = trimmed.toUpperCase();
        content.classList.remove('offline');
        if (lastValue !== displayText) {
            valueSpan.textContent = displayText;
            valueSpan.style.color = (alertRegex && alertRegex.test(trimmed)) ? alertColor : valueColor;
            lastValue = displayText;
            refitCell(valueCell);
        }
    }

    function handleFailure() {
        if (firstFailureAt === null) { firstFailureAt = Date.now(); }
        if (lastValue === null || Date.now() - firstFailureAt >= offlineDelayMs) {
            markOffline();
        }
    }

    function markOffline() {
        content.classList.remove('blanked');
        content.classList.add('offline');
        if (lastValue !== '--') {
            valueSpan.textContent = '--';
            valueSpan.style.color = valueColor;
            lastValue = '--';
            refitCell(valueCell);
        }
    }

    function setBodyFont() {
        Transformers.setFont(document.body, '20px', parameters.textFont, '#ffffff');
    }

    function clampInt(raw, min, max, fallback) {
        var n = parseInt(raw, 10);
        if (isNaN(n)) { return fallback; }
        return Math.max(min, Math.min(max, n));
    }

    function cssColor(raw, fallback) {
        var hex = (raw || '').trim().replace(/^#/, '');
        if (/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) { return '#' + hex; }
        return fallback;
    }

    function compileRegex(raw) {
        if (!raw || !String(raw).trim()) { return null; }
        try {
            return new RegExp(raw, 'i');
        } catch (e) {
            return null;
        }
    }

    function signalLoadOnce() {
        if (hasSignaledLoad) { return; }
        hasSignaledLoad = true;
        PlayerCallback.signalDelayedLoadEvent();
        if (typeof window.prestoWidgetProceed === 'function') {
            window.prestoWidgetProceed();
        }
    }

    window.prestoWidgetProceed = function () {
        if (refreshTimer !== undefined) {
            clearInterval(refreshTimer);
            refreshTimer = undefined;
        }
        if (signId) {
            refreshTimer = setInterval(poll, pollIntervalMs);
        }
    };

    window.prestoWidgetProceedPostCliff = function () {
        window.prestoWidgetProceed();
    };

    window.prestoWidgetStop = function () {
        if (refreshTimer !== undefined) {
            clearInterval(refreshTimer);
            refreshTimer = undefined;
        }
        if (ro) { ro.disconnect(); }
    };

    start();
}());
