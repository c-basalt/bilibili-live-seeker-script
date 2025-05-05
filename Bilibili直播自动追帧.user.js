// ==UserScript==
// @name         Bilibili直播自动追帧
// @namespace    https://space.bilibili.com/521676
// @version      0.7.9
// @description  自动追帧bilibili直播至设定的buffer length
// @author       c_b
// @match        https://live.bilibili.com/*
// @icon         https://www.bilibili.com/favicon.ico
// @license      GPLv3 License
// @homepageURL  https://github.com/c-basalt/bilibili-live-seeker-script/
// @supportURL   https://space.bilibili.com/521676
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// ==/UserScript==

// @ts-check
///<reference path="./Tampermonkey-Typescript-Declaration/tampermonkey-reference.d.ts" />

(function () {
    'use strict';
    const W = unsafeWindow;

    const migrateConfig = () => {
        const version = GM_getValue('version', 0);
        if (version < 1) {
            Object.entries({
                'auto-AV-sync': 'boolean',
                'hide-stats': 'boolean',
                'auto-reload': 'boolean',
                'force-flv': 'boolean',
                'prevent-pause': 'boolean',
                'force-raw': 'boolean',
                'auto-quality': 'boolean',
                'auto-speedup': 'boolean',
                'auto-slowdown': 'boolean',
                'block-roundplay': 'boolean',
                'buffer-threshold': 'number',
                'AV-resync-step': 'number',
                'AV-resync-interval': 'number',
                'speedup-thres': 'object',
                'speeddown-thres': 'object',
                'playurl-custom-endpoint': 'string',
                'hide-seeker-control-panel': 'boolean',
            }).forEach(([key, typeName]) => {
                try {
                    const value = typeName === 'string' ? localStorage.getItem(key) : JSON.parse(localStorage.getItem(key));
                    console.log('migrate', key, value);
                    if (value !== null && typeof value === typeName) {
                        if (key === 'playurl-custom-endpoint') {
                            GM_setValue('playinfo-custom-endpoint', value);
                        } else {
                            GM_setValue(key, value);
                        }
                    }
                } catch (e) {
                    console.error('[bililive-seeker] Failed to migrate setting for ' + key + '\n', e);
                }
            });
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                try {
                    if (key.match(/^playurl-\d+$/)) {
                        const value = JSON.parse(localStorage.getItem(key));
                        console.log('migrate', key, value);
                        GM_setValue(key, value);
                    }
                } catch (e) {
                    console.error('[bililive-seeker] Failed to migrate setting for ' + key + '\n', e);
                }
            }
        }
        GM_setValue('version', 1);
    }
    migrateConfig();

    if (!location.href.match(/https:\/\/live\.bilibili\.com\/(blanc\/)?\d+/)) return;
    // 仅对直播间生效


    // ----------------------- 获取参数 -----------------------

    const defaultValues = {
        'auto-AV-sync': false,
        'hide-stats': false,
        'auto-reload': true,
        'force-flv': true,
        'prevent-pause': false,
        'force-raw': false,
        'auto-quality': true,
        'auto-speedup': true,
        'auto-slowdown': true,
        'block-roundplay': false,
        'buffer-threshold': 1.5,
        'AV-resync-step': 0.05,
        'AV-resync-interval': 300,
        'speedup-thres': [[2, 1.3], [1, 1.2], [0, 1.1]],
        'speeddown-thres': [[0.2, 0.1], [0.3, 0.3], [0.6, 0.6]],
        'hide-seeker-control-panel': false,
    };

    /** @param {string} key */
    const getStoredValue = (key) => {
        return GM_getValue(key, defaultValues[key])
    };
    /** @param {string} key */
    const setStoredValue = (key, value) => {
        GM_setValue(key, value);
    };
    /** @param {string} key */
    const deleteStoredValue = (key) => {
        GM_deleteValue(key);
    };
    /** @returns {string[]} */
    const listStoredKeys = () => {
        return GM_listValues();
    };
    const clearStoredValues = () => {
        listStoredKeys().forEach(key => { deleteStoredValue(key) });
        setStoredValue('version', 1);
    }

    /** @template T * @param {string} key * @param {(value: any) => T} filterFunc * @returns {T} */
    const getStoredValueWithFilter = (key, filterFunc) => {
        let value = filterFunc(getStoredValue(key));
        if (value === null) value = filterFunc(defaultValues[key]);
        return value;
    }

    /** @param {any} value * @returns {boolean|null} */
    const booleanOrNull = value => (typeof value === 'boolean')? value : null;
    /** @param {any} value * @returns {number|null} */
    const numberOrNull = value => (value !== null && !Number.isNaN(Number(value)))? Number(value) : null;
    /** @param {any} value * @returns {string|null} */
    const stringOrNull = value => (typeof value === 'string')? value : null;

    /** @param {string} key * @returns {boolean|null} */
    const getStoredBoolean = key => getStoredValueWithFilter(key, booleanOrNull);
    /** @param {string} key * @returns {number|null} */
    const getStoredNumber = key => getStoredValueWithFilter(key, numberOrNull);
    /** @param {string} key * @returns {string|null} */
    const getStoredString = key => getStoredValueWithFilter(key, stringOrNull);
    /** @param {string} key * @returns {object} */
    const getStoredObject = key => getStoredValueWithFilter(key, value => value);


    /** @param {string} key * @param {boolean} [fallback] * @returns {boolean|null} */
    const isChecked = (key, fallback) => {
        /** @type {null | Element & { checked: any }} */
        const e = document.querySelector('#' + key);
        let value = booleanOrNull(e?.checked);
        if (value === null && fallback) value = getStoredBoolean(key);
        return value;
    }

    /** @param {string} key * @param {boolean} fallback * @returns {number|null} */
    const getNumValue = (key, fallback) => {
        /** @type {null | Element & { value: any }} */
        const e = document.querySelector('#' + key);
        let value = numberOrNull(e?.value);
        if (value === null && fallback) value = getStoredNumber(key);
        return value;
    };

    let room_init_res_cache;
    /** @returns {number|null} */
    const getRoomId = () => {
        const _getRoomId = () => {
            const room_id = Number(W.__NEPTUNE_IS_MY_WAIFU__?.roomInitRes?.data?.room_id || room_init_res_cache?.data?.room_id);
            return (!Number.isNaN(room_id))? room_id : null;
        }
        if (!_getRoomId()) getRoomInit();
        try {
            return _getRoomId() || Number(location.href.match(/\/(\d+)/)[1]);
        } catch (e) {
            console.error('[bililive-seeker] Failed to get room id\n', e)
            return null;
        }
    };


    // ----------------------- 播放器追帧 -----------------------

    /** @returns {HTMLVideoElement|undefined} */
    const getVideoElement = () => {
        return document.getElementsByTagName('video')[0];
    };
    /** @param {HTMLVideoElement|undefined|null} v * @returns {boolean|undefined} */
    const isLiveStream = (v) => {
        if (document.querySelector('.web-player-round-title')?.innerText) return false; // 轮播
        if (document.querySelector('.web-player-ending-panel')?.innerText) return false; // 闲置或轮播阻断
        const e = v || getVideoElement();
        if (!e) return undefined; // 网页加载
        return true; // 直播
    };
    /** @returns {HTMLVideoElement|null} */
    const getLiveVideoElement = () => {
        const v = getVideoElement();
        if (v && isLiveStream(v)) return v;
        return null;
    };

    /** @param {string} playback_rate */
    const updatePlaybackRateDisplay = (playback_rate) => {
        const usernameRate = document.querySelector('#playback-rate-username');
        if (!usernameRate) {
            const e = document.querySelector('.room-owner-username');
            if (e) {
                e.style.lineHeight = 'normal';
                e.innerHTML = e.innerHTML.match(/^([^<]+)(<|$)/)[1] + '<span id="playback-rate-username">　@' + playback_rate + '</span>'
            }
        } else {
            usernameRate.innerText = '　@' + playback_rate;
        }
        const titleRate = document.querySelector('#playback-rate-title');
        if (!titleRate) {
            const e2 = document.querySelector('.live-title .text');
            if (e2) {
                e2.innerHTML = e2.innerHTML.match(/^([^<]+)(<|$)/)[1] + '<br><span id="playback-rate-title" style="position: absolute; display:none">@' + playback_rate + '</span>'
            }
        } else {
            titleRate.innerText = '@' + playback_rate;
        }
    }

    /** @param {HTMLVideoElement} v * @param {any} rate */
    const setRate = (v, rate) => {
        const _rate = Number(rate);
        if (Number.isNaN(_rate) || !_rate) return;
        if (v.playbackRate.toFixed(2) === _rate.toFixed(2)) return;
        v.playbackRate = _rate;
        updatePlaybackRateDisplay(v.playbackRate.toFixed(2));
    }

    /** @param {HTMLVideoElement} v */
    const resetRate = (v) => {
        setRate(v, 1.0);
    }

    /** @param {HTMLVideoElement} v * @returns {number|null} */
    const getBufferlen = (v) => {
        try {
            const buffer_len = Number(v.buffered.end(v.buffered.length - 1) - v.currentTime);
            return (!Number.isNaN(buffer_len))? buffer_len : null;
        } catch (e) {
            console.error('[bililive-seeker] failed to get buffer length\n', e);
            return null;
        }
    }

    const adjustSpeedup = () => {
        try {
            const thres = getNumValue('buffer-threshold', false);
            const v = getLiveVideoElement();
            if (!thres || !v) return;

            const speedUpChecked = isChecked('auto-speedup', false);
            if (!speedUpChecked) {
                if (speedUpChecked === false && v.playbackRate > 1) resetRate(v);
                return;
            }
            const bufferLen = getBufferlen(v)
            if (bufferLen === null) return;
            let diffThres, rate;
            const speedupThres = getStoredObject('speedup-thres');
            for (let i = 0; i < speedupThres.length; i++) {
                [diffThres, rate] = speedupThres[i];
                if (bufferLen - thres > diffThres) {
                    setRate(v, rate);
                    return;
                }
            }
            if (v.playbackRate > 1) resetRate(v);
        } catch (e) {
            console.error('[bililive-seeker] Unexpected error when speeding up:\n', e)
        }
    }

    const adjustSpeeddown = () => {
        try {
            const v = getLiveVideoElement();
            if (!v) return;

            const slowDownChecked = isChecked('auto-slowdown', false);
            if (!slowDownChecked) {
                if (slowDownChecked === false && v.playbackRate < 1) resetRate(v);
                return;
            }
            const bufferLen = getBufferlen(v)
            if (bufferLen === null) return;
            let thres, rate;
            const speeddownThres = getStoredObject('speeddown-thres');
            for (let i = 0; i < speeddownThres.length; i++) {
                [thres, rate] = speeddownThres[i];
                if (bufferLen < thres) {
                    setRate(v, rate);
                    return;
                }
            }
            if (v.playbackRate < 1) resetRate(v);
        } catch (e) {
            console.error('[bililive-seeker] Unexpected error when speeding down:\n', e)
        }
    }
    const speedUpIntervalId = setInterval(() => { adjustSpeedup() }, 300)
    const speedDownIntervalId = setInterval(() => { adjustSpeeddown() }, 50)


    // ----------------------- 音画同步重置 -----------------------

    /** @type {number|undefined} */
    let avResyncIntervalId;
    const AVResync = () => {
        const v = getLiveVideoElement();
        const step = getNumValue('AV-resync-step', true);
        if (!v || step === null) return;
        console.debug("[bililive-seeker] enforce AV sync")
        v.currentTime = v.currentTime + step;
    }
    const stopAutoResync = () => {
        console.debug("[bililive-seeker] clear AV sync interval")
        clearInterval(avResyncIntervalId);
    }
    const startAutoResync = () => {
        stopAutoResync();
        console.debug("[bililive-seeker] start AV sync interval")
        avResyncIntervalId = setInterval(() => { AVResync() }, Math.max(1, getNumValue("AV-resync-interval", true) || 0) * 1000);
    }


    // ----------------------- 项目检查循环 -----------------------

    const checkPaused = () => {
        if (!isChecked('prevent-pause', false)) return
        const v = getLiveVideoElement();
        if (v && v.paused) {
            const thres = getNumValue('buffer-threshold', false);
            const bufferLen = getBufferlen(v);
            if (typeof thres === 'number' && typeof bufferLen === 'number' && thres > bufferLen) return;
            v.play();
        }
    }
    const checkPausedIntervalId = setInterval(() => { checkPaused() }, 500)

    /** @param {Object} options * @param {number} [options.timeout] * @param {string} [options.lastChat] */
    const offliveDanmakuLostReload = ({ timeout, lastChat }) => {
        if (!isChecked('auto-reload', false)) return;
        if (isLiveStream(null) === false && isChecked('block-roundplay', false) && getStoredBoolean('block-roundplay')) {
            const chatHistory = document.querySelector('.chat-history-panel')?.innerText;
            if (timeout) {
                setTimeout(() => { offliveDanmakuLostReload({ lastChat: chatHistory }) }, timeout)
            } else {
                if (chatHistory === lastChat) {
                    setTimeout(() => { W.location.reload(); }, 5000);
                    document.querySelector('label[for="auto-reload"]').classList.add('danmaku-lost');
                } else {
                    console.debug('[bililive-seeker] chat history changed');
                }
            }
        }
    }
    /** @param {number} [timeout] */
    const checkIsLiveReload = (timeout) => {
        if (isLiveStream(null) === false) {
            W.fetch(formatPlayurlReq(getRoomId()))
                .then(r => r.json())
                .then(r => {
                console.debug('[bililive-seeker] live status', r.data?.live_status);
                if (!isChecked('auto-reload', false)) return
                if (r.data?.live_status === 1) {
                    // 0: 闲置，1: 直播，2: 轮播
                    const reloadLabel = document.querySelector('label[for="auto-reload"]');
                    if (timeout) {
                        setTimeout(() => { checkIsLiveReload() }, timeout);
                        if (reloadLabel) reloadLabel.classList.add('live-on');
                        return;
                    } else {
                        if (reloadLabel) reloadLabel.classList.add('reload');
                        W.location.reload();
                    }
                }
            });
        }
        document.querySelector('label[for="auto-reload"]').classList.remove('live-on');
    }
    /** @param {number} [timeout] */
    const checkErrorReload = (timeout) => {
        if (!isChecked('auto-reload', false)) return;
        const error = document.querySelector('.web-player-error-panel');
        if (error) {
            const reloadLabel = document.querySelector('label[for="auto-reload"]');
            if (timeout) {
                setTimeout(() => { checkErrorReload() }, timeout);
                if (reloadLabel) reloadLabel.classList.add('video-error');
                return;
            } else {
                if (reloadLabel) reloadLabel.classList.add('reload');
                W.location.reload();
            }
        }
        document.querySelector('label[for="auto-reload"]').classList.remove('video-error');
    }
    const offLiveDanmakuReloadIntervalId = setInterval(() => { offliveDanmakuLostReload({ timeout: 3600 * 1000 }) }, 600 * 1000);
    const checkLiveReloadIntervalId = setInterval(() => { checkIsLiveReload(10 * 1000) }, 120 * 1000);
    const checkErrorReloadIntervalId = setInterval(() => { checkErrorReload(3000) }, 2000);


    // ----------------------- 网络请求 -----------------------

    /** @param {string} url */
    const xhrGetApi = (url) => {
        try {
            const request = new XMLHttpRequest();
            request.open('GET', url, false);
            request.withCredentials = true;
            request.send(null);
            if (request.status === 200) {
                return JSON.parse(request.responseText);
            } else {
                console.error(`[bililive-seeker] request failed with status ${request.status} for "${url}"`);
            }
        } catch (e) {
            console.error(`[bililive-seeker] failed to get data from "${url}" \n`, e);
        }
    }

    /** @param {number|string} room_id */
    const formatPlayurlReq = (room_id) => `https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=${room_id}&protocol=0,1&format=0,1,2&codec=0,1&qn=10000&platform=web&dolby=5&panorama=1`;

    /** @param {number} room_id */
    const getPlayUrl = (room_id) => {
        console.debug('[bililive-seeker] request playurl');
        const rsp = xhrGetApi(formatPlayurlReq(room_id));
        return rsp?.data?.playurl_info?.playurl;
    }
    const getRoomInit = () => {
        try {
            const room_id = location.href.match(/\/(\d+)(\?|$)/)[1];
            const rsp = xhrGetApi(formatPlayurlReq(room_id));
            if (rsp) cacheRoomInit(rsp);
        } catch (e) {
            console.error('[bililive-seeker] failed to request room init data\n', e);
        }
    }


    // ----------------------- 网络请求hook -----------------------

    /** @param {number} timeout */
    const asyncSleep = (timeout) => new Promise(r => setTimeout(() => r(timeout), timeout));

    const cacheRoomInit = (roomInitRsp) => {
        if (W.__NEPTUNE_IS_MY_WAIFU__?.roomInitRes?.data) return;
        if (room_init_res_cache?.data) return;
        room_init_res_cache = roomInitRsp;
        console.debug('[bililive-seeker] roominit cached', room_init_res_cache);
    }
    const cachePlayUrl = (playurl) => {
        if (!playurl?.stream) return;
        try {
            console.debug('[bililive-seeker] playurl', playurl);
            const baseurl = playurl.stream[0].format[0].codec[0].base_url;
            const qn = playurl.stream[0].format[0].codec[0].current_qn;
            if (qn === 10000 && baseurl.match(/\/live_\d+(?:_bs)?_\d+(?:_[0-9a-f]{8})?\.flv/)) {
                // 未二压的链接格式
                console.debug('[bililive-seeker] caching raw stream url', baseurl);
                setStoredValue('playurl-' + playurl.cid, playurl);
            }
        } catch (e) {
            console.error('[bililive-seeker] Unexpected error when caching playurl:\n', e);
        }
    }

    const expiredPlayurlChecker = () => {
        listStoredKeys().filter(key => key.match(/^playurl-\d+$/)).forEach(key => {
            try {
                const expireTs = getStoredValue(key).stream[0].format[0].codec[0].url_info[0].extra.match(/expires=(\d+)/)[1];
                if (!(Date.now() / 1000 < Number(expireTs))) {
                    console.log('[bililive-seeker] remove expired playurl');
                    deleteStoredValue(key);
                }
            } catch (e) {
                console.warn('[bililive-seeker] Failed to validate cached playurl. Removing from cache.\n', e);
                deleteStoredValue(key);
            }
        });
        setTimeout(() => {
            const room_id = getRoomId();
            /** @type {HTMLElement|null} */
            const e = document.querySelector('#force-raw');
            if (e) {
                if (!getStoredValue('playurl-' + room_id)) {
                    e.style.cssText = 'filter: grayscale(1) brightness(1.5)';
                } else {
                    e.style.cssText = '';
                }
            } else {
                console.debug('[bililive-seeker] Failed to find force-raw element to update')
            }
        }, 200);
    }
    const checkPlayurlIntervalId = setInterval(() => { expiredPlayurlChecker() }, 600 * 1000);

    const interceptPlayurl = (r) => {
        const playurl = r.data?.playurl_info?.playurl;
        if (!playurl) return r;
        cachePlayUrl(playurl);
        console.debug('[bililive-seeker] got playinfo', r);
        if (isChecked('force-raw', true)) {
            expiredPlayurlChecker();
            const cachedUrl = getStoredValue('playurl-' + playurl.cid);
            console.debug('[bililive-seeker] load cached url', cachedUrl);
            if (cachedUrl) r.data.playurl_info.playurl = cachedUrl;
        }
        if (isChecked('force-flv', true)) {
            console.debug('[bililive-seeker] filter video formats');
            const filteredStream = playurl.stream.filter(i => i.protocol_name !== "http_hls");
            if (filteredStream.length) playurl.stream = filteredStream;
            playurl.stream.forEach(i => {
                i.format.forEach(j => {
                    const filteredCodec = j.codec.filter(k => k.codec_name !== "hevc");
                    if (filteredCodec.length) j.codec = filteredCodec;
                });
            });
        }
        return r;
    }

    /** @param {string} url * @returns {string} */
    const replaceRoomplayReqUrl = (url) => {
        if (isChecked('auto-quality', true)) {
            url = url.replace(/qn=0\b/, 'qn=10000');
        }
        if (isChecked('force-flv', true)) {
            url = url.replace(/protocol=0(?:,|%2C)[^&]+/, 'protocol=0');
            url = url.replace(/codec=0(?:,|%2C)[^&]+/, 'codec=0');
        }
        const endpoint = getStoredString('playinfo-custom-endpoint');
        if (endpoint) {
            url = url.replace(/^\/\//, 'https://');
            url = url.replace('https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo', endpoint);
            console.debug('[bililive-seeker] replacing API endpoint', url);
        }
        return url;
    }

    const hookFetch = () => {
        const origFetch = W.fetch;
        W.fetch = async function () {
            try {
                /** @type {URL | RequestInfo} */
                const resource = arguments[0];
                let url = (resource instanceof Request)? resource.url : resource.toString();
                if (url.match('api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo')) {
                    url = replaceRoomplayReqUrl(url);
                    arguments[0] = (resource instanceof Request)? new Request(url, resource) : url;
                    // since this should only be GET request
                    console.debug('[bililive-seeker] modified roomPlayInfo fetch request', arguments);
                    const response = await origFetch.apply(this, arguments);
                    const r = interceptPlayurl(await response.clone().json());
                    return new Response(JSON.stringify(r), response);
                } else if (url.match('api.live.bilibili.com/live/getRoundPlayVideo') && isChecked('block-roundplay', true)) {
                    console.debug('[bililive-seeker] block roundplay');
                    return new Response('{"code":0,"data":{"cid":-3}}');
                } else if (url === '//_test_hook_alive_dummy_url/') {
                    return new Response('success');
                }
            } catch (e) {
                console.error('[bililive-seeker] error from hooked fetch request\n', e);
            }
            return origFetch.apply(this, arguments);
        }
        console.debug('[bililive-seeker] `window.fetch` hooked');
    }
    const checkHookAlive = async () => {
        try {
            hookFetch();
            for (let i = 0; i < 50; i++) {
                await W.fetch('//_test_hook_alive_dummy_url/').catch(e => { hookFetch(); });
                await asyncSleep(100);
            }
        } catch (e) {
            console.error('[bililive-seeker] error while hooking `window.fetch`\n', e);
        }
    }
    checkHookAlive();

    try {
        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function () {
            try {
                /** @type {string|URL} */
                let url = arguments[1];
                url = url.toString();
                if (url.match('api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo')) {
                    url = replaceRoomplayReqUrl(url);
                    arguments[1] = url;
                }
            } catch (e) {
                console.error('[bililive-seeker] error from hooked `xhr.open`\n', e);
            }
            return origOpen.apply(this, arguments);
        }
    } catch (e) {
        console.error('[bililive-seeker] Failed to hook `XMLHttpRequest.open`\n', e);
    }

    try {
        const xhrAccessor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
        Object.defineProperty(XMLHttpRequest.prototype, 'responseText', {
            get: function () {
                try {
                    if (this.responseURL.match('api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo') || this.responseURL.match(getStoredString('playinfo-custom-endpoint'))) {
                        const rsp = JSON.parse(xhrAccessor.get.call(this));
                        cacheRoomInit(rsp);
                        return JSON.stringify(interceptPlayurl(rsp));
                    }
                } catch (e) {
                    console.error('[bililive-seeker] error from hooked xhr.responseText\n', e);
                }
                return xhrAccessor.get.call(this);
            },
            set: function (str) {
                return xhrAccessor.set.call(this, str);
            },
            configurable: true
        });
    } catch (e) {
        console.error('[bililive-seeker] Failed to hook `XMLHttpRequest.responseText`, possibly due to effect of another script. auto-quality and force-flv may not work as intended:\n', e);
    }

    /** @param {any} W * @param {string} key * @param {number} sleep * @param {number} timeout * @param {(obj: any) => any} exec */
    const waitForWindowObj = async (W, key, sleep, timeout, exec) => {
        for (let i = 0; timeout > 0; i++) {
            if (W[key]) {
                console.debug(`[bililive-seeker] loop=${i} processing "${key}"`);
                exec(W[key]);
                return;
            }
            timeout -= await asyncSleep(sleep);
        }
        console.debug(`[bililive-seeker] no "${key}" found to process`);
    }

    // Object.is(window.EmbedPlayer.instance, window.livePlayer) => true
    waitForWindowObj(W, 'livePlayer', 1000, 90000, (player) => {
        if (player.getPlayerInfo && !player.__bililive_seeker_hooked) {
            const origGetter = player.getPlayerInfo.bind(player);
            player.getPlayerInfo = () => {
                const info = origGetter();
                info.qualityCandidates = info.qualityCandidates.filter(i => !(Number(i.qn) < Number(info.quality)));
                return info;
            };
            player.__bililive_seeker_hooked = true;
            console.debug('[bililive-seeker] `window.livePlayer.getPlayerInfo` hooked');
        }
        if (getStoredBoolean('auto-quality')) {
            console.debug('[bililive-seeker] switching original quality');
            if (Number(player.getPlayerInfo().quality) < 10000) player.switchQuality('10000');
        }
    });

    waitForWindowObj(W, '__NEPTUNE_IS_MY_WAIFU__', 10, 30000, (init_data) => {
        if (init_data?.roomInitRes) {
            init_data.roomInitRes = interceptPlayurl(init_data.roomInitRes);
        }
        const stream = init_data?.roomInitRes?.data?.playurl_info?.playurl?.stream;
        if (stream?.length && getStoredBoolean('auto-quality')) {
            if (stream[0].format[0].codec[0].current_qn < 10000) {
                room_init_res_cache = init_data.roomInitRes;
                console.debug('[bililive-seeker] dropping non-original quality');
                init_data.roomInitRes = null;
            }
        }
        console.debug('[bililive-seeker] `window.__NEPTUNE_IS_MY_WAIFU__` processed');
    });

    // ----------------------- 选项UI -----------------------

    /** @param {() => HTMLElement|null} checker * @param {(node: HTMLElement) => void} exec * @param {number} [timeout] */
    const waitForElement = (checker, exec, timeout) => {
        const node = checker();
        if (node) {
            exec(node);
        } else {
            if (timeout !== undefined) {
                timeout -= 100;
                if (timeout > 0) setTimeout(() => waitForElement(checker, exec, timeout), 100);
            } else {
                setTimeout(() => waitForElement(checker, exec), 100);
            }
        }
    }

    /** @param {string} query * @param {(node: HTMLElement) => void} exec * @param {number} timeout=10000 */
    const waitForQuery = (query, exec, timeout = 10000) => {
        waitForElement(() => document.querySelector(query), exec, timeout)
    }

    /** @param {string} query * @param {Document|HTMLElement} root * @returns {HTMLElement[]} */
    const queryAllElements = (query, root = document) => {
        return Array.prototype.slice.call(root.querySelectorAll(query))
    }

    waitForQuery('#head-info-vm', node => {
        setTimeout(() => {
            if (document.querySelector('#head-info-vm .lower-row')) {
                console.debug('[bililive-seeker] Page is loaded, will not add reset button');
                return;
            }
            console.debug('[bililive-seeker] Adding reset button');
            const resetButtonWrapper = document.createElement('span');
            resetButtonWrapper.innerHTML = (
                '<button id="reset-seeker-configs-fallback">重置追帧脚本配置</button>' +
                '<style>#reset-seeker-configs-fallback {background: transparent; border: 1.5px solid #999; border-radius: 4px}' +
                '#reset-seeker-configs-fallback:active { transform: translate(1px, 1px); }</style>');
            resetButtonWrapper.style.cssText = 'position: absolute; right: 25px; top: 15px';
            resetButtonWrapper.children[0].onclick = _ => { clearStoredValues(); location.reload() };
            node.appendChild(resetButtonWrapper);
            waitForQuery('#head-info-vm .lower-row', _ => {
                console.log('[bililive-seeker] Removing reset button');
                document.querySelector('#reset-seeker-configs-fallback').parentElement.remove();
            }, 180*1000);
        }, 3000);
    });

    waitForQuery('#head-info-vm .lower-row', node => {
        const controlPanel = document.createElement("span");
        controlPanel.innerHTML = (
            '<span id="basic-settings-page">' +
            '  <span title="重新从当前的位置开始播放直播来重置音视频的同步，以应对音视频的不同步  &#13;&#10;重置时会有一瞬的卡顿  &#13;&#10;勾选后自动每隔一段时间执行一次重置，重置间隔可以在高级选项中设置">' +
            '<button id="reset-AV-sync" type="button" style="width:7em">重置音画同步</button><input type="checkbox" id="auto-AV-sync">' +
            '  </span><span title="隐藏播放器右键菜单中的“视频统计信息”悬浮窗  &#13;&#10;悬浮窗未开启时会自动取消勾选">' +
            '<label for="hide-stats">隐藏统计</label><input type="checkbox" id="hide-stats">' +
            '  </span><span title="当检测到播放器暂停，且缓冲长度超过“追帧秒数”时，自动恢复播放器播放">' +
            '<label for="prevent-pause">避免暂停</label><input type="checkbox" id="prevent-pause">' +
            '  </span><span title="直播状态下，检测到错误时自动刷新页面  &#13;&#10;或在下播状态下，弹幕服务器疑似断连时，自动刷新页面  &#13;&#10;刷新页面前文字会变为橙色">' +
            '<label for="auto-reload">自动刷新</label><input type="checkbox" id="auto-reload">' +
            '  </span>' +
            '<br>' +
            '  <span title="尝试去除视频流中的HEVC(“PRO”画质)和HLS流，让播放器优先使用FLV协议的AVC流，以降低延迟">' +
            '<label for="force-flv">强制avc+flv</label><input type="checkbox" id="force-flv">' +
            '  </span><span title="当获取的直播视频流为延迟更高的二压视频时，尝试替换为保存的原画流，以降低延迟  &#13;&#10;当前直播间没有保存原画流/原画流已过期时，选择框为灰色  &#13;&#10;主播网络卡顿/重开推流后可能出现一直重复最后几秒的情况，需取消该选项后切换一次画质或刷新">' +
            '<label for="force-raw">强制原画</label><input type="checkbox" id="force-raw" style="filter: grayscale(1) brightness(1.5)">' +
            '  </span><span title="进入直播间时自动切换右下角的“原画”画质。和手动切换效果相同">' +
            '<label for="auto-quality">自动原画</label><input type="checkbox" id="auto-quality">' +
            '  </span><span title="阻止直播间进行轮播">' +
            '<label for="block-roundplay">阻止轮播</label><input type="checkbox" id="block-roundplay">' +
            '  </span>' +
            '<br>' +
            '  <span title="跳转至非活动页面的常规直播间">' +
            '<a id="go-to-blanc-room" style="display: none; text-align: center; width: 7.5em" target="_parent">转至常规直播间</a>' +
            '  </span>' +
            '<button id="go-to-adv-settings" type="button" style="width: 7em">转到高级选项</button>' +
            '  <span title="本地播放器追帧的目标缓冲长度，单位为秒（播放器缓冲的长度1：1等于播放器产生的延迟）  &#13;&#10;过小容易导致卡顿甚至丢失原画的连接  &#13;&#10;需根据自己的网络情况选择合适的值  &#13;&#10;可在高级选项中关闭追帧">' +
            '<label for="buffer-threshold">追帧秒数</label><input type="number" id="buffer-threshold" step="0.1" style="width: 3em;">' +
            '  </span>' +
            '</span>' +

            '<span id="adv-settings-page" style="display:none">' +
            '  <span title="清空重置追帧脚本的所有配置（包括缓存的原画链接）并立刻刷新页面">' +
            '<button id="reset-seeker-configs" style="width: 5em">重置配置</button>' +
            '  </span><span title="复制当前直播间保存的原画流链接到剪贴板，可用于“设置连接”">' +
            '<button id="copy-playurl" type="button" style="width: 7em">复制推流链接</button>' +
            '  </span><span title="手动设置当前直播间保存的原画流链接，用于“强制原画”选项让播放器加载延迟更低的原画流  &#13;&#10;错误的配置可能导致无法正常观看直播！">' +
            '<button id="set-playurl" type="button">设置链接!</button>' +
            '  </span><span title="设置获取视频流链接的API，详见说明中的链接  &#13;&#10;使用后可能无法观看各种限定直播！  &#13;&#10;错误的配置可能导致无法正常观看直播！">' +
            '<button id="set-endpoint" type="button" style="width: 8em">设置视频流API !</button>' +
            '  </span>' +
            '<br>' +
            '  <span title="设置缓冲时长超过追帧秒数时，缓冲长度和追帧秒数的差值的各级阶梯阈值，以及各级阶梯要加快到的播放速度  &#13;&#10;错误的配置可能导致播放不正常！">' +
            '<button id="set-speedup-thres" type="button" style="width: 7.5em">设置加速阈值!</button>' +
            '  </span><span title="取消勾选后将不会在缓冲时长超过追帧秒数时自动加速追帧">' +
            '<label for="auto-speedup">追帧加速</label><input type="checkbox" id="auto-speedup" checked>' +
            '  </span>' +
            '  <span title="设置缓冲时长极低时，降低播放速度的各级阶梯的缓冲时长阈值，以及各级阶梯要降低到的播放速度  &#13;&#10;错误的配置可能导致播放不正常！">' +
            '<button id="set-slowdown-thres" type="button" style="width: 7.5em">设置减速阈值!</button>' +
            '  </span><span title="取消勾选后将不会在缓冲时长降低至减速阈值后自动降低播放速度">' +
            '<label for="auto-slowdown">自动减速</label><input type="checkbox" id="auto-slowdown" checked>' +
            '  </span>' +
            '<br>' +
            '<button id="go-to-basic-settings" type="button" style="width: 7em">转到基础选项</button>' +
            '  <span title="重置音画同步时，重新开始位置相对现在的秒数  &#13;&#10;合适的值可以减轻重置时的卡顿感">' +
            '<label for="AV-resync-step">音画同步重置步进</label><input type="number" id="AV-resync-step" step="0.01" style="width: 3.5em;">' +
            '  </span><span title="勾选“重置音画同步”后，自动进行音画同步重置的间隔时长，单位为秒">' +
            '<label for="AV-resync-interval">间隔</label><input type="number" id="AV-resync-interval" step="1" min="1" style="width: 3.5em;">' +
            '  </span>' +
            '</span>' +

            '<style>#seeker-control-panel button, #seeker-control-panel a { width:5.5em;padding:1px;background: transparent; border: 1.5px solid #999; border-radius: 4px; color: #999; filter: contrast(0.6);}' +
            '#seeker-control-panel input[type="number"] { border: 1.5px solid #999; border-radius: 2px; }'+
            '#seeker-control-panel button:hover, #seeker-control-panel a:hover { filter: none; } #seeker-control-panel button:active { filter: none; transform: translate(0.3px, 0.3px); }' +
            '#seeker-control-panel label { pointer-events: none; margin:1px 2px; color: #999; filter: contrast(0.6);} #seeker-control-panel input { vertical-align: middle; margin:1px; }' +
            '#seeker-control-panel label.danmaku-lost, #seeker-control-panel label.live-on, #seeker-control-panel label.video-error, #seeker-control-panel label.reload { color: orange!important; filter: none; }</style>'
        );
        controlPanel.style.cssText = 'text-align: right; flex: 0 0 fit-content; margin-left: 5px; margin-top: -5px;';
        controlPanel.id = 'seeker-control-panel';
        node.appendChild(controlPanel);

        queryAllElements('label, button, a', controlPanel).forEach(node => {
            node.classList.add('live-skin-normal-a-text');
        })

        /** @param {HTMLElement} node * @param {(event: MouseEvent & {target: HTMLElement}) => void} callback */
        const setOnclick = (node, callback) => {
            node.onclick = callback;
        }

        /** @param {HTMLElement} node * @param {(event: Event & {target: HTMLInputElement}) => void} callback */
        const setOnchange = (node, callback) => {
            node.onchange = callback;
        }

        /** @type {{ [key: string]: (event: MouseEvent & {target: HTMLElement}) => void}} */
        const clickCallbacks = {
            'reset-seeker-configs': event => {
                if (confirm('请确认是否要清除追帧脚本的所有配置（包括缓存的原画链接），重置为默认配置，并刷新页面？')) {
                    setTimeout(() => {
                        if (confirm('请再次确认是否清除所有配置')) {
                            clearStoredValues();
                            location.reload();
                        }
                    }, 1000);
                }
            },
            'copy-playurl': event => {
                const room_id = getRoomId();
                if (!room_id) return;
                const value = JSON.stringify(getStoredValue('playurl-' + room_id));
                if (!value) {
                    event.target.innerText = '无原画';
                } else {
                    navigator.clipboard.writeText(value);
                    event.target.innerText = '已复制';
                }
                setTimeout(() => { event.target.innerText = '复制推流链接' }, 1000);
            },
            'set-playurl': event => {
                const value = prompt("请输入playurl json字符串或带query string的完整flv网址\n如出错请取消勾选强制原画；留空点击确定清除当前直播间设置");
                if (value === null) return;
                const room_id = getRoomId();
                if (value === "") {
                    deleteStoredValue('playurl-' + room_id);
                    expiredPlayurlChecker();
                } else {
                    try {
                        let data;
                        if (value.match(/^(https:\/\/[^\/]+)(\/live-bvc\/\d+\/live_[^\/]+flv\?)(expires=\d+.*)/)) {
                            const m = value.match(/^(https:\/\/[^\/]+)(\/live-bvc\/\d+\/live_[^\/]+flv\?)(expires=\d+.*)/);
                            data = getPlayUrl(getRoomId());
                            data.stream.forEach(i => {
                                i.format.forEach(j => {
                                    j.codec.forEach(k => {
                                        k.base_url = m[2];
                                        k.url_info.forEach(u => {
                                            u.extra = m[3];
                                            u.host = m[1];
                                        })
                                        k.url_info = [k.url_info[0]];
                                    })
                                })
                            });
                            console.debug('[bililive-seeker] parsed stream url to playurl', data);
                        } else {
                            console.debug('[bililive-seeker] parsing playurl as json', value);
                            data = JSON.parse(value);
                        }
                        if (data.cid !== room_id) {
                            if (!confirm("json的房间号" + data.cid + "可能不符，是否依然为当前房间" + room_id + "设置？")) return
                        }
                        setStoredValue('playurl-' + room_id, data);
                        expiredPlayurlChecker();
                    } catch (e) {
                        alert('json字符串/flv链接解析失败\n' + e);
                        console.error(e);
                    }
                }
            },
            'set-endpoint': event => {
                const url = getStoredString('playinfo-custom-endpoint') || "https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo";
                const value = prompt("请输入获取playurl所用的自定义API endpoint，用以替换默认的`https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo`\n如出错请留空点击确定恢复默认API", url);
                if (value === null || value === url) return;
                if (value === "") {
                    deleteStoredValue('playinfo-custom-endpoint');
                } else {
                    setStoredValue('playinfo-custom-endpoint', value);
                }
            },
            'set-speedup-thres': event => {
                const storedThres = JSON.stringify(getStoredObject('speedup-thres'));
                const value = prompt("请输入想要设定的追帧加速阈值\nJSON格式为[[缓冲长度阈值(秒), 播放速率],...]\n留空点击确定以恢复默认值", storedThres);
                if (value === null || value === storedThres) return;
                if (value === "") {
                    deleteStoredValue('speedup-thres');
                } else {
                    try {
                        const newThres = JSON.parse(value);
                        setStoredValue('speedup-thres', newThres);
                    } catch (e) {
                        alert("设置失败\n" + e);
                        console.error(e);
                    }
                }
            },
            'set-slowdown-thres': event => {
                const storedThres = JSON.stringify(getStoredObject('speeddown-thres'));
                const value = prompt("请输入想要设定的自动减速阈值\nJSON格式为[[缓冲长度阈值(秒), 播放速率],...]\n留空点击确定以恢复默认值", storedThres);
                if (value === null || value === storedThres) return;
                if (value === "") {
                    deleteStoredValue('speeddown-thres');
                } else {
                    try {
                        const newThres = JSON.parse(value);
                        setStoredValue('speeddown-thres', newThres);
                    } catch (e) {
                        alert("设置失败\n" + e);
                        console.error(e);
                    }
                }
            },
        }

        /** @type {{ [key: string]: (node: HTMLInputElement) => void}} */
        const checkboxCallbacks = {
            'hide-stats': node => {
                /** @type {HTMLElement|null} */
                const infoPanel = document.querySelector('.web-player-video-info-panel');
                if (!infoPanel) {
                    node.checked = false;
                    return;
                }
                if (node.checked) {
                    if (infoPanel.style.display === 'none') {
                        infoPanel.style.opacity = '';
                        node.checked = false;
                        return;
                    } else {
                        queryAllElements('div', infoPanel).filter(i => i.innerText === '[x]').forEach(i => { i.style.display = 'none'; });
                        infoPanel.style.opacity = '0';
                        infoPanel.style.userSelect = 'none';
                    }
                } else {
                    infoPanel.style.userSelect = 'text';
                    infoPanel.style.opacity = '';
                    queryAllElements('div', infoPanel).filter(i => i.innerText === '[x]').forEach(i => { i.style.display = ''; });
                }
            },
            'auto-AV-sync': node => {
                if (node.checked) {
                    startAutoResync();
                } else {
                    stopAutoResync();
                }
            },
            'auto-speedup': node => {
                if (!node.checked) {
                    controlPanel.querySelector('label[for="buffer-threshold"]').style.textDecoration = 'line-through black solid 2px';
                    controlPanel.querySelector('#buffer-threshold').style.background = '#feee';
                } else {
                    controlPanel.querySelector('label[for="buffer-threshold"]').style.textDecoration = '';
                    controlPanel.querySelector('#buffer-threshold').style.background = '';
                }
            },
        }

        const saveConfig = () => {
            console.debug('[bililive-seeker] config changed');
            queryAllElements('input[type=checkbox]', controlPanel).forEach(e => {
                setStoredValue(e.id, Boolean(e.checked));
            });
            queryAllElements('input[type=number]', controlPanel).forEach(e => {
                setStoredValue(e.id, Number(e.value));
            });
        }

        queryAllElements('button', controlPanel).forEach(node => {
            if (clickCallbacks[node.id]) {
                setOnclick(node, clickCallbacks[node.id]);
            } else if (node.id === 'go-to-adv-settings') {
                setOnclick(node, event => {
                    document.querySelector('#basic-settings-page').style.display = "none";
                    document.querySelector('#adv-settings-page').style.display = "";
                });
            } else if (node.id === 'go-to-basic-settings') {
                setOnclick(node, event => {
                    document.querySelector('#basic-settings-page').style.display = "";
                    document.querySelector('#adv-settings-page').style.display = "none";
                });
            } else if (node.id === 'reset-AV-sync') {
                setOnclick(node, event => { AVResync(); });
            } else {
                setOnclick(node, event => { alert('No behavior is assigned for this button'); console.warn('[bililive-seeker] No behavior bound to button ' + node.id); });
                console.warn('[bililive-seeker] No behavior bound to button ' + node.id);
            }
        })

        queryAllElements('input[type=checkbox]', controlPanel).forEach(_node => {
            const node = /** @type {HTMLInputElement} */ (_node);
            const storedChecked = getStoredBoolean(node.id);
            if (storedChecked !== null) node.checked = storedChecked;
            if (typeof defaultValues[node.id] != 'boolean') console.warn('[bililive-seeker] Missing default for checkbox ' + node.id);
            if (checkboxCallbacks[node.id]) {
                setOnchange(node, event => { saveConfig(); checkboxCallbacks[node.id](event.target); });
                setTimeout(() => { checkboxCallbacks[node.id](node); }, 100);
            } else {
                setOnchange(node, event => { saveConfig(); });
            }
        })

        queryAllElements('input[type=number]', controlPanel).forEach(_node => {
            const node = /** @type {HTMLInputElement} */ (_node);
            const storedNumer = getStoredNumber(node.id);
            if (storedNumer !== null) node.value = storedNumer.toString();
            if (typeof defaultValues[node.id] != 'number') console.warn('[bililive-seeker] Missing default value for input ' + node.id);
            if (node.id === 'AV-resync-interval') {
                setOnchange(node, event => { saveConfig(); if (isChecked('auto-AV-sync', true)) startAutoResync(); })
            } else {
                setOnchange(node, event => { saveConfig(); })
            }
        })

        if (W.self !== W.top) {
            waitForQuery('a#go-to-blanc-room', _node => {
                const node = /** @type {HTMLAnchorElement} */ (_node);
                node.style.display = "inline-block";
                node.href = location.href;
            });
        }

        expiredPlayurlChecker();
    }, 180*1000);

    waitForQuery('#head-info-vm .lower-row .right-ctnr', node => {
        const getBottom = (e) => { const rect = e.getBoundingClientRect(); return rect.y + rect.height; }
        const getTop = (e) => { const rect = e.getBoundingClientRect(); return rect.y }
        const observer = new ResizeObserver((entries) => {
            if (node.children.length <= 1) return;
            if (getTop(node.children[node.children.length - 1]) >= getBottom(node.children[0])) {
                node.style.marginTop = '-20px';
                node.style.alignItems = 'flex-end';
                waitForQuery('#playback-rate-username', node => { node.style.display = 'none'; }, 100);
                waitForQuery('#playback-rate-title', node => { node.style.display = ''; node.parentElement.style.paddingBottom = '16px'; }, 100);
            } else {
                node.style.marginTop = '';
                node.style.alignItems = '';
                waitForQuery('#playback-rate-username', node => { node.style.display = ''; }, 100);
                waitForQuery('#playback-rate-title', node => { node.style.display = 'none'; node.parentElement.style.paddingBottom = ''; }, 100);
            }
        });
        observer.observe(node);
    }, 180*1000);

    // ----------------------- 显示折叠UI -----------------------


    const updatePanelHideState = () => {
        if (getStoredBoolean('hide-seeker-control-panel')) {
            waitForQuery('#seeker-control-panel', node => { node.style.display = 'none'; });
            waitForQuery('#control-panel-showhide span', node => { node.innerText = '显示追帧'; });
            waitForQuery('#head-info-vm .upper-row .right-ctnr', node => { node.style.marginTop = ''; });
            waitForQuery('#head-info-vm .lower-row', node => { node.style.marginTop = ''; });
            waitForQuery('#head-info-vm .lower-row .right-ctnr', node => { node.style.flex = ''; node.style.flexWrap = ''; node.style.placeContent = ''; node.style.rowGap = ''; });

            waitForQuery('#head-info-vm .lower-row .pk-act-left-distance', node => { node.style.maxWidth = ''; }, 15000);
            waitForQuery('#head-info-vm .lower-row .act-left-distance', node => { node.style.maxWidth = ''; }, 15000);
            waitForQuery('#head-info-vm .lower-row .gift-planet-entry', node => { node.style.marginLeft = ''; }, 15000);
        } else {
            waitForQuery('#seeker-control-panel', node => { node.style.display = ''; });
            waitForQuery('#control-panel-showhide span', node => { node.innerText = '隐藏追帧'; });
            waitForQuery('#head-info-vm .upper-row .right-ctnr', node => { node.style.marginTop = '-7px'; });
            waitForQuery('#head-info-vm .lower-row', node => { node.style.marginTop = '0px'; });
            waitForQuery('#head-info-vm .lower-row .right-ctnr', node => { node.style.flex = '100 1 auto'; node.style.flexWrap = 'wrap'; node.style.placeContent = 'space-around center'; node.style.rowGap = '5px'; });

            waitForQuery('#head-info-vm .lower-row .pk-act-left-distance', node => { node.style.maxWidth = '3px'; }, 15000);
            waitForQuery('#head-info-vm .lower-row .act-left-distance', node => { node.style.maxWidth = '3px'; }, 15000);
            waitForQuery('#head-info-vm .lower-row .gift-planet-entry', node => { node.style.marginLeft = '5px'; }, 15000);
        }
    }

    waitForQuery('#head-info-vm .upper-row .right-ctnr', node => {
        const e = document.createElement("div");
        e.id = 'control-panel-showhide';
        e.className = "icon-ctnr live-skin-normal-a-text pointer";
        e.innerHTML = '<i class="v-middle icon-font icon-danmu-a" style="margin-left:16px; font-size:16px;"></i><span class="action-text v-middle" style="margin-left:8px; font-size:12px;"></span>';
        e.onclick = () => {
            setStoredValue('hide-seeker-control-panel', !getStoredBoolean('hide-seeker-control-panel'));
            updatePanelHideState();
        }
        node.appendChild(e);
        updatePanelHideState();
    }, 180*1000);


})();
