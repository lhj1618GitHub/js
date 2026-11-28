// ==UserScript==
// @name         链接净化
// @namespace    https://gitcode.com/lhj1618/Tool/releases/js
// @author       lhj1618
// @version      2.0
// @description  页面加载前净化URL：白名单只保留必要字段（query/wd/id/page…），其余参数全部删除；支持通配符与站点专属必要字段
// @match        *://*/*
// @exclude      /^https?:\/\/([a-z0-9-.]{0,52})(hdslb.com|csdnimg.cn)\/.*$/
// @run-at       document-start
// @grant        none
// @license      MIT
// ==/UserScript==

(() => {
    const DELAY = {fast: 600, normal: 1000};
    const host = location.hostname;

    // 合法主机名（支持子域、多级后缀；非 http(s) 链接 hostname 为空会匹配失败）
    const hostReg = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

    // ===== 通用必要字段白名单（命中保留，其余全部删除） =====
    // 支持通配符 *，大小写不敏感
    const KEEP_PARAMS = [
        // —— 搜索 ——
        'q', 'query', 'queryString', 'wd', 'word', 'keyword', 'kw', 'search', 's', 'text',
        'k', 'key', 'searchText', 'search_query',
        // —— 分页 / 数量 ——
        'page', 'pageNum', 'pageNo', 'pageIndex', 'pageSize', 'pn', 'pageno',
        'offset', 'start', 'limit', 'size', 'count', 'num', 'rows', 'per_page', 'perpage',
        // —— 排序 / 筛选 / 分类 ——
        'sort', 'order', 'orderby', 'by', 'filter', 'tab', 'type', 'cat', 'category',
        'tag', 'section', 'channel', 'board', 'class', 'kind', 'genre',
        // —— 语言 / 地区 ——
        'lang', 'language', 'locale', 'hl', 'lr', 'gl', 'region', 'cc', 'setlang',
        // —— 资源标识（业务定位，不是追踪） ——
        'id', 'tid', 'fid', 'uid', 'pid', 'vid', 'aid', 'bid', 'gid', 'rid', 'mid',
        'cid', 'nid', 'sid', 'docid', 'articleId', 'postId', 'itemId', 'objectId',
        'topicId', 'albumId', 'photoId', 'modal_id', 'aweme_id', 'sec_uid',
        // —— 版本 / 视图 ——
        'v', 'ver', 'version', 'view', 'mode', 'layout', 'theme', 'format', 'fmt',
        // —— 时间定位（播放进度 / 区间） ——
        't', 'time', 'startTime', 'endTime', 'st', 'et'
    ];

    // ===== 站点额外必要字段（在通用白名单基础上追加） =====
    // 只列各站点特有、通用池覆盖不到的业务参数；追踪参数无需列出（白名单外默认删除）
    const siteKeep = {
        bilibili: {host: /(bilibili|biligame)\.com$/, keep: [
            'p', 't', 'cid', 'aid', 'bvid', 'oid', 'page', 'tab', 'keyword', 'search_type', 'order', 'sort'
        ]},
        baidu:    {host: /baidu\.com$/,              keep: ['wd', 'pn', 'rn', 'ie', 'oq', 'ct', 'f']},
        bing:     {host: /bing\.com$/,               keep: ['q', 'first', 'count', 'setlang', 'cc']},
        google:   {host: /google\.[a-z.]{2,15}$/,    keep: ['q', 'start', 'num', 'hl', 'lr', 'safe', 'tbm', 'udm']},
        douyin:   {host: /(douyin|tiktok|iesdouyin)\.com$/, keep: [
            'modal_id', 'vid', 'aweme_id', 'sec_uid', 'type'
        ]}
    };

    // 通配符匹配器：* 可出现在任意位置（utm_*、*_from、spm_*_from、*token*），大小写不敏感
    function buildMatcher(list) {
        const exact = new Set();
        const regs = [];
        const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        for (const raw of list) {
            const p = String(raw).trim();
            if (!p) continue;
            if (p.includes('*')) {
                regs.push(new RegExp('^' + p.split('*').map(esc).join('.*') + '$', 'i'));
            } else {
                exact.add(p.toLowerCase());
            }
        }
        return key => {
            const k = String(key).toLowerCase();
            if (exact.has(k)) return true;
            for (let i = 0; i < regs.length; i++) if (regs[i].test(k)) return true;
            return false;
        };
    }

    // 合并当前站点白名单
    let keepList = [...KEEP_PARAMS];
    for (const r of Object.values(siteKeep)) {
        if (r.host.test(host)) { keepList.push(...r.keep); break; }
    }
    const keepMatch = buildMatcher(keepList);

    /**
     * 精简 URL 的 search：仅保留白名单参数，保持原有顺序与多值
     * @returns {boolean} 是否发生了删除（true 表示 URL 被修改）
     */
    function prune(url) {
        const sp = url.searchParams;
        if (!sp.size) return false;
        const kept = [];
        let dropped = false;
        for (const [k, v] of sp) {
            if (keepMatch(k)) kept.push([k, v]);
            else dropped = true;
        }
        if (!dropped) return false;
        const next = new URLSearchParams();
        for (const [k, v] of kept) next.append(k, v);
        url.search = next.toString(); // 空结果会去掉 "?"
        return true;
    }

    // 清理地址栏
    function restoreUrl() {
        const url = new URL(location.href);
        if (prune(url)) history.replaceState({}, '', url.href);
    }

    // 清理单个 <a>/<area>
    function cleanAnchor(el) {
        if (!el.hostname || !hostReg.test(el.hostname)) return;
        let u;
        try { u = new URL(el.href); } catch (_) { return; }
        if (prune(u) && el.href !== u.href) el.href = u.href;
    }

    // 批量清理页面链接
    function cleanAllLinks() {
        const scan = els => { for (const el of els) cleanAnchor(el); };
        scan(document.getElementsByTagName('a'));
        scan(document.getElementsByTagName('area'));
    }

    // 劫持 history 路由，触发自定义 urlchange
    const _push = history.pushState;
    const _replace = history.replaceState;
    history.pushState = function (...a) {
        const r = _push.apply(this, a);
        window.dispatchEvent(new Event('urlchange'));
        return r;
    };
    history.replaceState = function (...a) {
        const r = _replace.apply(this, a);
        window.dispatchEvent(new Event('urlchange'));
        return r;
    };

    // —— 初始化 ——
    restoreUrl();
    cleanAllLinks();

    // DOM 就绪后二次清洗
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => { restoreUrl(); cleanAllLinks(); }, DELAY.normal);
    });

    // 点击时同步清洗目标链接（捕获阶段，赶在默认跳转前改 href）
    document.addEventListener('click', e => {
        const a = e.target && e.target.closest && e.target.closest('a[href]');
        if (a) cleanAnchor(a);
    }, true);

    // 路由切换后重新清洗
    window.addEventListener('urlchange', () => {
        restoreUrl();
        cleanAllLinks();
    });
})();