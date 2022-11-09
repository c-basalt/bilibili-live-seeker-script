// ==UserScript==
// @name         Bilibili直播自动追帧
// @namespace    http://tampermonkey.net/
// @version      0.4.2
// @description  自动追帧bilibili直播至设定的buffer length
// @author       c_b
// @match        https://live.bilibili.com/*
// @icon         https://www.bilibili.com/favicon.ico
// @license      GPLv3 License
// @supportURL   https://space.bilibili.com/521676
// @run-at       document-start
// @grant        none
// ==/UserScript==
 
(function() {
 
    const consoleLog = console.log;
    'use strict';
 
    let videoElementId;
    const getVideoElement = () => {
        const e = document.getElementsByTagName('video')[0]
        window.videoElement = e || window.videoElement;
        videoElementId = window.videoElementId = window.videoElement?.id;
        if (!window.videoElement) {
            // console.log(videoElementId, window.videoElementId, window.videoElement, e)
        }
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
        if (Number(rate).toFixed(2) != '1.00') {
            console.log('buffer', window.bufferlen().toFixed(3), 'rate', Number(rate).toFixed(2));
        }
        const e = getVideoElement()
        if (!e) return
        if (e.playbackRate.toFixed(2) == Number(rate).toFixed(2)) return;
        if (Number(rate).toFixed(2) === '1.00') {
            console.log('buffer', window.bufferlen().toFixed(3), 'rate', Number(rate).toFixed(2));
        }
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
        if (!e) {
            //console.log('video not found');
            return null;
        }
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
 
 
    const origFetch = window.fetch;
    window.fetch = function() {
        let url = arguments[0];
        if (url.match('api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo')) {
            const e = document.querySelector('#force-flv');
            if (e?.checked) {
                url = url.replace(/protocol=0,[^&]+&/, 'protocol=0&');
                url = url.replace(/codec=0,[^&]+&/, 'codec=0&');
                arguments[0] = url;
            }
        }
        console.log('fetch request', arguments);
        return origFetch.apply(this, arguments);
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
        e = document.querySelector('#auto-reload');
        if (e) localStorage.setItem('auto-reload', e.checked);
        e = document.querySelector('#force-flv');
        if (e) localStorage.setItem('force-flv', e.checked);
        e = document.querySelector('#buffer-threshold');
        if (e) localStorage.setItem('buffer-threshold', e.value);
    }
 
    if (localStorage.getItem('auto-reload') === null) localStorage.setItem('auto-reload', true);
    if (localStorage.getItem('force-flv') === null) localStorage.setItem('force-flv', true);
    if (localStorage.getItem('buffer-threshold') === null) localStorage.setItem('buffer-threshold', 1.5);
 
    if (JSON.parse(localStorage.getItem('force-flv'))) {
        Object.defineProperty(window, '__NEPTUNE_IS_MY_WAIFU__', {
            get: function() { return this._init_data_neptune },
            set: function(newdata) {
                if (newdata.roomInitRes.data?.playurl_info?.playurl?.stream) {
                    const playurl = newdata.roomInitRes.data.playurl_info.playurl;
                    const filteredStream = playurl.stream.filter( i => i.protocol_name !== "http_hls" );
                    if (filteredStream.length) playurl.stream = filteredStream;
                    playurl.stream.forEach( i => {
                        i.format.forEach( j => {
                            const filteredCodec = j.codec.filter( k => k.codec_name !== "hevc" );
                            if (filteredCodec.length) j.codec = filteredCodec;
                        })
                    });
                }
                this._init_data_neptune = newdata;
                console.log(newdata)
            }
        });
    }
 
    waitForElement(()=>document.querySelector('#head-info-vm .right-ctnr .p-relative'), () => {
        const e = document.createElement("span");
        e.innerHTML = '<label for="hide_stats">隐藏统计</label><input type="checkbox" id="hide_stats"><label for="auto-reload">自动刷新</label><input type="checkbox" id="auto-reload" onchange="saveConfig()"><label for="auto-reload">强制avc+flv</label><input type="checkbox" id="force-flv" onchange="saveConfig()"><br><label for="buffer-threshold">追帧秒数</label><input type="number" id="buffer-threshold" min="1" max="10" onchange="saveConfig()">';
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
        document.querySelector('#auto-reload').checked = JSON.parse(localStorage.getItem('auto-reload'));
        document.querySelector('#force-flv').checked = JSON.parse(localStorage.getItem('force-flv'));
        document.querySelector('#buffer-threshold').value = JSON.parse(localStorage.getItem('buffer-threshold'));
        window.saveConfig();
    })
 
})();