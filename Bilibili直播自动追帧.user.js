// ==UserScript==
// @name         Bilibili直播自动追帧
// @namespace    https://space.bilibili.com/521676
// @version      0.6.10
// @description  自动追帧bilibili直播至设定的buffer length
// @author       c_b
// @match        https://live.bilibili.com/*
// @icon         https://www.bilibili.com/favicon.ico
// @license      GPLv3 License
// @homepageURL  https://github.com/c-basalt/bilibili-live-seeker-script/
// @supportURL   https://space.bilibili.com/521676
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    if (!location.href.match(/https:\/\/live\.bilibili\.com\/(blanc\/)?\d+/)) return;
    // 仅对直播间生效

    // ----------------------- 播放器追帧 -----------------------

    const getVideoElement = () => {
        const e = document.getElementsByTagName('video')[0]
        window.videoElement = e || window.videoElement;
        return window.videoElement;
    }

    const updatePlaybackRateDisplay = () => {
        const v = getVideoElement();
        if (!v) {
            setTimeout(updatePlaybackRateDisplay, 100);
        } else {
            const usernameRate = document.querySelector('#playback-rate-username');
            if (!usernameRate) {
                const e = document.querySelector('.room-owner-username');
                e.style.lineHeight = 'normal';
                e.innerHTML = e.innerHTML.match(/^([^<]+)(<|$)/)[1] + '<span id="playback-rate-username">　@' + v.playbackRate.toFixed(2) + '</span>'
            } else {
                usernameRate.innerText = '　@' + v.playbackRate.toFixed(2);
            }
            const titleRate = document.querySelector('#playback-rate-title');
            if (!titleRate) {
                const e2 = document.querySelector('.live-title .text');
                e2.innerHTML = e2.innerHTML.match(/^([^<]+)(<|$)/)[1] + '<br><span id="playback-rate-title" style="display:none">@' + v.playbackRate.toFixed(2) + '</span>'
            } else {
                titleRate.innerText = '@' + v.playbackRate.toFixed(2);
            }
        }
    }

    window.setRate = function (rate) {
        const e = getVideoElement()
        if (!e) return
        if (e.playbackRate.toFixed(2) == Number(rate).toFixed(2)) return;
        e.playbackRate = Number(rate).toFixed(2);
        updatePlaybackRateDisplay();
    }
    window.resetRate = function () {
        window.setRate(1);
    }

    const statsBuffLen = () => {
        const e = document.querySelector('#p-video-info-bufferLength');
        if (!e) return null;
        if (document.querySelector('.web-player-video-info-panel').style.display === 'none') return null;
        const match = e.innerText.match(/Buffer Length:\s*([\d\.]+)s/);
        if (!match) return null;
        return Number(match[1]);
    }

    const videoBuffLen = () => {
        const e = getVideoElement();
        if (!e) return null;
        return e.buffered.end(0) - e.currentTime
    }

    window.bufferlen = function() {
        const statsLen = statsBuffLen()
        const videoLen = videoBuffLen()
        if (statsLen && videoLen) {
            if (Math.abs(statsLen - videoLen) > 2) {
                return statsLen;
            } else {
                return videoLen
            }
        }
        return videoLen || statsLen;
    }

    const getThres = () => {
        const thresNew = getValue('buffer-threshold');
        const thresOld = _getThres();
        if (thresNew !== thresOld) console.debug('different thresholds', thresNew, thresOld);
        return thresOld;
    }

    const _getThres = () => {
        const e = document.querySelector('#buffer-threshold');
        if (!e) return null
        const value = Number(e.value)
        if (!value) return null
        return value;
    }

    const speedupThres = [
        [2, 1.3],
        [1, 1.2],
        [0, 1.1]
    ]
    const adjustSpeedup = () => {
        const thres = getThres()
        if (!thres) return;
        try {
            if (!isLiveStream()) return;
            const bufferLen = window.bufferlen()
            if (bufferLen === null) return;
            let diffThres, rate;
            for (let i = 0; i < speedupThres.length; i++) {
                [diffThres, rate] = speedupThres[i];
                if (bufferLen - thres > diffThres) {
                    window.setRate(rate);
                    return;
                }
            }
            if (getVideoElement()?.playbackRate > 1) window.resetRate();
        } catch(e) {
            console.error(e)
        }
    }

    const speeddownThres = [
        [0.2, 0.1],
        [0.3, 0.3],
        [0.6, 0.6]
    ]
    const adjustSpeeddown = () => {
        try {
            if (!isLiveStream()) return;
            const bufferLen = window.bufferlen()
            if (bufferLen === null) return;
            let thres, rate;
            for (let i = 0; i < speeddownThres.length; i++) {
                [thres, rate] = speeddownThres[i];
                if (bufferLen < thres) {
                    window.setRate(rate);
                    return;
                }
            }
            if (getVideoElement()?.playbackRate < 1) window.resetRate();
        } catch(e) {
            console.error(e)
        }
    }
    window.speedUpIntervalId = setInterval(()=>{adjustSpeedup()}, 1000)
    window.speedDownIntervalId = setInterval(()=>{adjustSpeeddown()}, 50)


    // ----------------------- 获取参数 -----------------------

    const getStoredValue = (key) => {
        const defaultValues = {
            'hide-stats': false,
            'auto-reload': true,
            'force-flv': true,
            'prevent-pause': false,
            'force-raw': false,
            'auto-quality': true,
            'block-roundplay': false,
            'buffer-threshold': 1.5,
            'AV-resync-step': 0.05,
            'AV-resync-interval': 300,
        };
        try {
            const value = JSON.parse(localStorage.getItem(key));
            if (value !== null) return value;
            return defaultValues[key];
        } catch {
            return defaultValues[key];
        }
    }
    const isChecked = (key, fallback) => {
        const e = document.querySelector('#'+key);
        if (e && (typeof e?.checked === 'boolean')) return e.checked;
        if (fallback) return getStoredValue(key);
        return null;
    }
    const getValue = (key, fallback) => {
        const e = document.querySelector('#'+key);
        const value = Number(e?.value);
        if (!Number.isNaN(value)) return value;
        if (fallback) return getStoredValue(key);
        return null;
    }
    /*const isLiveStream = () => {
        const ret = _isLiveStream();
        console.log('live status', ret);
        return ret;
    }*/
    const isLiveStream = () => {
        if (document.querySelector('.web-player-round-title')?.innerText) return false; // 轮播
        if (document.querySelector('.web-player-ending-panel')?.innerText) return false; // 闲置或轮播阻断
        const e = document.querySelector('video');
        if (!e) return undefined; // 网页加载
        return true; // 直播
    }
    const getRoomId = () => {
        if (!window.__NEPTUNE_IS_MY_WAIFU__?.roomInitRes?.data?.room_id) getRoomInit();
        return window.__NEPTUNE_IS_MY_WAIFU__?.roomInitRes?.data?.room_id || Number(location.href.match(/\/(\d+)/)[1]);
    }


    // ----------------------- 音画同步重置 -----------------------

    window.AVResync = () => {
        console.debug("enforce AV sync")
        const v = getVideoElement();
        const step = getValue('AV-resync-step', true);
        if (!v || step === null) return;
        v.currentTime = v.currentTime + step;
    }
    const stopAutoResync = () => {
        clearInterval(window.AVResyncIntervalId);
    }
    const startAutoResync = () => {
        console.debug("start AV sync interval")
        stopAutoResync();
        window.AVResyncIntervalId = setInterval(()=>{ window.AVResync() }, getValue("AV-resync-interval", true)*1000);
    }


    // ----------------------- 项目检查循环 -----------------------

    const checkPaused = () => {
        if (!isChecked('prevent-pause')) return
        const v = getVideoElement();
        if (v && isLiveStream()) {
            if (v.paused) {
                const thres = getThres();
                const bufferLen = window.bufferlen();
                if (thres && bufferLen && thres > bufferLen) return;
                v.play();
            }
        }
    }
    window.checkPausedIntervalId = setInterval(()=>{checkPaused()}, 500)


    const offLiveAutoReload = ({timeout, lastChat}) => {
        if (!isChecked('auto-reload')) return;
        if (isLiveStream() === false && isChecked('block-roundplay') && getStoredValue('block-roundplay')) {
            const chatHistory = document.querySelector('.chat-history-panel').innerText;
            if (timeout) {
                setTimeout(()=>{offLiveAutoReload({lastChat: chatHistory})}, timeout)
            } else {
                if (chatHistory === lastChat) {
                    window.location.reload();
                } else {
                    console.debug('chat history changed');
                }
            }
        }
    }
    const checkIsLiveReload = (timeout) => {
        if (!isChecked('auto-reload')) return
        if (isLiveStream() === false) {
            fetch("https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=" + getRoomId() + "&protocol=0&format=0,1,2&codec=0&qn=10000&platform=web")
                .then(r => r.json())
                .then(r => {
                console.debug('live status', r.data?.live_status);
                if (r.data?.live_status === 1) {
                    // 0: 闲置，1: 直播，2: 轮播
                    if (timeout) {
                        setTimeout(()=>{checkIsLiveReload()}, timeout);
                    } else {
                        window.location.reload();
                    }
                }
            });
        }
    }
    const checkErrorReload = (timeout) => {
        if (!isChecked('auto-reload')) return
        const error = document.querySelector('.web-player-error-panel');
        if (error) {
            if (timeout) {
                setTimeout(()=>{checkErrorReload()}, timeout);
            } else {
                window.location.reload();
            }
        }
    }
    window.offLiveReloadIntervalId = setInterval(()=>{offLiveAutoReload({timeout: 3600*1000})}, 600*1000);
    window.checkLiveReloadIntervalId = setInterval(()=>{checkIsLiveReload(10*1000)}, 300*1000);
    window.checkErrorReloadIntervalId = setInterval(()=>{checkErrorReload(1000)}, 3000);


    // ----------------------- 网络请求 -----------------------

    const xhrGetApi = (url) => {
        const request = new XMLHttpRequest();
        request.open('GET', url, false);
        request.send(null);
        if (request.status === 200) {
            return JSON.parse(request.responseText);
        }
    }
    const getPlayUrl = (room_id) => {
        console.debug('request playurl');
        const rsp = xhrGetApi("https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=" + room_id + "&protocol=0,1&format=0,1,2&codec=0,1&qn=10000&platform=web");
        return rsp.data?.playurl_info?.playurl;
    }
    const getRoomInit = () => {
        const roomId = location.href.match(/\/(\d+)(\?|$)/)[1];
        const rsp = xhrGetApi("https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=" + roomId + "&protocol=0,1&format=0,1,2&codec=0,1&qn=10000&platform=web");
        cacheRoomInit(rsp);
    }


    // ----------------------- 网络请求hook -----------------------

    const cacheRoomInit = (roomInitRsp) => {
        if (window.__NEPTUNE_IS_MY_WAIFU__?.roomInitRes?.data) return;
        if (!window.__NEPTUNE_IS_MY_WAIFU__) {
            window.__NEPTUNE_IS_MY_WAIFU__ = { roomInitRes: roomInitRsp };
        } else {
            window.__NEPTUNE_IS_MY_WAIFU__.roomInitRes = roomInitRsp;
        }
    }
    const cachePlayUrl = (playurl) => {
        if (!playurl?.stream) return;
        try {
            console.debug('playurl', playurl);
            const baseurl = playurl.stream[0].format[0].codec[0].base_url;
            const qn = playurl.stream[0].format[0].codec[0].current_qn;
            if (qn === 10000 && baseurl.match(/\/live_\d+_\d+\.flv/)) {
                // 未二压的链接格式
                console.debug('raw stream url', baseurl);
                localStorage.setItem('playurl-' + playurl.cid, JSON.stringify(playurl));
            }
        } catch (e) {
            console.error(e);
        }
    }

    const expiredPlayurlChecker = () => {
        const keys = Array.from(Array(localStorage.length).keys()).map(i=>localStorage.key(i));
        keys.filter(i=>i.match(/^playurl-\d+/)).forEach(i => {
            const cachedUrl = JSON.parse(localStorage.getItem(i));
            const expireTs = Number(cachedUrl.stream[0].format[0].codec[0].url_info[0].extra.match(/expires=(\d+)/)[1]);
            if (Date.now()/1000 > expireTs) localStorage.removeItem(i);
        })
        setTimeout(() => {
            const room_id = getRoomId();
            if (!localStorage.getItem('playurl-' + room_id)) {
                document.querySelector('#force-raw').style = 'filter: grayscale(1) brightness(1.5)';
            } else {
                document.querySelector('#force-raw').style = '';
            }
        }, 200);
    }
    window.checkPlayurlIntervalId = setInterval(()=>{expiredPlayurlChecker()}, 600*1000);

    const interceptPlayurl = (r) => {
        const playurl = r.data?.playurl_info?.playurl;
        cachePlayUrl(playurl);
        if (!playurl) return r;
        console.debug('playinfo', r);
        if (!isChecked('force-raw', true)) return r;
        expiredPlayurlChecker();
        const cachedUrl = JSON.parse(localStorage.getItem('playurl-' + playurl.cid));
        console.debug('load cached url', cachedUrl);
        if (!cachedUrl) return r;
        r.data.playurl_info.playurl = cachedUrl;
        return r;
    }

    const origFetch = window.fetch;
    window.fetch = async function() {
        let url = arguments[0];
        if (url.match('api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo')) {
            if (isChecked('force-flv', true)) {
                url = url.replace(/protocol=0,[^&]+/, 'protocol=0');
                url = url.replace(/codec=0,[^&]+/, 'codec=0');
            }
            if (localStorage.getItem('playurl-custom-endpoint')) {
                url = url.replace(/^\/\//, 'https://');
                url = url.replace('https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo', localStorage.getItem('playurl-custom-endpoint'));
                arguments[1] && (arguments[1].credentials = 'omit');
                console.debug('replacing API endpoint', url, arguments[1]);
            }
            arguments[0] = url;
            console.debug('fetch request', arguments);
            const response = await origFetch.apply(this, arguments);
            const r = interceptPlayurl(await response.clone().json());
            response.json = async () => { return r };
            return response;
        } else if (url.match('api.live.bilibili.com/live/getRoundPlayVideo') && isChecked('block-roundplay', true)) {
            const response = await origFetch.apply(this, arguments);
            response.json = async () => ({"code":0,"data":{"cid":-3}});
            return response;
        } else {
            return origFetch.apply(this, arguments);
        }
    }

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function() {
        let url = arguments[1];
        if (url.match('api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo')) {
            if (getStoredValue('auto-quality')) {
                url = url.replace(/qn=[^&]+/, 'qn=10000');
            }
            if (getStoredValue('force-flv')) {
                url = url.replace(/protocol=0,[^&]+/, 'protocol=0');
                url = url.replace(/codec=0,[^&]+/, 'codec=0');
            }
            if (localStorage.getItem('playurl-custom-endpoint')) {
                url = url.replace('https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo', localStorage.getItem('playurl-custom-endpoint'));
                console.debug('replacing API endpoint', url);
            }
            arguments[1] = url;
        }
        return origOpen.apply(this, arguments);
    }

    const xhrAccessor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
    Object.defineProperty(XMLHttpRequest.prototype, 'responseText', {
        get: function() {
            if (this.responseURL.match('api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo') || this.responseURL.match(localStorage.getItem('playurl-custom-endpoint'))) {
                const rsp = JSON.parse(xhrAccessor.get.call(this));
                cacheRoomInit(rsp);
                return JSON.stringify(interceptPlayurl(rsp));
            }
            return xhrAccessor.get.call(this);
        },
        set: function(str) {
            return xhrAccessor.set.call(this, str);
        },
        configurable: true
    });

    Object.defineProperty(window, '__NEPTUNE_IS_MY_WAIFU__', {
        get: function() { return this._init_data_neptune },
        set: function(newdata) {
            if (newdata.roomInitRes.data?.playurl_info?.playurl?.stream) {
                let playurl = newdata.roomInitRes.data.playurl_info.playurl;
                if (getStoredValue('auto-quality')) {
                    if (playurl.stream[0].format[0].codec[0].current_qn < 10000) {
                        playurl = getPlayUrl(newdata.roomInitRes.data.room_id) || playurl;
                        newdata.roomInitRes.data.playurl_info.playurl = playurl;
                    }
                }
                if (getStoredValue('force-flv')) {
                    const filteredStream = playurl.stream.filter( i => i.protocol_name !== "http_hls" );
                    if (filteredStream.length) playurl.stream = filteredStream;
                    playurl.stream.forEach( i => {
                        i.format.forEach( j => {
                            const filteredCodec = j.codec.filter( k => k.codec_name !== "hevc" );
                            if (filteredCodec.length) j.codec = filteredCodec;
                        })
                    });
                }
            }
            if (newdata.roomInitRes) {
                newdata.roomInitRes = interceptPlayurl(newdata.roomInitRes);
            }
            this._init_data_neptune = newdata;
            console.debug('init data', newdata);
        }
    });


    // ----------------------- 选项UI -----------------------

    window.saveConfig = () => {
        console.debug('config changed');
        Array.prototype.slice.call(document.querySelectorAll('#seeker-control-panel input[type=checkbox]')).forEach( e => {
            if (e.id === "auto-AV-sync") return;
            localStorage.setItem(e.id, e.checked);
        });
        Array.prototype.slice.call(document.querySelectorAll('#seeker-control-panel input[type=number]')).forEach( e => {
            localStorage.setItem(e.id, e.value);
        });
    }
    window.copyPlayurl = () => {
        const room_id = getRoomId();
        const value = localStorage.getItem('playurl-' + room_id);
        const e = document.querySelector('#copy-playurl');
        if (!value) {
            e.innerText = '无原画';
        } else {
            navigator.clipboard.writeText(value);
            e.innerText = '已复制';
        }
        setTimeout(()=>{e.innerText = '复制链接'}, 1000);
    }
    window.setPlayurl = () => {
        const value = prompt("请输入playurl json字符串或带query string的完整flv网址\n如出错请取消勾选强制原画；留空点击确定清除当前直播间设置");
        if (value === null) return;
        const room_id = getRoomId();
        if (value === "") {
            localStorage.removeItem('playurl-' + room_id);
            expiredPlayurlChecker();
        } else {
            try {
                let data;
                if (value.match(/^(https:\/\/[^\/]+)(\/live-bvc\/\d+\/live_[^\/]+flv\?)(expires=\d+.*)/)) {
                    const m = value.match(/^(https:\/\/[^\/]+)(\/live-bvc\/\d+\/live_[^\/]+flv\?)(expires=\d+.*)/);
                    data = getPlayUrl(getRoomId());
                    data.stream.forEach( i => {
                        i.format.forEach( j => {
                            j.codec.forEach( k => {
                                k.base_url = m[2];
                                k.url_info.forEach( u => {
                                    u.extra = m[3];
                                    u.host = m[1];
                                })
                                k.url_info = [k.url_info[0]];
                            })
                        })
                    });
                    console.debug('parsed stream url to playurl', data);
                } else {
                    console.debug('parsing playurl as json', value);
                    data = JSON.parse(value);
                }
                if (data.cid !== room_id) {
                    if (!confirm("json的房间号"+data.cid+"可能不符，是否依然为当前房间"+room_id+"设置？")) return
                }
                localStorage.setItem('playurl-' + room_id, JSON.stringify(data));
                expiredPlayurlChecker();
            } catch (e){
                alert('json字符串/flv链接解析失败\n'+e);
                console.error(e);
            }
        }
    }
    window.setEndpoint = () => {
        const value = prompt("请输入获取playurl所用的自定义API endpoint，用以替换默认的`https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo`\n如出错请留空点击确定恢复默认API");
        if (value === null) return;
        if (value === "") {
            localStorage.removeItem('playurl-custom-endpoint');
        } else {
            localStorage.setItem('playurl-custom-endpoint', value);
        }
    }

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
    waitForElement(()=>document.querySelector('#head-info-vm .lower-row'), (node) => {
        const e = document.createElement("span");
        e.innerHTML = (
            '<button id="reset-AV-sync" type="button" onclick="AVResync()" style="width:7em">重置音画同步</button><input type="checkbox" id="auto-AV-sync">' +
            '<label for="hide-stats">隐藏统计</label><input type="checkbox" id="hide-stats">' +
            '<label for="prevent-pause">避免暂停</label><input type="checkbox" id="prevent-pause" onchange="saveConfig()">' +
            '<label for="auto-reload">自动刷新</label><input type="checkbox" id="auto-reload" onchange="saveConfig()">' +
            '<br>' +
            '<label for="force-flv">强制avc+flv</label><input type="checkbox" id="force-flv" onchange="saveConfig()">' +
            '<label for="force-raw">强制原画</label><input type="checkbox" id="force-raw" onchange="saveConfig()">' +
            '<label for="auto-quality">自动原画</label><input type="checkbox" id="auto-quality" onchange="saveConfig()">' +
            '<label for="block-roundplay">阻止轮播</label><input type="checkbox" id="block-roundplay" onchange="saveConfig()">' +
            '<br>' +
            '<button id="playurl-config-showhide" type="button" style="width: 7em">展开链接选项</button>' +
            '<span id="playurl-buttons" style="display: none">' +
            '<button id="copy-playurl" type="button" onclick="copyPlayurl()">复制链接</button>' +
            '<button id="set-playurl" type="button" onclick="setPlayurl()">设置链接!</button>' +
            '<button id="set-endpoint" type="button" onclick="setEndpoint()">设置API !</button>' +
            '</span>' +
            '<label for="buffer-threshold">追帧秒数</label><input type="number" id="buffer-threshold" onchange="saveConfig()" step="0.1" style="width: 3em;">' +
            '<span id="AV-resync-settings" style="display: none">' +
            '<label for="AV-resync-step">重置步进</label><input type="number" id="AV-resync-step" onchange="saveConfig()" step="0.01" style="width: 3.5em;">' +
            '<label for="AV-resync-interval">重置间隔</label><input type="number" id="AV-resync-interval" onchange="saveConfig()" step="1" style="width: 3.5em;">' +
            '</span>' +
            '<style>#seeker-control-panel button { width:5.5em;padding:1px;background: transparent; border: 1.5px solid #999; border-radius: 4px; color: #999; filter: contrast(0.6);}' +
            '#seeker-control-panel button:hover { filter: none; } #seeker-control-panel button:active { filter: none; transform: translate(0.3px, 0.3px); }' +
            '#seeker-control-panel label { pointer-events: none; margin:1px 2px; color: #999; filter: contrast(0.6);} #seeker-control-panel input { vertical-align: middle; margin:1px; }</style>'
        );
        e.style = 'text-align: right; flex: 0 0 fit-content; margin-left: 5px; margin-top: -5px;';
        e.id = 'seeker-control-panel';
        node.appendChild(e);
        document.querySelector('#hide-stats').onchange = (e) => {
            window.saveConfig();
            if (!document.querySelector('.web-player-video-info-panel')) {
                e.target.checked = false
                return
            }
            if (e.target.checked) {
                if (document.querySelector('.web-player-video-info-panel').style.display === 'none') {
                    e.target.checked = false
                    document.querySelector('.web-player-video-info-panel').style.setProperty('opacity', 1)
                    return
                } else {
                    Array.prototype.filter.call(document.querySelector('.web-player-video-info-panel').querySelectorAll('div'), i=>i.innerText==='[x]').forEach(i=>{i.style.setProperty('display','none')});
                    document.querySelector('.web-player-video-info-panel').style.setProperty('opacity', 0)
                    document.querySelector('.web-player-video-info-panel').style.setProperty('user-select', 'none')
                }
            } else {
                document.querySelector('.web-player-video-info-panel').style.setProperty('user-select', 'text')
                document.querySelector('.web-player-video-info-panel').style.setProperty('opacity', 1)
                Array.prototype.filter.call(document.querySelector('.web-player-video-info-panel').querySelectorAll('div'), i=>i.innerText==='[x]').forEach(i=>{i.style.removeProperty('display')});
            }
        }

        document.querySelector('#playurl-config-showhide').onclick = (e) => {
            const span = document.querySelector('#playurl-buttons');
            span.style.display = "";
            e.target.style.display = "none";
        }
        document.querySelector('#auto-AV-sync').onchange = (e) => {
            if (e.target.checked) {
                startAutoResync();
                document.querySelector('#AV-resync-settings').style = "";
            } else {
                stopAutoResync();
                document.querySelector('#AV-resync-settings').style = "display: none";
            }
        }
        document.querySelector('#AV-resync-interval').onchange = (e) => {
            startAutoResync();
            window.saveConfig();
        }

        Array.prototype.slice.call(document.querySelectorAll('#seeker-control-panel label, #seeker-control-panel button')).forEach( e => {
            e.className += ' live-skin-normal-a-text';
        })

        Array.prototype.slice.call(document.querySelectorAll('#seeker-control-panel input[type=checkbox]')).forEach( e => {
            if (e.id === "hide-stats") return (getStoredValue(e.id) && setTimeout(()=>{e.click()}, 100));
            if (e.id === "auto-AV-sync") return;
            e.checked = getStoredValue(e.id);
        })
        Array.prototype.slice.call(document.querySelectorAll('#seeker-control-panel input[type=number]')).forEach( e => {
            e.value = getStoredValue(e.id);
        })
        expiredPlayurlChecker();
    })

    waitForElement(()=>document.querySelector('#head-info-vm .lower-row .right-ctnr'), node => {
        const getBottom = (e) => { const rect = e.getBoundingClientRect(); return rect.y + rect.height; }
        const getTop = (e) => { const rect = e.getBoundingClientRect(); return rect.y }
        const observer = new ResizeObserver((entries) => {
            if (node.children.length <= 1) return;
            if (getTop(node.children[node.children.length-1]) >= getBottom(node.children[0])) {
                node.style.marginTop = '-20px';
                node.style.alignItems = 'flex-end';
                document.querySelector('#playback-rate-username').style.display = 'none';
                document.querySelector('#playback-rate-title').style.display = '';
            } else {
                node.style.marginTop = '';
                node.style.alignItems = '';
                document.querySelector('#playback-rate-username').style.display = '';
                document.querySelector('#playback-rate-title').style.display = 'none';
            }
        });
        observer.observe(node);
    });

    const updatePanelHideState = () => {
        if (getStoredValue('hide-seeker-control-panel')) {
            waitForElement(()=>document.querySelector('#seeker-control-panel'), node => {node.style.display = 'none';});
            waitForElement(()=>document.querySelector('#control-panel-showhide span'), node => {node.innerText = '显示追帧';});
            waitForElement(()=>document.querySelector('#head-info-vm .upper-row .right-ctnr'), node => {node.style.marginTop = '';});
            waitForElement(()=>document.querySelector('#head-info-vm .lower-row'), node => {node.style.marginTop = '';});
            waitForElement(()=>document.querySelector('#head-info-vm .lower-row .right-ctnr'), node => {node.style.flex = ''; node.style.flexWrap = ''; node.style.placeContent = ''; node.style.rowGap = '';});

            waitForElement(()=>document.querySelector('#head-info-vm .lower-row .pk-act-left-distance'), node => {node.style.maxWidth = '';}, 15000);
            waitForElement(()=>document.querySelector('#head-info-vm .lower-row .act-left-distance'), node => {node.style.maxWidth = '';}, 15000);
            waitForElement(()=>document.querySelector('#head-info-vm .lower-row .gift-planet-entry'), node => {node.style.marginLeft = '';}, 15000);
        } else {
            waitForElement(()=>document.querySelector('#seeker-control-panel'), node => {node.style.display = '';});
            waitForElement(()=>document.querySelector('#control-panel-showhide span'), node => {node.innerText = '隐藏追帧';});
            waitForElement(()=>document.querySelector('#playurl-config-showhide'), node => {node.style.display = '';});
            waitForElement(()=>document.querySelector('#playurl-buttons'), node => {node.style.display = 'none';});
            waitForElement(()=>document.querySelector('#head-info-vm .upper-row .right-ctnr'), node => {node.style.marginTop = '-7px';});
            waitForElement(()=>document.querySelector('#head-info-vm .lower-row'), node => {node.style.marginTop = '0px';});
            waitForElement(()=>document.querySelector('#head-info-vm .lower-row .right-ctnr'), node => { node.style.flex = '100 1 auto'; node.style.flexWrap = 'wrap'; node.style.placeContent = 'space-around center'; node.style.rowGap = '5px';});

            waitForElement(()=>document.querySelector('#head-info-vm .lower-row .pk-act-left-distance'), node => {node.style.maxWidth = '3px';}, 15000);
            waitForElement(()=>document.querySelector('#head-info-vm .lower-row .act-left-distance'), node => {node.style.maxWidth = '3px';}, 15000);
            waitForElement(()=>document.querySelector('#head-info-vm .lower-row .gift-planet-entry'), node => {node.style.marginLeft = '5px';}, 15000);
        }
    }

    waitForElement(()=>document.querySelector('#head-info-vm .upper-row .right-ctnr'), (node) => {
        const e = document.createElement("div");
        e.id = 'control-panel-showhide';
        e.className = "icon-ctnr live-skin-normal-a-text pointer";
        e.innerHTML = '<i class="v-middle icon-font icon-danmu-a" style="margin-left:16px; font-size:16px;"></i><span class="action-text v-middle" style="margin-left:8px; font-size:12px;"></span>';
        e.onclick = () => {
            localStorage.setItem('hide-seeker-control-panel', !getStoredValue('hide-seeker-control-panel'));
            updatePanelHideState();
        }
        node.appendChild(e);
        updatePanelHideState();
    })

})();
