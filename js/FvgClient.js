/** @copyright Copyright (c) 2026 Watchfire Signs, LLC. All rights reserved. */

/* exported FvgClient */

/** Lightweight client for the Falcon Vision Gateway REST API. */
var FvgClient = function (baseUrl, apiKey, proxyUrl, clientId) {
    'use strict';

    var trimmedBase = (baseUrl || '').replace(/\/+$/, '');
    var proxy = (proxyUrl || '').replace(/\/+$/, '');
    var clientIdHeader = (clientId || '').trim() || 'watchfiresigns';

    return {
        getSignValue: getSignValue
    };

    function buildUrl(path) {
        var target = trimmedBase + path;
        if (proxy) {
            return proxy + '?url=' + encodeURIComponent(target);
        }
        return target;
    }

    function getSignValue(signId, callback, errorCallback) {
        var url = buildUrl('/api/v1/signs/' + encodeURIComponent(signId) + '/value');
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.setRequestHeader('X-Client-Id', clientIdHeader);
        if (apiKey) {
            xhr.setRequestHeader('X-API-KEY', apiKey);
        }
        xhr.timeout = 2000;
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== XMLHttpRequest.DONE) { return; }
            if (xhr.status === 200) {
                try {
                    var parsed = JSON.parse(xhr.responseText);
                    callback(parsed && parsed.data ? parsed.data : null);
                } catch (e) {
                    if (typeof errorCallback === 'function') { errorCallback('parse'); }
                }
            } else {
                if (typeof errorCallback === 'function') { errorCallback(xhr.status || 'network'); }
            }
        };
        xhr.ontimeout = function () {
            if (typeof errorCallback === 'function') { errorCallback('timeout'); }
        };
        try {
            xhr.send();
        } catch (e) {
            if (typeof errorCallback === 'function') { errorCallback('send'); }
        }
    }
};
