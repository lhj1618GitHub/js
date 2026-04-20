// ==UserScript==
// @name            视频播放速度控制
// @version           3.0.0
// @description    快捷设置视频播放速度
// @author           lhj1618
// @match            *://*/*
// @grant             none
// @run-at            document-end
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        defaultSpeed: 1.5,
        speedOptions: [0.75, 1, 1.5, 2],
        storageKey: 'videoSpeedCustomSpeeds',
        indicator: {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            textColor: '#fff',
            bgColor: 'rgba(0,0,0,0.3)',
            padding: '4px 8px',
            borderRadius: '4px',
            zIndex: 2147483647
        }
    };

    const state = {
        currentSpeed: CONFIG.defaultSpeed,
        videoMap: new Map(),
        videoSpeedMap: new Map(),
        observer: null,
        customSpeeds: JSON.parse(localStorage.getItem(CONFIG.storageKey) || '[]'),
        initialized: false,
        isSettingSpeed: false,
        clickTimeout: null
    };

    class VideoSpeedController {
        constructor() { this.init(); }

        init() {
            if (state.initialized) return;
            this.setGlobalSpeed(CONFIG.defaultSpeed);
            document.readyState === 'loading'
                ? document.addEventListener('DOMContentLoaded', () => this.onPageReady())
                : this.onPageReady();
            this.setupSPASupport();
            this.addGlobalStyles();
            state.initialized = true;
        }

        onPageReady() {
            this.processExistingVideos();
            this.setupMutationObserver();
            document.addEventListener('visibilitychange', () => {
                !document.hidden && setTimeout(() => this.processExistingVideos(), 100);
            });
        }

        processExistingVideos() {
            document.querySelectorAll('video').forEach(v => this.addVideoController(v));
            this.cleanupInvalidVideos();
        }

        cleanupInvalidVideos() {
            state.videoMap.forEach((_, v) => !this.isVideoValid(v) && this.removeVideoController(v));
        }

        addVideoController(video) {
            if (state.videoMap.has(video) || !this.isVideoValid(video)) return;
            const speed = state.videoSpeedMap.get(video.src) || state.currentSpeed;
            this.applySpeedToVideo(video, speed);
            this.createSpeedIndicator(video);
            this.watchVideoChanges(video);
        }

        isVideoValid(v) {
            if (!v || v.tagName !== 'VIDEO' || !document.contains(v)) return false;
            const s = window.getComputedStyle(v);
            return s.display !== 'none' && s.visibility !== 'hidden';
        }

        applySpeedToVideo(video, speed) {
            if (state.isSettingSpeed) return;
            try {
                state.isSettingSpeed = true;
                video.playbackRate = video.defaultPlaybackRate = speed;
                video.src && state.videoSpeedMap.set(video.src, speed);
                !video.paused && video.play().catch(() => {});
                state.currentSpeed = speed;
            } catch (e) { console.warn('设置速度失败', e); }
            finally { setTimeout(() => state.isSettingSpeed = false, 10); }
        }

        createSpeedIndicator(video) {
            if (state.videoMap.has(video)) return;
            const ind = document.createElement('div');
            ind.className = 'video-speed-indicator';
            Object.assign(ind.style, {
                position: 'absolute', left: '10px', top: '10px',
                fontSize: CONFIG.indicator.fontSize, fontFamily: CONFIG.indicator.fontFamily,
                color: CONFIG.indicator.textColor, backgroundColor: CONFIG.indicator.bgColor,
                padding: CONFIG.indicator.padding, borderRadius: CONFIG.indicator.borderRadius,
                zIndex: CONFIG.indicator.zIndex, cursor: 'pointer', userSelect: 'none',
                opacity: 0.9, transition: 'opacity 0.3s, transform 0.2s',
                textShadow: '1px 1px 2px rgba(0,0,0,0.8)', pointerEvents: 'auto',
                backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)', touchAction: 'none'
            });
            this.updateIndicatorText(ind, state.currentSpeed);
            const container = this.getVideoContainer(video);
            if (!container) return;
            container.style.position === 'static' && (container.style.position = 'relative');
            container.appendChild(ind);
            state.videoMap.set(video, ind);
            this.bindIndicatorEvents(ind, video);
            this.setupHoverEffects(ind);
            this.positionIndicator(ind, container);
        }

        getVideoContainer(v) {
            let el = v.parentElement, d = 5;
            while (el && d--) {
                const s = window.getComputedStyle(el);
                if (s.position !== 'static' || el.clientWidth > v.clientWidth * 0.8) return el;
                el = el.parentElement;
            }
            return v.parentElement;
        }

        positionIndicator(ind, c) {
            const cr = c.getBoundingClientRect(), ir = ind.getBoundingClientRect();
            if (cr.width <= 0 || cr.height <= 0) return;
            ind.style.left = Math.max(5, Math.min(10, cr.width - ir.width - 10)) + 'px';
            ind.style.top = Math.max(5, Math.min(10, cr.height - ir.height - 10)) + 'px';
        }

        bindIndicatorEvents(ind, v) {
            ind.onclick = e => {
                e.stopPropagation(); e.preventDefault();
                state.clickTimeout && clearTimeout(state.clickTimeout);
                state.clickTimeout = setTimeout(() => this.cycleSpeed(v), 300);
            };
            ind.oncontextmenu = e => {
                e.stopPropagation(); e.preventDefault();
                this.showCustomSpeedDialog(v);
            };
            ind.ondblclick = e => {
                e.stopPropagation(); e.preventDefault();
                state.clickTimeout && clearTimeout(state.clickTimeout);
                this.setGlobalSpeed(CONFIG.defaultSpeed);
            };
            ind.onmousedown = e => { e.stopPropagation(); e.preventDefault(); };
        }

        setupHoverEffects(ind) {
            ind.onmouseenter = () => { ind.style.opacity = '1'; ind.style.transform = 'scale(1.1)'; };
            ind.onmouseleave = () => { ind.style.opacity = '0.9'; ind.style.transform = 'scale(1)'; };
        }

        cycleSpeed(v) {
            const i = (CONFIG.speedOptions.indexOf(state.currentSpeed) + 1) % CONFIG.speedOptions.length;
            this.setGlobalSpeed(CONFIG.speedOptions[i], v);
        }

        setGlobalSpeed(speed, sourceVideo = null) {
            if (state.isSettingSpeed) return;
            state.currentSpeed = speed;
            state.videoMap.forEach((_, v) => {
                v === sourceVideo ? this.applySpeedToVideo(v, speed) : setTimeout(() => this.applySpeedToVideo(v, speed), 0);
            });
            this.updateAllIndicators();
        }

        updateAllIndicators() {
            state.videoMap.forEach((ind, v) => {
                ind && ind.isConnected ? this.updateIndicatorText(ind, state.currentSpeed) : state.videoMap.delete(v);
            });
        }

        updateIndicatorText(ind, speed) {
            ind.textContent = speed.toFixed(2) + 'x';
            ind.title = `当前: ${speed.toFixed(2)}倍速\n左键切换: ${CONFIG.speedOptions.join('→')}\n右键自定义\n双击重置${CONFIG.defaultSpeed}x`;
        }

        showCustomSpeedDialog(v) {
            const val = prompt(`请输入速度(0.1-16)\n预设:${CONFIG.speedOptions}\n历史:${state.customSpeeds.slice(-5)}`, state.currentSpeed);
            if (val === null) return;
            const s = parseFloat(val);
            if (!isNaN(s) && s >= 0.1 && s <= 16) {
                this.setGlobalSpeed(s, v);
                !state.customSpeeds.includes(s) && state.customSpeeds.push(s) && state.customSpeeds.length > 10 && state.customSpeeds.shift();
                localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.customSpeeds));
            } else alert('请输入0.1-16之间的有效数值');
        }

        setupMutationObserver() {
            state.observer?.disconnect();
            state.observer = new MutationObserver(() => {
                setTimeout(() => this.processExistingVideos(), 100);
            });
            state.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src','style','class'] });
        }

        watchVideoChanges(v) {
            const obs = new MutationObserver(() => {
                const ind = state.videoMap.get(v);
                ind && this.positionIndicator(ind, this.getVideoContainer(v));
                setTimeout(() => this.applySpeedToVideo(v, state.videoSpeedMap.get(v.src) || state.currentSpeed), 100);
            });
            obs.observe(v, { attributes: true, attributeFilter: ['src','width','height','style','class'] });
            v._obs = obs;
        }

        removeVideoController(v) {
            const ind = state.videoMap.get(v);
            ind && ind.parentElement && ind.parentElement.removeChild(ind);
            v._obs?.disconnect();
            state.videoMap.delete(v);
        }

        setupSPASupport() {
            const wrap = (fn) => function(...a) { fn.apply(this, a); window.dispatchEvent(new Event('locationchange')); };
            history.pushState = wrap(history.pushState);
            history.replaceState = wrap(history.replaceState);
            window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
            window.addEventListener('locationchange', () => setTimeout(() => this.processExistingVideos(), 1500));
        }

        addGlobalStyles() {
            if (document.querySelector('#vsc-style')) return;
            const s = document.createElement('style');
            s.id = 'vsc-style';
            s.textContent = `.video-speed-indicator{position:absolute!important;z-index:${CONFIG.indicator.zIndex}!important;pointer-events:auto!important}.video-speed-indicator:hover{opacity:1!important;transform:scale(1.1)!important}video::-webkit-media-controls{z-index:999998!important}.video-speed-indicator:active{transform:scale(0.95)!important}`;
            document.head.appendChild(s);
        }
    }

    const init = () => {
        if (!window.vsc) window.vsc = new VideoSpeedController();
    };

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init)
        : setTimeout(init, 1000);
    window.addEventListener('load', init);
})();
