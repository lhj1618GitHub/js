// ==UserScript==
// @name         网页翻译器
// @description  支持整页分段流式翻译（英/日/韩 → 中文）
// @version      9.0
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      transmart.qq.com
// @connect      api-free.deepl.com
// @connect      api.deepl.com
// @run-at       document-end
// ==/UserScript==
(async () => {
  'use strict';
  try { if (document.contentType === 'application/xml') return } catch (_) {}

  // 读取悬浮按钮显示状态
  const floatButtonVisible = GM_getValue('floatButtonVisible', true);

  // ══════════════════════════════════════════════════════════
  // 配置读取（目标语言固定为简体中文）
  // ══════════════════════════════════════════════════════════
  const [
    _engine,
    _autoMode,
    _excludedHosts,
    _pos
  ] = await Promise.all([
    GM_getValue('engine', 'tencent'),
    GM_getValue('autoMode', false),
    GM_getValue('excludedHosts', '[]'),
    GM_getValue('uiPos', JSON.stringify({ right: 20, bottom: 20 }))
  ]);
  let currentEngine = _engine;
  const targetLang = 'zh-CN';
  let autoMode = _autoMode;
  let excludedHosts = JSON.parse(_excludedHosts);
  let uiPos = JSON.parse(_pos);
  let translateUI = null; // 保存悬浮按钮DOM

  // 更新面板中「按钮显示」三态高亮
  function updateVisModeHighlight(mode) {
    const el = document.getElementById('tuVisModes');
    if (!el) return;
    el.querySelectorAll('button').forEach(x => {
      x.classList.toggle('on', x.dataset.v === mode);
    });
  }

  // 菜单命令
  if (excludedHosts.includes(location.host)) {
    GM_registerMenuCommand('✅ 在此网站重新启用翻译', () => {
      const idx = excludedHosts.indexOf(location.host);
      if (idx > -1) excludedHosts.splice(idx, 1);
      GM_setValue('excludedHosts', JSON.stringify(excludedHosts));
      location.reload();
    });
    return;
  }

  // 显示/隐藏悬浮按钮 菜单（持久化切换；也可用于从「临时隐藏」状态恢复）
  GM_registerMenuCommand('🔘 显示/隐藏悬浮按钮', () => {
    const currentlyVisible = translateUI && translateUI.style.display !== 'none';
    if (currentlyVisible) {
      GM_setValue('floatButtonVisible', false);
      if (translateUI) translateUI.style.display = 'none';
    } else {
      GM_setValue('floatButtonVisible', true);
      if (translateUI) translateUI.style.display = 'block';
      updateVisModeHighlight('show');
    }
  });

  // ══════════════════════════════════════════════════════════
  // 翻译引擎（Tencent / DeepL，目标语言固定中文）
  // ══════════════════════════════════════════════════════════
  const Engine = {
    tencent: {
      name: 'Tencent', _clientKey: null,
      getClientKey() { if (this._clientKey) return this._clientKey; this._clientKey = 'browser-chrome-120.0-Windows_10-' + crypto.randomUUID() + '-' + Date.now(); return this._clientKey; },
      langCode() { return 'zh'; },
      async translate(text) {
        const r = await gmFetch({ method: 'POST', url: 'https://transmart.qq.com/api/imt', headers: { 'Content-Type': 'application/json' }, data: JSON.stringify({ header: { fn: 'auto_translation', session: '', client_key: this.getClientKey(), user: '' }, type: 'plain', model_category: 'normal', text_domain: 'general', source: { lang: 'auto', text_list: [text] }, target: { lang: 'zh' } }), });
        if (r.status !== 200) throw new Error('Tencent error'); return JSON.parse(r.responseText).auto_translation[0];
      },
      async translateBatch(texts) {
        const r = await gmFetch({ method: 'POST', url: 'https://transmart.qq.com/api/imt', headers: { 'Content-Type': 'application/json' }, data: JSON.stringify({ header: { fn: 'auto_translation', session: '', client_key: this.getClientKey(), user: '' }, type: 'plain', model_category: 'normal', text_domain: 'general', source: { lang: 'auto', text_list: texts }, target: { lang: 'zh' } }), });
        if (r.status !== 200) throw new Error('Tencent batch error'); return JSON.parse(r.responseText).auto_translation;
      }
    },
    deepl: {
      name: 'DeepL',
      apiKey: '295c901b-8af5-4df9-953c-a83a18005f56:fx',
      get endpoint() {
        return this.apiKey.endsWith(':fx')
          ? 'https://api-free.deepl.com/v2/translate'
          : 'https://api.deepl.com/v2/translate';
      },
      langCode() { return 'ZH'; },
      async translate(text) {
        const arr = await this.translateBatch([text]);
        return arr[0];
      },
      async translateBatch(texts) {
        if (!texts || texts.length === 0) return [];
        const r = await gmFetch({
          method: 'POST',
          url: this.endpoint,
          headers: {
            'Authorization': 'DeepL-Auth-Key ' + this.apiKey,
            'Content-Type': 'application/json'
          },
          data: JSON.stringify({ text: texts, target_lang: 'ZH' })
        });
        if (r.status !== 200) throw new Error('DeepL error ' + r.status);
        const data = JSON.parse(r.responseText);
        const arr = (data.translations || []).map(t => t.text);
        const out = new Array(texts.length).fill(null);
        for (let i = 0; i < Math.min(arr.length, out.length); i++) out[i] = arr[i];
        return out;
      }
    }
  };

  // 迁移旧配置：若保存的引擎已不存在，回落到 tencent
  if (!Engine[currentEngine]) currentEngine = 'tencent';

  const Utils = {
    escapeHTML(t) { const d = document.createElement('div'); d.appendChild(document.createTextNode(t)); return d.innerHTML; },
    unescapeHTML(t) { const d = new DOMParser().parseFromString(t, 'text/html'); return d.documentElement.textContent; }
  };
  function gmFetch(opts) { return new Promise((resolve, reject) => { GM_xmlhttpRequest({ timeout: 20000, ...opts, onload: resolve, onerror: reject, ontimeout: reject }); }); }
  const cache = new Map();
  const MAX_CACHE = 3000;
  function cacheGet(t) { return cache.get(t); }
  function cacheSet(t, v) { if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value); cache.set(t, v); }
  async function translate(text) {
    if (!text || !text.trim()) return null;
    const trimmed = text.trim(); if (/^\d+$/.test(trimmed)) return null;
    const cached = cacheGet(trimmed); if (cached) return cached;
    try {
      const result = await Engine[currentEngine].translate(trimmed);
      if (result && result !== trimmed) { cacheSet(trimmed, result); return result; }
    } catch (_) {}
    return null;
  }
  async function batchTranslate(texts) {
    const results = new Array(texts.length).fill(null);
    const uncached = [], uncachedIdx = [];
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i].trim();
      if (!t || /^\d+$/.test(t)) continue;
      const c = cacheGet(t); if (c) { results[i] = c; continue; }
      uncached.push(t); uncachedIdx.push(i);
    }
    if (uncached.length === 0) return results;
    const engine = Engine[currentEngine];
    if (engine.translateBatch && uncached.length > 1) {
      try {
        const BATCH_SIZE = 25;
        const chunks = [];
        for (let b = 0; b < uncached.length; b += BATCH_SIZE) { chunks.push({ texts: uncached.slice(b, b + BATCH_SIZE), idxs: uncachedIdx.slice(b, b + BATCH_SIZE) }); }
        await Promise.all(chunks.map(async ({ texts: chunk, idxs }) => {
          try {
            const batchResults = await engine.translateBatch(chunk);
            if (batchResults) {
              for (let j = 0; j < batchResults.length; j++) {
                if (batchResults[j] && batchResults[j] !== chunk[j]) { cacheSet(chunk[j], batchResults[j]); results[idxs[j]] = batchResults[j]; }
              }
            }
          } catch (_) {}
        }));
        return results;
      } catch (e) {}
    }
    const CONCURRENCY = 4;
    for (let i = 0; i < uncached.length; i += CONCURRENCY) {
      const batch = uncached.slice(i, i + CONCURRENCY);
      const batchIdx = uncachedIdx.slice(i, i + CONCURRENCY);
      await Promise.allSettled(batch.map(async (text, j) => { const r = await translate(text); if (r) results[batchIdx[j]] = r; }));
    }
    return results;
  }
  const SKIP_TAGS = /^(script|style|code|pre|svg|math|noscript|iframe|canvas|video|audio|img|br|hr|input|select|option|textarea)$/i;
  const SKIP_CLASS = /translate-ui|notranslate|katex|mathjax/i;
  function shouldSkip(node) {
    if (!node) return true;
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (SKIP_TAGS.test(node.tagName)) return true;
      if (SKIP_CLASS.test(node.className)) return true;
      if (node.isContentEditable) return true;
      if (node.dataset && node.dataset.translated) return true;
    }
    return false;
  }

  // ── 语言检测：仅支持英/日/韩 → 中文 ──
  function isChineseText(text) {
    return /^[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\s\d\p{P}]+$/u.test(text.trim());
  }
  function isJapaneseText(text) {
    return /[\u3040-\u309f\u30a0-\u30ff]/.test(text);
  }
  function isKoreanText(text) {
    return /[\uac00-\ud7af\u1100-\u11ff]/.test(text);
  }
  function isEnglishText(text) {
    const t = text.trim();
    if (!t) return false;
    if (/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(t)) return false;
    return /[a-zA-Z]/.test(t);
  }
  function isSupportedSourceText(text) {
    if (!text || !text.trim()) return false;
    const t = text.trim();
    if (isChineseText(t)) return false;
    return isJapaneseText(t) || isKoreanText(t) || isEnglishText(t);
  }

  function collectTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (shouldSkip(node.parentElement)) return NodeFilter.FILTER_REJECT;
        const text = node.textContent.trim();
        if (!text || text.length < 2 || /^\d+$/.test(text)) return NodeFilter.FILTER_REJECT;
        if (!isSupportedSourceText(text)) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.dataset?.translated) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }
  function collectPlaceholders(root) {
    return [...root.querySelectorAll('input[placeholder], textarea[placeholder]')]
      .filter(el => !el.dataset.translated && el.placeholder.trim() && isSupportedSourceText(el.placeholder));
  }

  // ══════════════════════════════════════════════════════════
  // 分段流式翻译
  // ══════════════════════════════════════════════════════════
  const SEGMENT_SIZE = 8;        // 每段包含的文本条数
  const SEGMENT_CONCURRENCY = 3; // 同时处理的段数
  const translatedTextNodes = new Set();     // 记录所有被替换过文本的节点
  const originalTextMap = new WeakMap();     // 节点 -> 原文

  function applyResults(metas, results) {
    for (let i = 0; i < metas.length; i++) {
      if (!results[i]) continue;
      const meta = metas[i];
      if (meta.type === 'text') {
        const node = meta.node;
        if (!node.isConnected) continue;
        const parent = node.parentElement;
        if (!parent) continue;
        if (!originalTextMap.has(node)) {
          originalTextMap.set(node, node.textContent);
          translatedTextNodes.add(node);
        }
        parent.dataset.translated = '1';
        node.textContent = results[i];
      } else {
        const el = meta.el;
        if (!el.isConnected) continue;
        el.dataset.originalPlaceholder = el.placeholder;
        el.placeholder = results[i];
        el.dataset.translated = '1';
      }
    }
  }

  let isTranslating = false;
  let pendingRoot = null;
  async function translatePage(root) {
    if (isTranslating) { pendingRoot = root || document.body; return; }
    isTranslating = true;
    try {
      root = root || document.body;
      do {
        pendingRoot = null;
        const textNodes = collectTextNodes(root);
        const placeholders = collectPlaceholders(root);
        if (textNodes.length === 0 && placeholders.length === 0) break;

        const allMeta = [];
        for (const node of textNodes) allMeta.push({ type: 'text', node });
        for (const el of placeholders) allMeta.push({ type: 'ph', el });

        // 切段
        const segments = [];
        for (let i = 0; i < allMeta.length; i += SEGMENT_SIZE) {
          segments.push(allMeta.slice(i, i + SEGMENT_SIZE));
        }

        // 并发 worker：每段完成立即应用，做到「分段翻译、及时显示」
        let cursor = 0;
        const worker = async () => {
          while (cursor < segments.length) {
            const seg = segments[cursor++];
            const texts = seg.map(m => {
              if (m.type === 'text') return m.node.isConnected ? m.node.textContent.trim() : '';
              return m.el.isConnected ? m.el.placeholder.trim() : '';
            });
            let results;
            try {
              results = await batchTranslate(texts);
            } catch (_) {
              results = new Array(texts.length).fill(null);
            }
            applyResults(seg, results);
          }
        };
        const workerCount = Math.min(SEGMENT_CONCURRENCY, segments.length);
        const workers = [];
        for (let i = 0; i < workerCount; i++) workers.push(worker());
        await Promise.all(workers);

        if (pendingRoot) { root = pendingRoot; }
      } while (pendingRoot);
    } finally { isTranslating = false; }
  }

  function restorePage() {
    for (const node of translatedTextNodes) {
      if (node.isConnected && originalTextMap.has(node)) {
        node.textContent = originalTextMap.get(node);
      }
    }
    translatedTextNodes.clear();
    document.querySelectorAll('[data-translated]').forEach(el => {
      if (el.dataset.originalPlaceholder) { el.placeholder = el.dataset.originalPlaceholder; delete el.dataset.originalPlaceholder; }
      delete el.dataset.translated;
    });
  }

  let lastHeight = 0;
  function onScroll() { const h = document.documentElement.scrollHeight; if (h > lastHeight) { lastHeight = h; if (autoMode) translatePage(); } }
  let mutationRafId = null;
  const pendingMutationRoots = new Set();
  const observer = new MutationObserver((mutations) => {
    if (!autoMode) return;
    for (const m of mutations) { for (const node of m.addedNodes) { if (node.nodeType === Node.ELEMENT_NODE && !shouldSkip(node)) { pendingMutationRoots.add(node); } } }
    if (pendingMutationRoots.size > 0 && !mutationRafId) {
      mutationRafId = setTimeout(() => {
        mutationRafId = null;
        const roots = [...pendingMutationRoots]; pendingMutationRoots.clear();
        if (roots.length > 5) { translatePage(document.body); } else { roots.forEach(r => translatePage(r)); }
      }, 200);
    }
  });

  // ══════════════════════════════════════════════════════════
  // UI 构建
  // ══════════════════════════════════════════════════════════
  function isPageInTargetLang() {
    const lang = (document.documentElement.lang || '').split('-')[0].toLowerCase();
    return lang === 'zh';
  }

  let _initialized = false;
  function initWhenBodyReady() {
    const startInit = () => {
      if (_initialized) return;
      if (!document.body) {
        setTimeout(startInit, 50);
        return;
      }
      init();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startInit, { once: true });
      setTimeout(startInit, 2000); // 兜底
    } else {
      startInit();
    }
  }

  async function init() {
    if (_initialized) return;
    _initialized = true;
    lastHeight = document.documentElement.scrollHeight;
    GM_addStyle(
      '.translate-ui{position:fixed;z-index:999999;font-family:system-ui,-apple-system,sans-serif;touch-action:none}' +
      '.translate-ui *{box-sizing:border-box;margin:0;padding:0}' +
      '.tu-btn{width:42px;height:42px;border-radius:50%;border:none;background:rgba(0,0,0,0.5);color:#fff;cursor:grab;' +
        'display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);' +
        'box-shadow:0 2px 8px rgba(0,0,0,0.15);transition:transform .2s,background .2s}' +
      '.tu-btn:active{cursor:grabbing;transform:scale(0.9)}' +
      '.tu-btn.active{background:rgba(34,128,255,0.8)}' +
      '.tu-panel{position:absolute;bottom:52px;right:0;width:240px;max-height:80vh;overflow-y:auto;' +
        'background:rgba(255,255,255,0.97);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
        'border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.12);padding:12px;display:none;color:#333;font-size:13px}' +
      '.tu-panel.show{display:block}' +
      '.tu-panel label{display:block;margin:8px 0 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px}' +
      '.tu-panel select{width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;' +
        'background:#fff;color:#333;outline:none;appearance:auto}' +
      '.tu-panel select:focus{border-color:#4a9eff}' +
      '.tu-status{margin-top:8px;padding:6px;background:#f8f8f8;border-radius:6px;font-size:11px;color:#666;text-align:center}' +
      '.tu-vis-modes{display:flex;margin-top:6px;background:#f0f0f0;border-radius:8px;padding:2px;gap:2px}' +
      '.tu-vis-modes button{flex:1;padding:6px 0;border:none;border-radius:6px;font-size:11px;cursor:pointer;' +
        'background:transparent;color:#999;transition:all .15s;font-weight:500;white-space:nowrap}' +
      '.tu-vis-modes button.on{background:#fff;color:#333;box-shadow:0 1px 3px rgba(0,0,0,0.1)}' +
      '.tu-switch-row{display:flex;align-items:center;justify-content:space-between;margin-top:12px;font-size:12px;color:#666}' +
      '.tu-switch{position:relative;display:inline-block;width:36px;height:20px;flex-shrink:0}' +
      '.tu-switch input{opacity:0;width:0;height:0}' +
      '.tu-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#ccc;transition:.2s;border-radius:20px}' +
      '.tu-slider:before{position:absolute;content:"";height:16px;width:16px;left:2px;bottom:2px;background:#fff;transition:.2s;border-radius:50%}' +
      '.tu-switch input:checked + .tu-slider{background:#4a9eff}' +
      '.tu-switch input:checked + .tu-slider:before{transform:translateX(16px)}' +
      '.tu-row{display:flex;gap:6px;margin-top:10px}' +
      '.tu-row button{flex:1;padding:7px 0;border:none;border-radius:6px;font-size:12px;cursor:pointer;' +
        'transition:background .2s}' +
      '.tu-row .tu-restore{background:#f0f0f0;color:#555}' +
      '.tu-row .tu-go{background:#4a9eff;color:#fff}' +
      '.tu-row .tu-exclude{background:#ff6b6b;color:#fff;font-size:11px}' +
      '@media(prefers-color-scheme:dark){' +
        '.tu-panel{background:rgba(30,30,30,0.97);color:#eee}' +
        '.tu-panel select{background:#2a2a2a;color:#eee;border-color:#444}' +
        '.tu-row .tu-restore{background:#333;color:#ccc}' +
        '.tu-status{background:#222;color:#999}' +
        '.tu-vis-modes{background:#333}' +
        '.tu-vis-modes button.on{background:#444;color:#eee}' +
        '.tu-switch-row{color:#aaa}' +
        '.tu-slider{background:#555}' +
        '.tu-switch input:checked + .tu-slider{background:#4a9eff}' +
      '}'
    );
    const ui = document.createElement('div');
    ui.className = 'translate-ui';
    ui.style.right = uiPos.right + 'px';
    ui.style.bottom = uiPos.bottom + 'px';
    ui.style.display = floatButtonVisible ? 'block' : 'none';
    translateUI = ui;

    ui.innerHTML =
      '<div class="tu-panel" id="tuPanel">' +
        '<label>按钮显示</label>' +
        '<div class="tu-vis-modes" id="tuVisModes">' +
          '<button data-v="show" class="on">显示</button>' +
          '<button data-v="temp">临时隐藏</button>' +
          '<button data-v="permanent">永久隐藏</button>' +
        '</div>' +
        '<label>翻译引擎</label>' +
        '<select id="tuEngine">' +
          '<option value="tencent">Tencent</option>' +
          '<option value="deepl">DeepL</option>' +
        '</select>' +
        '<div class="tu-switch-row">' +
          '<span>自动翻译</span>' +
          '<label class="tu-switch"><input type="checkbox" id="tuAuto"><span class="tu-slider"></span></label>' +
        '</div>' +
        '<div class="tu-status" id="tuStatus">Ready</div>' +
        '<div class="tu-row">' +
          '<button class="tu-restore" id="tuRestore">还原</button>' +
          '<button class="tu-go" id="tuGo">翻译</button>' +
        '</div>' +
        '<div class="tu-row">' +
          '<button class="tu-exclude" id="tuExclude">排除此站</button>' +
        '</div>' +
      '</div>' +
      '<button class="tu-btn' + (autoMode ? ' active' : '') + '" id="tuBtn" draggable="false">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/>' +
        '</svg>' +
      '</button>';
    document.body.appendChild(ui);
    const btn = document.getElementById('tuBtn');
    const panel = document.getElementById('tuPanel');
    const engineSelect = document.getElementById('tuEngine');
    const statusEl = document.getElementById('tuStatus');
    const autoToggle = document.getElementById('tuAuto');
    const visModesEl = document.getElementById('tuVisModes');
    engineSelect.value = currentEngine;
    autoToggle.checked = autoMode;
    updateVisModeHighlight(floatButtonVisible ? 'show' : 'permanent');

    // ─── 拖拽逻辑 ───
    let isDragging = false;
    let startX, startY, startRight, startBottom;
    let hasMoved = false;

    btn.addEventListener('pointerdown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startRight = parseInt(ui.style.right);
      startBottom = parseInt(ui.style.bottom);
      hasMoved = false;
      btn.setPointerCapture(e.pointerId);
    });

    btn.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = startX - e.clientX;
      const dy = startY - e.clientY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasMoved = true;
      let newRight = startRight + dx;
      let newBottom = startBottom + dy;
      const maxX = window.innerWidth - ui.offsetWidth;
      const maxY = window.innerHeight - ui.offsetHeight;
      newRight = Math.max(0, Math.min(newRight, maxX));
      newBottom = Math.max(0, Math.min(newBottom, maxY));
      ui.style.right = newRight + 'px';
      ui.style.bottom = newBottom + 'px';
    });

    btn.addEventListener('pointerup', (e) => {
      if (!isDragging) return;
      isDragging = false;
      if (hasMoved) {
        uiPos = { right: parseInt(ui.style.right), bottom: parseInt(ui.style.bottom) };
        GM_setValue('uiPos', JSON.stringify(uiPos));
      }
    });

    function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }
    btn.addEventListener('click', (e) => {
      if (hasMoved) return;
      e.stopPropagation();
      panel.classList.toggle('show');
    });
    document.addEventListener('click', (e) => { if (!ui.contains(e.target)) panel.classList.remove('show'); });
    engineSelect.addEventListener('change', () => {
      currentEngine = engineSelect.value;
      GM_setValue('engine', currentEngine);
      cache.clear();
      setStatus('Engine: ' + (Engine[currentEngine] ? Engine[currentEngine].name : currentEngine));
    });

    // ─── 按钮显示三态切换 ───
    visModesEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      const v = b.dataset.v;
      if (b.classList.contains('on')) return; // 已是当前状态

      if (v === 'show') {
        // 当前按钮可见才能打开面板，正常情况已是「显示」；此分支作为保险
        if (!confirm('确定要显示悬浮按钮吗？')) return;
        GM_setValue('floatButtonVisible', true);
        ui.style.display = 'block';
        updateVisModeHighlight('show');
        setStatus('已显示悬浮按钮');
        return;
      }

      if (v === 'temp') {
        if (!confirm('确定要临时隐藏悬浮按钮吗？\n\n本次会话将不再显示，刷新页面后自动恢复。')) return;
        panel.classList.remove('show');
        ui.style.display = 'none'; // 不写入持久化配置
        return;
      }

      if (v === 'permanent') {
        if (!confirm('确定要永久隐藏悬浮按钮吗？\n\n以后刷新页面也不会显示，可通过油猴菜单「显示/隐藏悬浮按钮」恢复。')) return;
        GM_setValue('floatButtonVisible', false);
        panel.classList.remove('show');
        ui.style.display = 'none';
        return;
      }
    });

    // 自动翻译开关
    autoToggle.addEventListener('change', async () => {
      autoMode = autoToggle.checked;
      GM_setValue('autoMode', autoMode);
      if (autoMode) {
        btn.classList.add('active');
        if (!isPageInTargetLang()) {
          setStatus('自动翻译中...');
          var start = performance.now();
          await translatePage();
          setStatus('完成 (' + ((performance.now() - start) / 1000).toFixed(1) + 's)');
        } else {
          setStatus('自动翻译已开启');
        }
      } else {
        setStatus('自动翻译已关闭');
      }
    });

    // 手动翻译：只翻译当前页面一次，不改变自动翻译开关
    document.getElementById('tuGo').addEventListener('click', async () => {
      panel.classList.remove('show'); btn.classList.add('active');
      restorePage(); cache.clear();
      lastHeight = document.documentElement.scrollHeight;
      setStatus('翻译中...');
      var start = performance.now();
      await translatePage();
      setStatus('完成 (' + ((performance.now() - start) / 1000).toFixed(1) + 's)');
    });

    document.getElementById('tuRestore').addEventListener('click', () => {
      panel.classList.remove('show'); btn.classList.remove('active');
      autoMode = false; GM_setValue('autoMode', false);
      autoToggle.checked = false;
      restorePage(); setStatus('已还原');
    });

    document.getElementById('tuExclude').addEventListener('click', () => {
      if (!excludedHosts.includes(location.host)) {
        excludedHosts.push(location.host);
        GM_setValue('excludedHosts', JSON.stringify(excludedHosts));
      }
      location.reload();
    });

    window.addEventListener('scroll', onScroll, { passive: true });
    observer.observe(document.body, { childList: true, subtree: true });

    // 初始化时若自动翻译开关已开启（老用户配置），按原逻辑自动翻译
    if (autoMode && !isPageInTargetLang()) {
      queueMicrotask(async () => {
        setStatus('自动翻译中...');
        var start = performance.now();
        await translatePage();
        setStatus('完成 (' + ((performance.now() - start) / 1000).toFixed(1) + 's)');
      });
    }
  }
  initWhenBodyReady();
})();