// ==UserScript==
// @name         Bilibili直播自动追帧
// @namespace    https://space.bilibili.com/521676
// @version      0.6.2
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
        const e = document.querySelector('.live-status');
        const v = getVideoElement();
        if (!e || !v) {
            setTimeout(updatePlaybackRateDisplay, 100);
        } else {
            e.innerText = e.innerText.match(/^[^@\d]+/) + '@' + v.playbackRate.toFixed(2)
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
        const match = e.innerText.match(/:\s*([\d\.]+)s/);
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
            'auto-reload': true,
            'force-flv': true,
            'prevent-pause': false,
            'force-raw': false,
            'auto-quality': true,
            'block-roundplay': false,
            'buffer-threshold': 1.5,
        };
        try {
            const value = JSON.parse(localStorage.getItem(key));
            if (value !== null) return value;
            return defaultValues[key];
        } catch {
            return defaultValues[key];
        }
    }
    const isChecked = (i, fallback) => {
        const e = document.querySelector('#'+i);
        if (!e && fallback) return getStoredValue(i);
        return e?.checked;
    }
    const isLiveStream = () => {
        const e = document.querySelector('.live-status');
        if (!e) return undefined;
        if (e.innerText.match(/^直播/)) {
            return true;
        } else {
            return false;
        }
    }
    const getRoomId = () => {
        if (!window.__NEPTUNE_IS_MY_WAIFU__?.roomInitRes?.data?.room_id) getRoomInit();
        return window.__NEPTUNE_IS_MY_WAIFU__?.roomInitRes?.data?.room_id || Number(location.href.match(/\/(\d+)/)[1]);
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
            arguments[1] = url;
        }
        return origOpen.apply(this, arguments);
    }

    const xhrAccessor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
    Object.defineProperty(XMLHttpRequest.prototype, 'responseText', {
        get: function() {
            if (this.responseURL.match('api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo')) {
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
            if (e.id === "hide_stats") return;
            localStorage.setItem(e.id, e.checked);
        })
        const e = document.querySelector('#buffer-threshold');
        if (e) localStorage.setItem('buffer-threshold', e.value);
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

    const waitForElement = (checker, exec) => {
        if (checker()) {
            exec();
        } else {
            setTimeout(() => waitForElement(checker, exec), 100);
        }
    }
    waitForElement(()=>document.querySelector('#head-info-vm .right-ctnr .p-relative'), () => {
        const e = document.createElement("span");
        e.innerHTML = (
            '<label for="hide_stats">隐藏统计</label><input type="checkbox" id="hide_stats">' +
            '<label for="prevent-pause">避免暂停</label><input type="checkbox" id="prevent-pause" onchange="saveConfig()">' +
            '<label for="auto-reload">自动刷新</label><input type="checkbox" id="auto-reload" onchange="saveConfig()">' +
            '<br>' +
            '<label for="force-flv">强制avc+flv</label><input type="checkbox" id="force-flv" onchange="saveConfig()">' +
            '<label for="force-raw">强制原画</label><input type="checkbox" id="force-raw" onchange="saveConfig()">' +
            '<label for="auto-quality">自动原画</label><input type="checkbox" id="auto-quality" onchange="saveConfig()">' +
            '<label for="block-roundplay">阻止轮播</label><input type="checkbox" id="block-roundplay" onchange="saveConfig()">' +
            '<br>' +
            '<button id="copy-playurl" type="button" onclick="copyPlayurl()">复制链接</button>' +
            '<button id="set-playurl" type="button" onclick="setPlayurl()">设置链接!</button>' +
            '<label for="buffer-threshold">追帧秒数</label><input type="number" id="buffer-threshold" onchange="saveConfig()" step="0.1" style="width: 3em;">' +
            '<style>#seeker-control-panel button { width:5.5em;padding:1px;background: transparent; border: 1.5px solid #999; border-radius: 4px; color: #999; filter: contrast(0.6);}' +
            '#seeker-control-panel button:hover { filter: none; } #seeker-control-panel button:active { filter: none; transform: translate(0.3px, 0.3px); }' +
            '#seeker-control-panel label { pointer-events: none; margin:1px 2px; color: #999; filter: contrast(0.6);} #seeker-control-panel input { vertical-align: middle; margin:1px; }</style>'
        );
        e.style = 'text-align: right;';
        e.id = 'seeker-control-panel';
        document.querySelector('#head-info-vm .right-ctnr .p-relative').appendChild(e);
        document.querySelector('#hide_stats').onchange = (e) => {
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

        Array.prototype.slice.call(document.querySelectorAll('#seeker-control-panel label, #seeker-control-panel button')).forEach( e => {
            e.className += ' live-skin-normal-a-text';
        })

        Array.prototype.slice.call(document.querySelectorAll('#seeker-control-panel input[type=checkbox]')).forEach( e => {
            if (e.id === "hide_stats") return;
            e.checked = getStoredValue(e.id);
        })
        document.querySelector('#buffer-threshold').value = getStoredValue('buffer-threshold');
        expiredPlayurlChecker();
    })

})();
