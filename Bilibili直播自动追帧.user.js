// ==UserScript==
// @name         Bilibili直播自动追帧
// @namespace    https://space.bilibili.com/521676
// @version      0.5.4
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

    if (!location.href.match(/https:\/\/live\.bilibili\.com\/\d+/)) return;
    // 仅对直播间生效

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
            console.log(e)
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
            console.log(e)
        }
    }
    window.speedUpIntervalId = setInterval(()=>{adjustSpeedup()}, 1000)
    window.speedDownIntervalId = setInterval(()=>{adjustSpeeddown()}, 50)


    const isLiveStream = () => {
        const status = document.querySelector('.live-status');
        if (!status) return null;
        if (status.innerText.match(/^直播/)) {
            return true;
        } else {
            return false;
        }
    }
    const isChecked = (i) => {
        const e = document.querySelector('#'+i);
        return e?.checked;
    }

    const checkPaused = () => {
        if (!isChecked('prevent-pause')) return
        const status = document.querySelector('.live-status');
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

    const checkIsLiveReload = (timeout) => {
        if (!window.__NEPTUNE_IS_MY_WAIFU__?.roomInitRes) return;
        if (!isChecked('auto-reload')) return
        if (isLiveStream() === false) {
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
        if (!isChecked('auto-reload')) return
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

    const cachePlayUrl = (playurl) => {
        if (!playurl) return;
        console.log('playurl', playurl);
        try {
            console.log('playurl', playurl);
            const baseurl = playurl.stream[0].format[0].codec[0].base_url;
            const qn = playurl.stream[0].format[0].codec[0].current_qn;
            if (qn === 10000 && baseurl.match(/\/live_\d+_\d+\.flv/)) {
                // 未二压的链接格式
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
        setTimeout(() => {
            const room_id = window.__NEPTUNE_IS_MY_WAIFU__?.roomInitRes?.data?.room_id;
            if (!localStorage.getItem('playurl-' + room_id)) {
                document.querySelector('#force-raw').style = 'filter: grayscale(1) brightness(1.5)';
            } else {
                document.querySelector('#force-raw').style = '';
            }
        }, 200);
    }
    window.checkPlayurlIntervalId = setInterval(()=>{expiredPlayurlChecker()}, 10*60*1000);

    const interceptPlayurl = (r) => {
        console.log(r);
        const playurl = r.data?.playurl_info?.playurl
        if (!playurl) return r;
        if (!isChecked('force-raw')) return r;
        expiredPlayurlChecker();
        const cachedUrl = JSON.parse(localStorage.getItem('playurl-' + playurl.cid));
        if (!cachedUrl) return r;
        r.data.playurl_info.playurl = cachedUrl;
        return r;
    }

    const origFetch = window.fetch;
    window.fetch = async function() {
        let url = arguments[0];
        if (url.match('api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo') && isChecked('force-flv')) {
            url = url.replace(/protocol=0,[^&]+/, 'protocol=0');
            url = url.replace(/codec=0,[^&]+/, 'codec=0');
            arguments[0] = url;
            console.log('fetch request', arguments);
            const response = await origFetch.apply(this, arguments);
            cachePlayUrl((await response.clone().json()).data?.playurl_info?.playurl)
            const r = await response.clone().json()
            response.json = async () => { return interceptPlayurl(r) }
            return response;
        } else if (url.match('api.live.bilibili.com/live/getRoundPlayVideo') && isChecked('block-roundplay')) {
            const response = await origFetch.apply(this, arguments);
            response.json = async () => ({"code":0,"data":{"cid":-3}})
            return response
        } else {
            return origFetch.apply(this, arguments);
        }
    }

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
                cachePlayUrl(playurl);
                if (getStoredValue('force-raw')) {
                    expiredPlayurlChecker();
                    const cachedUrl = JSON.parse(localStorage.getItem('playurl-' + playurl.cid));
                    if (cachedUrl) newdata.roomInitRes.data.playurl_info.playurl = cachedUrl;
                }
            }
            this._init_data_neptune = newdata;
            console.log(newdata)
        }
    });

    window.saveConfig = () => {
        console.log('config changed');
        Array.prototype.slice.call(document.querySelectorAll('#seeker-control-panel input[type=checkbox]')).forEach( e => {
            if (e.id === "hide_stats") return;
            localStorage.setItem(e.id, e.checked);
        })
        const e = document.querySelector('#buffer-threshold');
        if (e) localStorage.setItem('buffer-threshold', e.value);
    }
    window.copyPlayurl = () => {
        const room_id = window.__NEPTUNE_IS_MY_WAIFU__.roomInitRes.data.room_id;
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
        const value = prompt("请输入playurl json字符串\n如出错请取消勾选强制原画；留空点击确定清除当前直播间设置");
        if (value === null) return;
        const room_id = window.__NEPTUNE_IS_MY_WAIFU__.roomInitRes.data.room_id;
        if (value === "") {
            localStorage.removeItem('playurl-' + room_id);
        } else {
            try {
                const data = JSON.parse(value);
                if (data.cid !== room_id) {
                    if (!confirm("json的房间号"+data.cid+"可能不符，是否依然为当前房间"+room_id+"设置？")) return
                }
                localStorage.setItem('playurl-' + room_id, JSON.stringify(data));
                expiredPlayurlChecker();
            } catch (e){
                alert('json字符串解析失败\n'+e);
            }
        }
    }

    const waitForElement = (checker, exec) => {
        if (checker()) {
            exec();
        } else {
            setTimeout(() => waitForElement(checker, exec), 100)
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
            '<button id="copy-playurl" type="button" class="control-btn" onclick="copyPlayurl()">复制链接</button> ' +
            '<button id="set-playurl" type="button" class="control-btn" onclick="setPlayurl()">设置链接!</button> ' +
            '<label for="buffer-threshold">追帧秒数</label><input type="number" id="buffer-threshold" onchange="saveConfig()" step="0.1" style="width: 3em;">' +
            '<style>.control-btn { width:5em;padding:1px;background: transparent;text-shadow: 1px 0 4px white; }</style>'
        );
        e.style = 'text-shadow: 1px 0 4px white;text-align: right;';
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

        Array.prototype.slice.call(document.querySelectorAll('#seeker-control-panel input[type=checkbox]')).forEach( e => {
            if (e.id === "hide_stats") return;
            e.checked = getStoredValue(e.id);
        })
        document.querySelector('#buffer-threshold').value = getStoredValue('buffer-threshold');
        expiredPlayurlChecker();
    })

})();
