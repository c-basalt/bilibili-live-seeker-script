// ==UserScript==
// @name         Bilibili直播自动追帧
// @namespace    https://space.bilibili.com/521676
// @version      0.7.20
// @description  自动追帧bilibili直播至设定的buffer length
// @author       c_b
// @match        https://live.bilibili.com/*
// @icon         https://www.bilibili.com/favicon.ico
// @license      GPLv3 License
// @homepageURL  https://github.com/c-basalt/bilibili-live-seeker-script/
// @supportURL   https://github.com/c-basalt/bilibili-live-seeker-script/issues
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
        'hls-original': true,
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
    const booleanOrNull = value => (typeof value === 'boolean') ? value : null;
    /** @param {any} value * @returns {number|null} */
    const numberOrNull = value => (value !== null && !Number.isNaN(Number(value))) ? Number(value) : null;
    /** @param {any} value * @returns {string|null} */
    const stringOrNull = value => (typeof value === 'string') ? value : null;

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
            return (!Number.isNaN(room_id)) ? room_id : null;
        }
        if (!_getRoomId()) getRoomInit();
        try {
            return _getRoomId() || Number(location.href.match(/\/(\d+)/)[1]);
        } catch (e) {
            console.error('[bililive-seeker] Failed to get room id\n', e)
            return null;
        }
    };
    /** @returns {number|null} */
    const getUid = () => {
        const _getUid = () => {
            const uid = Number(W.__NEPTUNE_IS_MY_WAIFU__?.roomInitRes?.data?.uid || room_init_res_cache?.data?.uid);
            return (!Number.isNaN(uid)) ? uid : null;
        }
        if (!_getUid()) getRoomInit();
        try {
            return _getUid() || Number(location.href.match(/\/(\d+)/)[1]);
        } catch (e) {
            console.error('[bililive-seeker] Failed to get uid\n', e)
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
            const e = document.querySelector('.anchor-username');
            if (e) {
                e.style.lineHeight = 'normal';
                e.innerHTML = e.innerHTML.match(/^([^<]+)(<|$)/)[1] + '<span id="playback-rate-username">　@' + playback_rate + '</span>'
            }
        } else {
            usernameRate.innerText = '　@' + playback_rate;
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
            if (!v.buffered.length) return null; // 尚未开始缓冲
            const buffer_len = Number(v.buffered.end(v.buffered.length - 1) - v.currentTime);
            return (!Number.isNaN(buffer_len)) ? buffer_len : null;
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
    const formatPlayurlReq = (room_id) => `https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=${room_id}&protocol=0,1&format=0,1,2&codec=0,1&qn=0&platform=web&dolby=5&panorama=1`;

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

    /** @param {number} num * @returns {string} */
    const base36Encode = (num) => {
        let result = '';
        while (num > 0) {
            result = '0123456789abcdefghijklmnopqrstuvwxyz'[num % 36] + result;
            num = Math.floor(num / 36);
        }
        return result || '0';
    }

    /** @param {any} uid * @param {string} url */
    const isOriginalUrl = (uid, url) =>
        url.match(/\/live_\d+(?:_bs)?_\d+(?:_[0-9a-f]{8})?(?:\.flv|\/index\.m3u8)/)
        || url.match(new RegExp(`/live_${base36Encode(Number(uid))}_(?:[A-Za-z0-9]+_[a-z0-9]+|\\d+_[A-Za-z0-9]+_[0-9a-f]{8})(?:\\.flv|/index\\.m3u8)`));

    // ----------------------- HLS 原画（play-gateway master） -----------------------
    // 2026-11 起 getRoomPlayInfo 不再响应 qn=25000，但 play-gateway 的 master m3u8 在 qn=25000 时
    // 仍会给出「原画真彩」(BILI-QN=25000) 的未二压 HLS fMP4 流，且不需要登录

    /** @type {{ [room_id: string]: { ts: number, codecs: any[] } }} */
    const hlsOriginalCache = {};

    /** @param {number|string} room_id * @param {any} uid * @returns {any[]} codec 列表（可能为空） */
    const getHlsOriginalCodecs = (room_id, uid) => {
        const cached = hlsOriginalCache[room_id];
        if (cached && Date.now() - cached.ts < 5 * 60 * 1000) return cached.codecs;
        /** @type {any[]} */
        const codecs = [];
        try {
            const request = new XMLHttpRequest();
            request.open('GET', `https://api.live.bilibili.com/xlive/play-gateway/master/url?cid=${room_id}&mid=0&pt=web&p2p_type=-1&net=0&free_type=0&build=0&feature=2&qn=25000&drm_type=0&codec=0,1`, false);
            request.send(null);
            const text = request.status === 200 ? request.responseText : '';
            if (!text.startsWith('#EXTM3U')) {
                console.warn('[bililive-seeker] master m3u8 unavailable', request.status, text.slice(0, 100));
            } else {
                const lines = text.split('\n').map(l => l.trim());
                /** @type {{ info: string, url: URL }[]} */
                const variants = [];
                lines.forEach((line, i) => {
                    const next = lines[i + 1];
                    if (line.startsWith('#EXT-X-STREAM-INF:') && next && !next.startsWith('#')) {
                        variants.push({ info: line, url: new URL(next) });
                    }
                });
                // 一般原画标为 BILI-QN=25000「原画真彩」；但主播推 HEVC 等情况下，
                // 未二压的原画可能直接标为 BILI-QN=10000「原画」，此时按无后缀的原画文件名识别
                let selected = variants.filter(v => /BILI-QN=25000\b/.test(v.info));
                if (!selected.length) selected = variants.filter(v => isOriginalUrl(uid, v.url.pathname));
                /** @type {{ [name: string]: any }} */
                const byCodec = {};
                selected.forEach(({ info: line, url }) => {
                    const videoCodec = (line.match(/CODECS="([^",]+)/) || [])[1] || '';
                    const name = videoCodec.startsWith('hvc1') || videoCodec.startsWith('hev1') ? 'hevc' : videoCodec.startsWith('av01') ? 'av1' : 'avc';
                    if (!byCodec[name]) {
                        byCodec[name] = {
                            codec_name: name,
                            current_qn: 25000,
                            accept_qn: [25000],
                            base_url: url.pathname + '?',
                            url_info: [],
                            hdr_qn: null,
                            dolby_type: 0,
                            attr_name: '',
                            hdr_type: 0,
                            drm: false,
                            drm_key_systems: null,
                            video_codecs: { base: videoCodec, ext: [''] },
                            audio_codecs: { base: 'mp4a.40.2', ext: [''] },
                            video_color_info: { colorspace: 'bt709', metadata_types: ['none'] },
                        };
                        codecs.push(byCodec[name]);
                    }
                    if (byCodec[name].base_url === url.pathname + '?') {
                        byCodec[name].url_info.push({ host: url.origin, extra: url.search.slice(1), stream_ttl: 0 });
                    }
                });
            }
        } catch (e) {
            console.error('[bililive-seeker] failed to get master m3u8\n', e);
        }
        console.debug('[bililive-seeker] hls original codecs', codecs);
        hlsOriginalCache[room_id] = { ts: Date.now(), codecs };
        return codecs;
    }

    /** 浏览器是否能解码该 codec；没有编码信息时视为可播放 @param {any} codec * @returns {boolean} */
    const isCodecPlayable = (codec) => {
        const base = codec?.video_codecs?.base;
        if (!base) return true;
        try {
            const MS = W.MediaSource || W.ManagedMediaSource;
            return !MS || MS.isTypeSupported(`video/mp4; codecs="${base}"`);
        } catch (e) {
            return true;
        }
    }

    /**
     * 播放器右键「切换解码策略」允许的编码（与播放器逻辑一致：[av1, hevc, avc].slice(选中项)，7 天后失效）
     * @returns {string[]}
     */
    const getPlayerAllowedCodecs = () => {
        const all = ['av1', 'hevc', 'avc'];
        try {
            const uid = (document.cookie.match(/(?:^|;\s*)DedeUserID=(\d+)/) || [])[1] || '0';
            const config = JSON.parse(W.localStorage.getItem(`web-player-ui-config:${uid}`) || '{}');
            const { val, ts } = config.selectedCodec || {};
            if (!val || !all.includes(val) || Date.now() - Number(ts) > 6048e5) return all;
            return all.slice(all.indexOf(val));
        } catch (e) {
            return all;
        }
    }

    /**
     * 播放器右键「切换解码策略」排除了原画编码（如锁定 AVC 而原画是 HEVC）时，需要保留 AVC 兜底，
     * 否则播放器找不到流报 92006。不无条件保留：HLS 下有 AVC 时播放器会优先选 AVC 二压。
     * @param {any[]} codecs
     */
    const needAvcFallback = (codecs) => {
        if (codecs.some(codec => codec.codec_name === 'avc')) return false;
        const allowed = getPlayerAllowedCodecs();
        if (codecs.some(codec => allowed.includes(codec.codec_name))) return false;
        console.warn('[bililive-seeker] player codec strategy excludes original codec, keep avc fallback', allowed);
        return true;
    }

    /** @param {any} playurl * @returns {boolean} */
    const hasPlayableCodec = (playurl) => playurl.stream.some(
        stream => stream.format.some(format => format.codec.some(codec => isCodecPlayable(codec)))
    );

    /** @param {any} playurl * @param {any[]} codecs */
    const injectHlsOriginal = (playurl, codecs) => {
        // 合并原有 codec 的字段（session、media_info 等），并保留原有画质列表以便切换
        const template = {};
        playurl.stream.forEach(stream => stream.format.forEach(format => format.codec.forEach(codec => {
            if (!template[codec.codec_name]) template[codec.codec_name] = codec;
        })));
        const merged = codecs.map(codec => {
            const t = template[codec.codec_name] || template.avc || {};
            const acceptQn = [25000, ...(t.accept_qn || []).filter(qn => qn !== 25000)];
            return Object.assign({}, t, codec, { accept_qn: acceptQn, stream_resource_req: null });
        });
        // 原画不是 AVC 时，附上同协议（HLS fMP4）的 AVC 二压作为兜底，
        // 以免播放器右键「切换解码策略」锁定 AVC 时找不到流（92006）
        if (needAvcFallback(merged)) {
            playurl.stream.forEach(stream => {
                if (stream.protocol_name !== 'http_hls') return;
                stream.format.forEach(format => {
                    if (format.format_name !== 'fmp4') return;
                    const avc = format.codec.find(codec => codec.codec_name === 'avc');
                    if (avc && !merged.some(codec => codec.codec_name === 'avc')) merged.push(avc);
                });
            });
        }
        // 只保留 HLS fMP4 原画，并去掉 master_url，避免播放器无缝切换回二压流
        playurl.stream = [{ protocol_name: 'http_hls', format: [{ format_name: 'fmp4', codec: merged }] }];
    }

    /** @param {any} playurl */
    const ensureQn25000Desc = (playurl) => {
        if (!playurl.g_qn_desc) return;
        playurl.g_qn_desc = playurl.g_qn_desc.filter(desc => desc.qn !== 25000);
        playurl.g_qn_desc.splice(0, 0, {
            "qn": 25000,
            "desc": "原画真彩",
            "hdr_desc": "",
            "attr_desc": null,
            "hdr_type": 0,
            "media_base_desc": {
                "detail_desc": { "desc": "未二压的真原画" },
                "brief_desc": { "desc": "原画", "badge": "真彩" }
            },
            "eotf": 0
        });
    }

    /** @param {string|undefined} url * @returns {number|null} */
    const getRequestedQn = (url) => {
        try {
            if (!url) return null;
            const qn = new URL(url, location.href).searchParams.get('qn');
            return qn === null ? null : Number(qn);
        } catch (e) {
            return null;
        }
    }

    /** @param {any} uid * @param {any} playurl */
    const containsOriginal = (uid, playurl) => playurl.stream.some(
        stream => stream.format.some(format => format.codec.some(codec => isOriginalUrl(uid, codec.base_url)))
    );

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
                e.closest('.sk-chip')?.classList.toggle('sk-unavailable', !getStoredValue('playurl-' + room_id));
            } else {
                console.debug('[bililive-seeker] Failed to find force-raw element to update')
            }
        }, 200);
    }
    const checkPlayurlIntervalId = setInterval(() => { expiredPlayurlChecker() }, 600 * 1000);

    /** @param {any} r * @param {string} [reqUrl] 请求地址，用于判断请求的画质；初始数据没有地址 */
    const interceptPlayurl = (r, reqUrl) => {
        let playurl = r.data?.playurl_info?.playurl;
        let injectedHls = false;
        if (playurl?.stream) {
            const hasOriginal = containsOriginal(r.data.uid, playurl);
            if (hasOriginal) {
                console.debug('[bililive-seeker] caching raw stream url');
                setStoredValue('playurl-' + playurl.cid, playurl);
            } else {
                playurl.stream.forEach(stream => stream.format.forEach(format => format.codec.forEach(codec => {
                    if (!codec.accept_qn.includes(25000)) {
                        codec.accept_qn.splice(0, 0, 25000);
                    }
                })));
                ensureQn25000Desc(playurl);
            }
            console.debug('[bililive-seeker] got playinfo', r);
            let usedCache = false;
            if (isChecked('force-raw', true)) {
                expiredPlayurlChecker();
                const cachedUrl = getStoredValue('playurl-' + playurl.cid);
                console.debug('[bililive-seeker] load cached url', cachedUrl);
                if (cachedUrl) {
                    playurl = r.data.playurl_info.playurl = cachedUrl;
                    usedCache = true;
                }
            }
            // 优先级：响应自带的原画 / 缓存的原画 FLV > HLS 原画 > 二压
            const requestedQn = getRequestedQn(reqUrl) ?? (isChecked('auto-quality', true) ? 25000 : 0);
            if (!hasOriginal && !usedCache && requestedQn === 25000 && isChecked('hls-original', true)) {
                const allCodecs = getHlsOriginalCodecs(playurl.cid || r.data.room_id, r.data.uid);
                const codecs = allCodecs.filter(codec => isCodecPlayable(codec));
                if (allCodecs.length && !codecs.length) {
                    console.warn('[bililive-seeker] browser cannot decode hls original, skip', allCodecs.map(c => c.video_codecs.base));
                }
                if (codecs.length) {
                    injectHlsOriginal(playurl, codecs);
                    injectedHls = true;
                    console.debug('[bililive-seeker] injected hls original', playurl.stream);
                }
            }
            if (isChecked('force-flv', true) && !injectedHls) {
                const unfilteredStream = JSON.parse(JSON.stringify(playurl.stream));
                const filteredStream = playurl.stream.filter(i => i.protocol_name !== "http_hls");
                if (filteredStream.length && hasPlayableCodec({ stream: filteredStream })) playurl.stream = filteredStream;
                playurl.stream.forEach(stream => stream.format.forEach(format => {
                    // 只保留浏览器能解码的原画编码；原画不是 AVC 时保留 AVC 作为兜底，
                    // 否则在播放器右键「切换解码策略」选了 AVC 时会因找不到流而报 92006
                    const filteredCodec = format.codec.filter(codec => isOriginalUrl(r.data.uid, codec.base_url) && isCodecPlayable(codec));
                    if (filteredCodec.length) {
                        if (needAvcFallback(filteredCodec)) {
                            filteredCodec.push(...format.codec.filter(codec => codec.codec_name === 'avc'));
                        }
                        format.codec = filteredCodec;
                    }
                }));
                if (!hasPlayableCodec(playurl)) {
                    console.warn('[bililive-seeker] force-flv left no playable codec, revert', playurl.stream);
                    playurl.stream = unfilteredStream;
                }
                console.debug('[bililive-seeker] filter video formats', r.data?.playurl_info?.playurl?.stream);
            }
        }
        if (isChecked('block-roundplay', true) && r.data?.live_status === 2) {
            r.data.live_status = 0;
        }
        return r;
    }

    /** @param {string} url * @returns {string} */
    const replaceRoomplayReqUrl = (url) => {
        if (isChecked('auto-quality', true)) {
            url = url.replace(/qn=0\b/, 'qn=25000');
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
                let url = (resource instanceof Request) ? resource.url : resource.toString();
                if (url.match('api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo')) {
                    url = replaceRoomplayReqUrl(url);
                    arguments[0] = (resource instanceof Request) ? new Request(url, resource) : url;
                    // since this should only be GET request
                    console.debug('[bililive-seeker] modified roomPlayInfo fetch request', arguments);
                    const response = await origFetch.apply(this, arguments);
                    const r = interceptPlayurl(await response.clone().json(), url);
                    console.debug('[bililive-seeker] modified roomPlayInfo fetch response', r);
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
                        return JSON.stringify(interceptPlayurl(rsp, this.responseURL));
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

    const hookPlayer = async (player) => {
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
            for (let i = 0; i < 3; i++) {
                const info = player.getPlayerInfo();
                const maxQuality = Math.max(...info.qualityCandidates.map(i => Number(i.qn)));
                // info.playurl might be empty string during loading
                const isOriginal = isOriginalUrl(getUid(), info.playurl || `/${info.streamName}.flv`);

                if (Number(info.quality) < maxQuality || (!isOriginal && Number(info.quality) < 25000)) {
                    console.debug('[bililive-seeker] switching to highest quality', maxQuality);
                    player.switchQuality(maxQuality.toString());
                    await asyncSleep(1000);
                } else {
                    console.debug('[bililive-seeker] keep current quality', info.quality, info.playurl || `/${info.streamName}.flv`);
                    break;
                }
            }
        } else if (getStoredBoolean('force-flv') && player.getPlayerInfo().playurl.match('.m3u8') && !isOriginalUrl(getUid(), player.getPlayerInfo().playurl)) {
            console.debug('[bililive-seeker] reload player to try getting flv format');
            player.reload();
        }
    };

    const waitForPlayer = async () => {
        for (let i = 0; i < 120; i++) {
            if (W.livePlayer) {
                hookPlayer(W.livePlayer);
                return;
            }
            await asyncSleep(500);
        }
    };
    waitForPlayer();

    try {
        let __init_data_neptune = W.__NEPTUNE_IS_MY_WAIFU__ || {};
        Object.defineProperty(W, '__NEPTUNE_IS_MY_WAIFU__', {
            get: function () { return __init_data_neptune },
            set: function (init_data) {
                __init_data_neptune = init_data;
                if (init_data?.roomInitRes) {
                    init_data.roomInitRes = interceptPlayurl(init_data.roomInitRes);
                }
                console.debug('[bililive-seeker] init data', __init_data_neptune);
                const stream = init_data?.roomInitRes?.data?.playurl_info?.playurl?.stream;
                if (stream?.length && getStoredBoolean('auto-quality')) {
                    const codec = stream[0].format[0].codec[0];
                    if (codec.current_qn < Math.max(...codec.accept_qn, 10000)) {
                        room_init_res_cache = init_data.roomInitRes;
                        console.debug('[bililive-seeker] dropping non-original quality', codec.current_qn);
                        init_data.roomInitRes = null;
                    } else {
                        console.debug('[bililive-seeker] keeping init with quality', codec.current_qn);
                    }
                }
            },
            configurable: true,
        });
        if (__init_data_neptune?.roomInitRes) W.__NEPTUNE_IS_MY_WAIFU__ = __init_data_neptune;
    } catch (e) {
        console.error('[bililive-seeker] Failed to hook `__NEPTUNE_IS_MY_WAIFU__`, possibly due to effect of another script. auto-quality and force-flv may not work as intended:\n', e);
    }


    // ----------------------- 选项UI -----------------------

    /** @param {() => HTMLElement|null} checker * @param {number} timeout */
    const waitForElement = async (checker, timeout) => {
        while (timeout > 0) {
            const node = checker();
            if (node) return node;
            await asyncSleep(100);
            timeout -= 100;
        }
        throw new Error("element not found");
    }

    /** @param {string} query * @param {(node: HTMLElement) => void} exec * @param {number} timeout=10000 */
    const waitForQuery = (query, exec, timeout = 10000) => {
        waitForElement(() => document.querySelector(query), timeout).then(exec).catch(() => {
            console.error(`[bililive-seeker] Failed to find element "${query}" timeout=${timeout}ms`);
        })
    }

    /** @param {HTMLElement|Element|null} node */
    const parseStyleScope = (node) => {
        if (!node) return '';
        return Array.prototype.slice.call(node.attributes).map(i => i.nodeName).filter(i => i.match(/^data-/)).join(' ');
    }

    /** @param {string} query * @param {Document|HTMLElement} root * @returns {HTMLElement[]} */
    const queryAllElements = (query, root = document) => {
        return Array.prototype.slice.call(root.querySelectorAll(query))
    }

    waitForQuery('#head-info-vm', node => {
        setTimeout(() => {
            if (document.querySelector('#head-info-vm .header-right')) {
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
            waitForQuery('#head-info-vm .header-right', _ => {
                console.log('[bililive-seeker] Removing reset button');
                document.querySelector('#reset-seeker-configs-fallback')?.parentElement.remove();
            }, 180 * 1000);
        }, 3000);
    });

    // 面板作为 .header-center 的第一个子元素: .header-center 右对齐，面板在人气榜等模块左边，隐藏面板时右侧模块不会移动
    const PANEL_MOUNT_QUERY = '#head-info-vm .header-center';
    /** @param {HTMLElement} mount * @param {HTMLElement} panel */
    const mountControlPanel = (mount, panel) => {
        panel.style.margin = '0 4px 0 8px';
        mount.insertBefore(panel, mount.firstChild);
    };

    waitForQuery(PANEL_MOUNT_QUERY, node => {
        const controlPanel = document.createElement("span");
        const BR = '&#13;&#10;';
        controlPanel.innerHTML = (
            '<span id="basic-settings-page" class="sk-page">' +
            '<span class="sk-row">' +
            '<span class="sk-group" title="重新从当前的位置开始播放直播来重置音视频的同步，以应对音视频的不同步' + BR + '重置时会有一瞬的卡顿' + BR + '勾选“定时”后自动每隔一段时间执行一次重置，重置间隔可以在高级选项中设置">' +
            '<button id="reset-AV-sync" type="button" class="sk-btn">重置音画同步</button>' +
            '<span class="sk-chip"><input type="checkbox" id="auto-AV-sync"><label for="auto-AV-sync">定时</label></span>' +
            '</span>' +
            '<span class="sk-chip" title="隐藏播放器右键菜单中的“视频统计信息”悬浮窗' + BR + '悬浮窗未开启时会自动取消勾选"><input type="checkbox" id="hide-stats"><label for="hide-stats">隐藏统计</label></span>' +
            '<span class="sk-chip" title="当检测到播放器暂停，且缓冲长度超过“追帧秒数”时，自动恢复播放器播放"><input type="checkbox" id="prevent-pause"><label for="prevent-pause">避免暂停</label></span>' +
            '<span class="sk-chip" title="直播状态下，检测到错误时自动刷新页面' + BR + '或在下播状态下，弹幕服务器疑似断连时，自动刷新页面' + BR + '刷新页面前文字会变为橙色"><input type="checkbox" id="auto-reload"><label for="auto-reload">自动刷新</label></span>' +
            '<span class="sk-field" title="本地播放器追帧的目标缓冲长度，单位为秒（播放器缓冲的长度1：1等于播放器产生的延迟）' + BR + '过小容易导致卡顿甚至丢失原画的连接' + BR + '需根据自己的网络情况选择合适的值' + BR + '可在高级选项中关闭追帧"><label for="buffer-threshold">追帧秒数</label><input type="number" id="buffer-threshold" step="0.1"></span>' +
            '</span>' +
            '<span class="sk-row">' +
            '<a id="go-to-blanc-room" class="sk-btn" style="display: none" target="_parent" title="跳转至非活动页面的常规直播间">转至常规直播间</a>' +
            '<span class="sk-chip" title="尝试去除视频流中的HLS流，让播放器优先使用FLV协议，' + BR + '并在检测到原画时只保留原画对应的编码类型，以降低延迟"><input type="checkbox" id="force-flv"><label for="force-flv">强制flv+原编码</label></span>' +
            '<span class="sk-chip sk-unavailable" title="当获取的直播视频流为延迟更高的二压视频时，尝试替换为保存的原画流，以降低延迟' + BR + '当前直播间没有保存原画流/原画流已过期时，选项为虚线灰色' + BR + '主播网络卡顿/重开推流后可能出现一直重复最后几秒的情况，需取消该选项后切换一次画质或刷新"><input type="checkbox" id="force-raw"><label for="force-raw">强制原画</label></span>' +
            '<span class="sk-chip" title="进入直播间时自动切换右下角的“原画”画质。和手动切换效果相同"><input type="checkbox" id="auto-quality"><label for="auto-quality">自动原画</label></span>' +
            '<span class="sk-chip" title="阻止直播间进行轮播"><input type="checkbox" id="block-roundplay"><label for="block-roundplay">阻止轮播</label></span>' +
            '<span class="sk-chip" title="选择“原画真彩”画质且没有可用的原画FLV时，改用play-gateway提供的未二压HLS(fMP4)原画流' + BR + '画质高于二压的“原画”，但HLS协议的延迟可能与二压FLV不同，可自行对比取舍"><input type="checkbox" id="hls-original"><label for="hls-original">HLS原画</label></span>' +
            '<button id="go-to-adv-settings" type="button" class="sk-btn sk-nav" title="转到高级选项">高级 ›</button>' +
            '</span>' +
            '</span>' +

            '<span id="adv-settings-page" class="sk-page" style="display:none">' +
            '<span class="sk-row">' +
            '<button id="reset-seeker-configs" type="button" class="sk-btn sk-warn" title="清空重置追帧脚本的所有配置（包括缓存的原画链接）并立刻刷新页面">重置配置</button>' +
            '<button id="copy-playurl" type="button" class="sk-btn" title="复制当前直播间保存的原画流链接到剪贴板，可用于“设置链接”">复制推流链接</button>' +
            '<button id="set-playurl" type="button" class="sk-btn sk-warn" title="手动设置当前直播间保存的原画流链接，用于“强制原画”选项让播放器加载延迟更低的原画流' + BR + '错误的配置可能导致无法正常观看直播！">设置链接</button>' +
            '<button id="set-endpoint" type="button" class="sk-btn sk-warn" title="设置获取视频流链接的API，详见说明中的链接' + BR + '使用后可能无法观看各种限定直播！' + BR + '错误的配置可能导致无法正常观看直播！">设置视频流API</button>' +
            '<button id="go-to-basic-settings" type="button" class="sk-btn sk-nav" title="返回基础选项">‹ 返回</button>' +
            '</span>' +
            '<span class="sk-row">' +
            '<span class="sk-group" title="设置缓冲时长超过追帧秒数时，缓冲长度和追帧秒数的差值的各级阶梯阈值，以及各级阶梯要加快到的播放速度' + BR + '错误的配置可能导致播放不正常！' + BR + '取消勾选“追帧加速”后将不会在缓冲时长超过追帧秒数时自动加速追帧">' +
            '<button id="set-speedup-thres" type="button" class="sk-btn sk-warn">加速阈值</button>' +
            '<span class="sk-chip"><input type="checkbox" id="auto-speedup" checked><label for="auto-speedup">追帧加速</label></span>' +
            '</span>' +
            '<span class="sk-group" title="设置缓冲时长极低时，降低播放速度的各级阶梯的缓冲时长阈值，以及各级阶梯要降低到的播放速度' + BR + '错误的配置可能导致播放不正常！' + BR + '取消勾选“自动减速”后将不会在缓冲时长降低至减速阈值后自动降低播放速度">' +
            '<button id="set-slowdown-thres" type="button" class="sk-btn sk-warn">减速阈值</button>' +
            '<span class="sk-chip"><input type="checkbox" id="auto-slowdown" checked><label for="auto-slowdown">自动减速</label></span>' +
            '</span>' +
            '<span class="sk-field" title="重置音画同步时，重新开始位置相对现在的秒数' + BR + '合适的值可以减轻重置时的卡顿感"><label for="AV-resync-step">重置步进</label><input type="number" id="AV-resync-step" step="0.01"></span>' +
            '<span class="sk-field" title="勾选“重置音画同步”的“定时”后，自动进行音画同步重置的间隔时长，单位为秒"><label for="AV-resync-interval">间隔</label><input type="number" id="AV-resync-interval" step="1" min="1"></span>' +
            '</span>' +
            '</span>' +

            '<style>' +
            '#seeker-control-panel { --sk-accent: #0b85c8; --sk-warn: #f0a020; --sk-line: color-mix(in srgb, currentColor 26%, transparent); --sk-line-hover: color-mix(in srgb, currentColor 55%, transparent); --sk-fill: color-mix(in srgb, currentColor 7%, transparent); display: flex; flex-direction: column; justify-content: center; font-size: 11px; line-height: 1; }' +
            '#head-info-vm .header-center:has(> #seeker-control-panel) { justify-content: safe flex-end; flex: 1 1 0; min-width: 0; }' +
            '#seeker-control-panel.sk-floating { position: fixed; inset: auto; margin: 0 !important; padding: 10px 12px; width: max-content; height: auto; overflow: visible; border: 1px solid rgba(255, 255, 255, .1); border-radius: 12px; background: rgba(28, 29, 33, .96); color: #e8e8e8 !important; box-shadow: 0 10px 30px rgba(0, 0, 0, .35); z-index: 2147483000; }' +
            '#seeker-control-panel.sk-floating:not(.sk-open) { display: none !important; }' +
            '#seeker-control-panel.sk-floating :is(label, .sk-btn) { color: #e8e8e8 !important; }' +
            ':where(#control-panel-showhide) { appearance: none; background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer; }' +
            '#seeker-control-panel .sk-page { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }' +
            '#seeker-control-panel .sk-row { display: flex; flex-wrap: nowrap; justify-content: flex-end; align-items: center; gap: 4px; }' +
            '#seeker-control-panel .sk-group { display: inline-flex; }' +
            '#seeker-control-panel .sk-group > :first-child { border-start-end-radius: 0; border-end-end-radius: 0; }' +
            '#seeker-control-panel .sk-group > :last-child { border-start-start-radius: 0; border-end-start-radius: 0; margin-inline-start: -1px; }' +
            '#seeker-control-panel :is(.sk-chip, .sk-btn, .sk-field) { box-sizing: border-box; display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 8px; border: 1px solid var(--sk-line); border-radius: 10px; color: inherit; background: transparent; font: inherit; white-space: nowrap; text-decoration: none; transition: border-color .15s, background-color .15s, color .15s; }' +
            '#seeker-control-panel :is(.sk-chip, .sk-btn) { cursor: pointer; }' +
            '#seeker-control-panel :is(.sk-chip, .sk-btn, .sk-field):hover { border-color: var(--sk-line-hover); }' +
            '#seeker-control-panel .sk-btn { background: var(--sk-fill); }' +
            '#seeker-control-panel .sk-btn:active { transform: translateY(0.5px); }' +
            '#seeker-control-panel .sk-btn:focus-visible, #seeker-control-panel .sk-field input:focus-visible { outline: 2px solid var(--sk-accent); outline-offset: 1px; }' +
            '#seeker-control-panel .sk-nav { padding: 0 9px; }' +
            '#seeker-control-panel .sk-warn { border-color: color-mix(in srgb, var(--sk-warn) 55%, transparent); }' +
            '#seeker-control-panel .sk-warn:hover { border-color: var(--sk-warn); color: var(--sk-warn) !important; }' +
            '#seeker-control-panel label { margin: 0; color: inherit; cursor: inherit; }' +
            '#seeker-control-panel .sk-chip { padding-inline-start: 5px; }' +
            '#seeker-control-panel .sk-chip input { appearance: none; box-sizing: border-box; display: inline-grid; place-content: center; flex: none; width: 11px; height: 11px; margin: 0; border: 1.5px solid color-mix(in srgb, currentColor 55%, transparent); border-radius: 50%; cursor: pointer; }' +
            '#seeker-control-panel .sk-chip input::before { content: ""; width: 7px; height: 7px; background: currentColor; mask: url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'black\' stroke-width=\'4\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><polyline points=\'20 6 9 17 4 12\'/></svg>") no-repeat center / contain; scale: 0; transition: scale .15s ease; }' +
            '#seeker-control-panel .sk-chip input:focus-visible { outline: 2px solid var(--sk-accent); outline-offset: 2px; }' +
            '#seeker-control-panel .sk-chip:has(input:checked) { background: var(--sk-accent); border-color: var(--sk-accent); color: #fff !important; }' +
            '#seeker-control-panel .sk-chip:has(input:checked) label { color: #fff !important; }' +
            '#seeker-control-panel .sk-chip input:checked { border-color: #fff; background: #fff; color: var(--sk-accent); }' +
            '#seeker-control-panel .sk-chip input:checked::before { scale: 1; }' +
            '#seeker-control-panel .sk-chip.sk-unavailable { border-style: dashed; opacity: .5; }' +
            '#seeker-control-panel .sk-chip.sk-unavailable:has(input:checked) { background: transparent; border-color: var(--sk-accent); color: inherit !important; }' +
            '#seeker-control-panel .sk-chip.sk-unavailable:has(input:checked) label { color: inherit !important; }' +
            '#seeker-control-panel .sk-chip.sk-unavailable input:checked { border-color: var(--sk-accent); background: var(--sk-accent); color: #fff; }' +
            '#seeker-control-panel .sk-field { padding-inline-end: 3px; }' +
            '#seeker-control-panel .sk-field input::-webkit-inner-spin-button, #seeker-control-panel .sk-field input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }' +
            '#seeker-control-panel .sk-field input { appearance: textfield; box-sizing: border-box; width: 3.6em; height: 14px; padding: 0 2px; border: none; border-radius: 7px; background: var(--sk-fill); color: inherit; font: inherit; text-align: center; }' +
            '#seeker-control-panel .sk-chip.sk-chip:has(label:is(.danmaku-lost, .live-on, .video-error, .reload)) { border-color: var(--sk-warn); background: var(--sk-warn); }' +
            '#seeker-control-panel .sk-chip label:is(.danmaku-lost, .live-on, .video-error, .reload) { color: #fff !important; }' +
            '#seeker-control-panel .sk-chip.sk-chip:has(label:is(.danmaku-lost, .live-on, .video-error, .reload)):not(:has(input:checked)) label { color: var(--sk-warn) !important; }' +
            '@media (max-width: 1440px) { #seeker-control-panel .sk-row { gap: 3px; } #seeker-control-panel :is(.sk-chip, .sk-btn, .sk-field) { padding: 0 6px; } #seeker-control-panel .sk-chip { padding-inline-start: 4px; } #seeker-control-panel .sk-field { padding-inline-end: 3px; } }' +
            '@media (prefers-reduced-motion: reduce) { #seeker-control-panel * { transition: none !important; } }' +
            '</style>'
        );
        controlPanel.style.cssText = 'flex: 0 0 auto; z-index: 999;';
        controlPanel.classList.add('live-skin-normal-a-text');
        controlPanel.id = 'seeker-control-panel';
        mountControlPanel(node, controlPanel);
        controlPanel.addEventListener('beforetoggle', (/** @type {any} */ ev) => {
            if (ev.newState === 'open') positionFloatingPanel(controlPanel);
            controlPanel.classList.toggle('sk-open', ev.newState === 'open');
        });
        document.addEventListener('pointerdown', ev => {
            if (supportsPopover || !panelFloating || !controlPanel.classList.contains('sk-open')) return;
            const btn = document.querySelector('#control-panel-showhide');
            const t = /** @type {Node} */ (ev.target);
            if (!controlPanel.contains(t) && !btn?.contains(t)) controlPanel.classList.remove('sk-open');
        });
        // 页面组件重新渲染时可能移除面板，检测到后重新挂载
        setInterval(() => {
            if (controlPanel.isConnected) return;
            const mount = document.querySelector(PANEL_MOUNT_QUERY);
            if (mount) mountControlPanel(mount, controlPanel);
        }, 2000);

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
                node.style.display = "";
                node.href = location.href;
            });
        }

        expiredPlayurlChecker();
    }, 180 * 1000);

    // ----------------------- 显示折叠UI -----------------------


    // 头部空间不足以横排显示面板时，改为点击「追帧设置」弹出的浮层
    const supportsPopover = typeof HTMLElement.prototype.showPopover === 'function';
    let panelFloating = false;

    /** @param {HTMLElement} panel */
    const positionFloatingPanel = (panel) => {
        const head = document.querySelector('#head-info-vm');
        if (!head) return;
        const r = head.getBoundingClientRect();
        panel.style.top = Math.round(r.bottom + 6) + 'px';
        panel.style.right = Math.max(8, Math.round(window.innerWidth - r.right + 8)) + 'px';
        panel.style.left = 'auto';
    };

    /** @param {HTMLElement} panel * @param {boolean} on */
    const setPanelFloating = (panel, on) => {
        if (panelFloating === on) return;
        panelFloating = on;
        const btn = /** @type {HTMLButtonElement|null} */ (document.querySelector('#control-panel-showhide'));
        panel.classList.toggle('sk-floating', on);
        if (on) {
            panel.classList.remove('sk-open');
            if (supportsPopover) {
                panel.popover = 'auto';
                if (btn) btn.popoverTargetElement = panel;
            }
        } else {
            if (supportsPopover) {
                if (panel.matches(':popover-open')) panel.hidePopover();
                panel.removeAttribute('popover');
                if (btn) btn.popoverTargetElement = null;
            }
            panel.classList.remove('sk-open');
            panel.style.top = panel.style.right = panel.style.left = '';
        }
        updatePanelHideState();
    };

    const updatePanelLayout = () => {
        const panel = /** @type {HTMLElement|null} */ (document.querySelector('#seeker-control-panel'));
        const host = panel?.parentElement;
        if (!panel || !host) return;
        if (!host.classList.contains('header-center')) { setPanelFloating(panel, false); return; }
        const rows = queryAllElements('.sk-page', panel).filter(p => p.style.display !== 'none').flatMap(p => queryAllElements('.sk-row', p));
        const measured = Math.max(0, ...rows.map(r => r.scrollWidth));
        if (measured > 0) panel.dataset.needWidth = String(measured + 12);
        const need = Number(panel.dataset.needWidth || 0);
        if (!need) return; // 面板隐藏中且从未测量过
        const others = queryAllElements(':scope > *', host).filter(e => e !== panel).reduce((sum, e) => sum + e.getBoundingClientRect().width + 4, 0);
        const avail = host.clientWidth - others;
        if (!panelFloating && need > avail) setPanelFloating(panel, true);
        else if (panelFloating && need <= avail - 8) setPanelFloating(panel, false);
    };
    setInterval(updatePanelLayout, 1000);
    window.addEventListener('resize', () => updatePanelLayout());

    const updatePanelHideState = () => {
        if (panelFloating) {
            waitForQuery('#seeker-control-panel', node => { node.style.display = ''; });
            waitForQuery('#control-panel-showhide span', node => { node.innerText = '追帧设置'; });
            return;
        }
        if (getStoredBoolean('hide-seeker-control-panel')) {
            waitForQuery('#seeker-control-panel', node => { node.style.display = 'none'; });
            waitForQuery('#control-panel-showhide span', node => { node.innerText = '显示追帧'; });
        } else {
            waitForQuery('#seeker-control-panel', node => { node.style.display = ''; });
            waitForQuery('#control-panel-showhide span', node => { node.innerText = '隐藏追帧'; });
        }
    }

    const SHOWHIDE_MOUNT_QUERY = '#head-info-vm .header-right .more-setting';
    /** @param {HTMLElement} mount * @param {HTMLElement} wrapper */
    const mountShowHideButton = (mount, wrapper) => {
        mount.insertBefore(wrapper, mount.children[0]);
        mount.style.cssText = 'display: flex; flex-direction: row; gap: 3px';
    };

    waitForQuery(SHOWHIDE_MOUNT_QUERY, node => {
        const wrapper = document.createElement('span');
        const scope = parseStyleScope(node.querySelector('.more-entry.live-skin-normal-a-text'));
        wrapper.innerHTML = `<button type="button" ${scope} id="control-panel-showhide" class="more-entry live-skin-normal-a-text pointer">
            <i ${scope} class="v-middle icon-font icon-danmu-a" style="height: 18px; opacity: 0.6; transform: translateY(2px);"></i>
            <span ${scope} class="more-text v-middle"></span></button>`;
        const e = /** @type {HTMLButtonElement} */ (wrapper.firstElementChild);
        e.onclick = () => {
            if (panelFloating) {
                // 支持 popover 时由 popoverTargetElement 原生切换；否则手动切换
                if (!supportsPopover) {
                    const panel = document.querySelector('#seeker-control-panel');
                    if (panel) { positionFloatingPanel(panel); panel.classList.toggle('sk-open'); }
                }
                return;
            }
            setStoredValue('hide-seeker-control-panel', !getStoredBoolean('hide-seeker-control-panel'));
            updatePanelHideState();
            setTimeout(updatePanelLayout, 50);
        }
        if (panelFloating && supportsPopover) e.popoverTargetElement = document.querySelector('#seeker-control-panel');
        mountShowHideButton(node, wrapper);
        setInterval(() => {
            if (wrapper.isConnected) return;
            const mount = document.querySelector(SHOWHIDE_MOUNT_QUERY);
            if (mount) mountShowHideButton(mount, wrapper);
        }, 2000);
        updatePanelHideState();
    }, 180 * 1000);

})();
