// ==UserScript==
// @name         Bilibili直播自动追帧
// @namespace    http://tampermonkey.net/
// @version      0.5.1
// @description  自动追帧bilibili直播至设定的buffer length
// @author       c_b
// @match        https://live.bilibili.com/*
// @icon         https://www.bilibili.com/favicon.ico
// @license      GPLv3 License
// @supportURL   https://space.bilibili.com/521676
// @supportURL   https://github.com/c-basalt/bilibili-live-seeker-script/
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

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
            if (statsLen - videoLen > 2) {
                return statsLen;
            }
        }
        if (videoLen) {
            return videoLen;
        } else {
            return statsBuffLen() || videoBuffLen();
        }
    }

    const getThres = () => {
        const e = document.querySelector('#buffer-threshold');
        if (!e) return null
        const value = Number(document.querySelector('#buffer-threshold').value)
        if (!value) return null
        return value;
    }

    const adjustSpeedup = () => {
        const thres = getThres()
        if (!thres) return;
        try {
            const bufferLen = window.bufferlen()
            if (bufferLen === null) {
                return;
            }
            if (bufferLen - thres > 2) {
                window.setRate(1.3);
            } else if (bufferLen - thres > 1) {
                window.setRate(1.2);
            } else if (bufferLen > thres) {
                window.setRate(1.1);
            } else if (getVideoElement() && getVideoElement().playbackRate > 1) {
                window.resetRate();
            }
        } catch(e) {
            console.log(e)
        }
    }

    const adjustSpeeddown = () => {
        try {
            const bufferLen = window.bufferlen()
            if (bufferLen === null) {
                return;
            }
            if (bufferLen < 0.2) {
                window.setRate(0.1);
            } else if (bufferLen < 0.3) {
                window.setRate(0.3);
            } else if (bufferLen < 0.6) {
                window.setRate(0.6);
            } else if (getVideoElement() && getVideoElement().playbackRate < 1) {
                window.resetRate();
            }
        } catch(e) {
            console.log(e)
        }
    }
    window.speedUpIntervalId = setInterval(()=>{adjustSpeedup()}, 1000)
    window.speedDownIntervalId = setInterval(()=>{adjustSpeeddown()}, 50)

    const checkPaused = () => {
        const e = document.querySelector('#prevent-pause');
        if (!e?.checked) return
        const status = document.querySelector('.live-status');
        const v = getVideoElement();
        if (v && status && status.innerText.match(/^直播/)) {
            if (v.paused) v.play();
        }
    }
    window.checkPausedIntervalId = setInterval(()=>{checkPaused()}, 1000)

    const checkIsLiveReload = (timeout) => {
        if (!window.__NEPTUNE_IS_MY_WAIFU__) return;
        const e = document.querySelector('#auto-reload');
        if (!e?.checked) return;
        const status = document.querySelector('.live-status');
        if (status && status.innerText.match(/^(闲置|轮播)/)) {
            fetch("https://api.bilibili.com/x/space/acc/info?jsonp=jsonp&mid=" + window.__NEPTUNE_IS_MY_WAIFU__.roomInitRes.data.uid)
                .then(r => r.json())
                .then(r => {
                if (r.code === 0 && r.data.live_room.liveStatus) {
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
        const e = document.querySelector('#auto-reload');
        if (!e?.checked) return
        const error = document.querySelector('.web-player-error-panel');
        if (error) {
            if (timeout) {
                setTimeout(()=>{checkErrorReload()}, timeout);
            } else {
                window.location.reload()
            }
        }
    }
    window.checkReloadIntervalId = setInterval(()=>{checkIsLiveReload(5000)}, 180000);
    window.checkReloadIntervalId = setInterval(()=>{checkErrorReload(1000)}, 3000);

    const recordPlayUrl = (playurl) => {
        if (!playurl) return;
        console.log('playurl', playurl);
        try {
            console.log('playurl', playurl);
            const baseurl = playurl.stream[0].format[0].codec[0].base_url;
            const qn = playurl.stream[0].format[0].codec[0].current_qn;
            if (qn === 10000 && baseurl.match(/\/live_\d+_\d+\.flv/)) {
                // non-transcoded url format
                console.log('raw stream url', baseurl);
                localStorage.setItem('playurl-' + playurl.cid, JSON.stringify(playurl));
            }
        } catch (e) {
            console.log(e);
        }
    }

    const expiredPlayurlChecker = () => {
        const keys = Array.from(Array(localStorage.length).keys()).map(i=>localStorage.key(i));
        keys.filter(i=>i.match(/^playurl-\d+/)).forEach(i => {
            const cachedUrl = JSON.parse(localStorage.getItem(i));
            const expireTs = Number(cachedUrl.stream[0].format[0].codec[0].url_info[0].extra.match(/expires=(\d+)/)[1]);
            if (Date.now()/1000 > expireTs) localStorage.removeItem(i);
        })
    }
    window.checkPlayurlIntervalId = setInterval(()=>{expiredPlayurlChecker()}, 10*60*1000);

    const interceptPlayurl = (r) => {
        console.log(r);
        const playurl = r.data?.playurl_info?.playurl
        if (!playurl) return r;
        const e = document.querySelector('#force-raw');
        if (!e?.checked) return r;
        expiredPlayurlChecker();
        const cachedUrl = JSON.parse(localStorage.getItem('playurl-' + playurl.cid));
        if (!cachedUrl) return r;
        r.data.playurl_info.playurl = cachedUrl;
        return r;
    }

    const origFetch = window.fetch;
    window.fetch = async function() {
        let url = arguments[0];
        if (!url.match('api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo')) return origFetch.apply(this, arguments);
        const e = document.querySelector('#force-flv');
        if (!e?.checked) return origFetch.apply(this, arguments);

        url = url.replace(/protocol=0,[^&]+&/, 'protocol=0&');
        url = url.replace(/codec=0,[^&]+&/, 'codec=0&');
        arguments[0] = url;
        console.log('fetch request', arguments);
        const response = await origFetch.apply(this, arguments);
        recordPlayUrl((await response.clone().json()).data?.playurl_info?.playurl)
        const r = await response.clone().json()
        response.json = async () => { return interceptPlayurl(r) }
        return response;
    }

    const waitForElement = (checker, exec) => {
        if (checker()) {
            exec();
        } else {
            setTimeout(() => waitForElement(checker, exec), 100)
        }
    }

    window.saveConfig = () => {
        console.log('config changed');
        let e;
        [
            'auto-reload',
            'force-flv',
            'prevent-pause',
            'force-raw',
            'auto-quality',
        ].forEach( i => {
            const e = document.querySelector('#'+i);
            if (e) localStorage.setItem(i, e.checked);
        })
        e = document.querySelector('#buffer-threshold');
        if (e) localStorage.setItem('buffer-threshold', e.value);
    }

    const getStoredValue = (key) => {
        const defaultValues = {
            'auto-reload': true,
            'force-flv': true,
            'prevent-pause': false,
            'force-raw': false,
            'auto-quality': true,
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

    const getPlayUrl = (room_id) => {
        const request = new XMLHttpRequest();
        console.log('request playurl')
        request.open('GET', "https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=" + room_id + "&protocol=0&format=0,1,2&codec=0&qn=10000&platform=web", false);
        request.send(null);
        if (request.status === 200) {
            return JSON.parse(request.responseText).data?.playurl_info?.playurl
        }
    }

    Object.defineProperty(window, '__NEPTUNE_IS_MY_WAIFU__', {
        get: function() { return this._init_data_neptune },
        set: function(newdata) {
            if (newdata.roomInitRes.data?.playurl_info?.playurl?.stream) {
                let playurl = newdata.roomInitRes.data.playurl_info.playurl;
                if (getStoredValue('auto-quality')) {
                    if (playurl.stream[0].format[0].codec[0].current_qn < 10000) {
                        playurl = getPlayUrl(newdata.roomInitRes.data.room_id) || playurl;
                        recordPlayUrl(playurl);
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
            this._init_data_neptune = newdata;
            console.log(newdata)
        }
    });

    window.copyPlayurl = () => {
        const room_id = window.__NEPTUNE_IS_MY_WAIFU__.roomInitRes.data.room_id;
        const value = localStorage.getItem('playurl-' + room_id);
        if (!value) {
            const e = document.querySelector('#copy-playurl');
            e.innerText = '无原画ｘ';
            setTimeout(()=>{e.innerText = '复制链接'}, 1000);
        } else {
            navigator.clipboard.writeText(value);
        }
    }
    window.setPlayurl = () => {
        const value = prompt("请输入playurl json字符串\n如出错请取消勾选强制原画，留空并确定清除当前直播间设置");
        if (value === null) return;
        const room_id = window.__NEPTUNE_IS_MY_WAIFU__.roomInitRes.data.room_id;
        if (value === "") {
            localStorage.removeItem('playurl-' + room_id);
        } else {
            localStorage.setItem('playurl-' + room_id, value);
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
            '<br>' +
            '<button id="copy-playurl" type="button" style="background: transparent;text-shadow: 1px 0 4px white;" onclick="copyPlayurl()">复制链接</button> ' +
            '<button id="set-playurl" type="button" style="background: transparent;text-shadow: 1px 0 4px white;" onclick="setPlayurl()">设置链接！</button> ' +
            '<label for="buffer-threshold">追帧秒数</label><input type="number" id="buffer-threshold" onchange="saveConfig()" step="0.1" style="width: 3em;">'
        );
        e.style = 'text-shadow: 1px 0 4px white;text-align: right;';
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

        [
            'auto-reload',
            'force-flv',
            'prevent-pause',
            'force-raw',
            'auto-quality',
        ].forEach( i => {
            document.querySelector('#'+i).checked = getStoredValue(i);
        })
        document.querySelector('#buffer-threshold').value = getStoredValue('buffer-threshold');
        window.saveConfig();
    })

})();
