// ==UserScript==
// @name         视频倍速控制器
// @namespace    https://gitcode.com/lhj1618/me/releases/js
// @version      1.2
// @description  视频框左上角倍速指示器，单击循环切换0.75/1/1.5/2，默认1.5倍，双击重置，不阻塞网页
// @author       lhj1618
// @match        *://*/*
// @grant        none
// ==/UserScript==
(function() {
    'use strict';
    // 配置参数
    const SPEED_LIST = [0.75, 1, 1.5, 2];
    const DEFAULT_SPEED = 1.5;
    let currentSpeedIndex = SPEED_LIST.indexOf(DEFAULT_SPEED);
    let observer = null;
    let scanTimer = null;

    // 防抖扫描视频
    function debounceScanVideos() {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(() => scanVideos(), 300);
    }

    // 更新所有指示器文字
    function updateAllIndicatorText() {
        const spd = SPEED_LIST[currentSpeedIndex];
        document.querySelectorAll('.video-speed-indicator').forEach(el => {
            el.textContent = `▶ ${spd}x`;
        });
    }

    // 批量设置所有视频倍速
    function setAllVideoSpeed(speed) {
        document.querySelectorAll('video').forEach(video => {
            try {
                if (video && video.tagName === 'VIDEO' && video.isConnected) {
                    video.playbackRate = speed;
                }
            } catch (err) {}
        });
        updateAllIndicatorText();
    }

    // 给单个video创建左上角指示器
    function createVideoIndicator(video) {
        // 已存在则跳过
        if (video.parentElement.querySelector('.video-speed-indicator')) return;

        // 父容器开启相对定位，让指示器依附视频左上角
        const parent = video.parentElement;
        const oldPos = parent.style.position;
        if (!['relative','absolute','fixed','sticky'].includes(getComputedStyle(parent).position)) {
            parent.style.position = 'relative';
            // 标记用于恢复，避免污染页面原有样式
            parent.dataset.speedPosBackup = oldPos;
        }

        const indicator = document.createElement('div');
        indicator.className = 'video-speed-indicator';
        indicator.style.cssText = `
            position: absolute;
            top: 8px;
            left: 8px;
            z-index: 99999999;
            padding: 4px 10px;
            background: rgba(0,0,0,0.35);
            color: #fff;
            font-size: 14px;
            font-family: system-ui, sans-serif;
            border-radius: 6px;
            backdrop-filter: blur(4px);
            cursor: pointer;
            user-select: none;
            transition: background 0.2s;
            pointer-events: auto;
        `;
        indicator.textContent = `▶ ${SPEED_LIST[currentSpeedIndex]}x`;

        // hover加深
        indicator.onmouseover = () => indicator.style.background = 'rgba(0,0,0,0.55)';
        indicator.onmouseout = () => indicator.style.background = 'rgba(0,0,0,0.35)';

        // 单击切换倍速
        indicator.addEventListener('click', () => {
            currentSpeedIndex = (currentSpeedIndex + 1) % SPEED_LIST.length;
            setAllVideoSpeed(SPEED_LIST[currentSpeedIndex]);
        });
        // 双击重置默认倍速
        indicator.addEventListener('dblclick', () => {
            currentSpeedIndex = SPEED_LIST.indexOf(DEFAULT_SPEED);
            setAllVideoSpeed(DEFAULT_SPEED);
        });

        parent.appendChild(indicator);
    }

    // 扫描页面所有视频，生成指示器并应用倍速
    function scanVideos() {
        const videos = Array.from(document.querySelectorAll('video')).filter(v => v.isConnected);
        videos.forEach(video => {
            createVideoIndicator(video);
            try {
                video.playbackRate = SPEED_LIST[currentSpeedIndex];
            } catch (e) {}
        });
    }

    // 初始化DOM监听
    function initObserver() {
        if (observer) observer.disconnect();
        observer = new MutationObserver((mutations) => {
            let hasNewVideo = false;
            for (const m of mutations) {
                if (m.addedNodes.length) {
                    for (const node of m.addedNodes) {
                        if (node.tagName === 'VIDEO' || node.querySelector?.('video')) {
                            hasNewVideo = true;
                            break;
                        }
                    }
                }
                if (hasNewVideo) break;
            }
            if (hasNewVideo) debounceScanVideos();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // 初始化入口
    function init() {
        try {
            scanVideos();
            initObserver();
            // 页面卸载清理
            window.addEventListener('beforeunload', () => {
                clearTimeout(scanTimer);
                if (observer) observer.disconnect();
                // 恢复父容器原有position样式
                document.querySelectorAll('[data-speed-pos-backup]').forEach(el => {
                    el.style.position = el.dataset.speedPosBackup;
                    delete el.dataset.speedPosBackup;
                });
                // 移除所有指示器
                document.querySelectorAll('.video-speed-indicator').forEach(el => el.remove());
            });
        } catch (e) {
            console.log('倍速脚本初始化异常', e);
        }
    }

    // 页面加载执行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
