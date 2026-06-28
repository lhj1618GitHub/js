// ==UserScript==
// @name         链接净化
// @namespace    https://gitcode.com/lhj1618/Tool/releases/js
// @author       lhj1618
// @version      1.1
// @description  页面加载前净化URL，支持 rsv_* / utm_* 通配符批量删除追踪参数，多站点专属规则
// @match        *://*/*
// @exclude      /^https?:\/\/([a-z0-9-.]{0,52})(hdslb.com|csdnimg.cn)\/.*$/
// @run-at       document-start
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @license      MIT
// ==/UserScript==

(() => {
    const DELAY = {fast:600, normal:1000, slow:3000};
    const host = window.location.hostname;
    const href = window.location.href;
    const path = window.location.pathname;
    let topScroll = 0;
    const hostReg = /[a-z0-9-]{1,128}\.[a-z]{2,15}$/;

    // 全局通用追踪正则
    const baseTrackReg = new RegExp('^(spm|from_|ref_|track|trk|share_|embeds_|refer_)|_from$|scm|referrer');
    // 通用删除参数池（支持通配符写法如 utm_*、rsv_*）
    const commonParams = [
        'spm','mkt','src','from','source','alias','vd_source','brand','curator_clanid','snr','redir','sprefix',
        'utm_*','gclid','fbclid','tt_*','wx_*','track_*','ref','feature','_*'
    ];

    // 各站点专属追踪参数（支持通配符前缀匹配）
    const siteRule = {
        bili: {
            host: /(bilibili|biligame)\.com$/,
            params: ['vd_source','hotRank','launch_id','session_id','seid','buvid','from','pagefrom','spm_*','referfrom'],
            reg: /^(utm_|share_|spm|from_)|(From|_from|source)$/
        },
        baidu: {
            host: /baidu.com$/,
            params: ['rsv_*','oq','gpc','tn','eqid','entry','dyTabStr','ie','f','rqlang','inputT','bs']
        },
        bing: {
            host: /bing.com$/,
            params: ['qs','form','sp','lq','pq','sc','sk','cvid']
        },
        douyin: {
            host: /(douyin|tiktok)\.com$/,
            params: ['source','aid','enter_from','web_id','extra_params','tt_*']
        },
        csdn: {
            host: /csdn.net$/,
            params: ['ops_request_misc','request_id','biz_id','usp']
        },
        ali: {
            host: /(taobao|tmall|1688|fliggy|alimama)\.(com|hk|cn)$/,
            params: ['spm_*','acm','scm','scene','pvid','pvid2'],
            reg: /^(utm_|spm_|from_|ref|track|wh_|wx_)/
        },
        amazon: {
            host: /amazon\.[a-z.]{2,15}$/,
            params: ['qid','crid','sprefix','pd_rd_*','pf_rd_*'],
            reg: /_ref|^(utm_|ref|pd_rd_|pf_rd_|track|sc_)/i
        },
        youtube: {
            host: /youtube\.[a-z.]{2,15}$/,
            params: ['embeds_referring_euri','feature','redir_token','pp','ab_channel','pcampaignid']
        }
    };

    // 劫持history路由，自定义urlchange事件
    const _push = history.pushState;
    const _replace = history.replaceState;
    history.pushState = function(...args){
        const res = _push.apply(this, args);
        window.dispatchEvent(new Event('pushstate'));
        window.dispatchEvent(new Event('urlchange'));
        return res;
    };
    history.replaceState = function(...args){
        const res = _replace.apply(this, args);
        window.dispatchEvent(new Event('replacestate'));
        window.dispatchEvent(new Event('urlchange'));
        return res;
    };

    /**
     * 将带*通配符的参数列表转为匹配函数
     * @param {string[]} paramList 支持 utm_* / rsv_* 格式
     * @returns {(key:string)=>boolean} 匹配判断函数
     */
    function buildWildcardMatcher(paramList) {
        const prefixList = [];
        const exactList = [];
        for (const p of paramList) {
            if (p.endsWith('*')) {
                prefixList.push(p.slice(0, -1));
            } else {
                exactList.push(p);
            }
        }
        return function matchKey(key) {
            // 精确匹配
            if (exactList.includes(key)) return true;
            // 前缀通配匹配 xxx_*
            for (const pre of prefixList) {
                if (key.startsWith(pre)) return true;
            }
            return false;
        };
    }

    // 核心：清理当前页面地址栏
    function restoreUrl(params, extraReg=null) {
        const url = new URL(location.href);
        const sp = url.searchParams;
        const match = buildWildcardMatcher(params);
        // 遍历所有参数批量删除
        Array.from(sp.keys()).forEach(key=>{
            if(match(key) || baseTrackReg.test(key) || (extraReg && extraReg.test(key))) {
                sp.delete(key);
            }
        });
        if(url.href !== location.href) history.replaceState({}, '', url.href);
    }

    // 批量清洗页面所有a/area链接
    function cleanAllLinks(params, extraReg=null) {
        const match = buildWildcardMatcher(params);
        const scan = (els)=>{
            for(let el of els){
                if(!hostReg.test(el.hostname)) continue;
                const u = new URL(el.href);
                const sp = u.searchParams;
                Array.from(sp.keys()).forEach(key=>{
                    if(match(key) || baseTrackReg.test(key) || (extraReg && extraReg.test(key))) {
                        sp.delete(key);
                    }
                });
                if(el.href !== u.href) el.href = u.href;
            }
        };
        scan(document.getElementsByTagName('a'));
        scan(document.getElementsByTagName('area'));
    }

    // 延迟清洗
    function delayClean(params, reg, time) {
        setTimeout(()=>{
            restoreUrl(params, reg);
            cleanAllLinks(params, reg);
        }, time);
    }

    // 滚动/鼠标移动触发刷新链接
    function bindScrollMouse(params, reg) {
        window.onscroll = ()=>{
            const st = document.documentElement.scrollTop;
            if(Math.abs(st - topScroll) > 120){
                cleanAllLinks(params, reg);
                topScroll = st;
            }
        };
        let x=0,y=0;
        window.onpointermove = e=>{
            if(Math.abs(e.clientX-x)>20 || Math.abs(e.clientY-y)>20){
                cleanAllLinks(params, reg);
                x=e.clientX;y=e.clientY;
            }
        };
    }

    // 绑定点击事件，点击后自动清洗链接
    function bindClickClean(params, reg, delay) {
        setTimeout(()=>{
            const handler = ()=>delayClean(params, reg, 0);
            document.querySelectorAll('a,button,div,li').forEach(el=>{
                el.removeEventListener('click', handler);
                el.addEventListener('click', handler, true);
            });
        }, delay);
    }

    // 匹配当前站点规则
    let useParams = [...commonParams];
    let useReg = null;
    for(let r of Object.values(siteRule)){
        if(r.host.test(host)){
            useParams = [...commonParams, ...r.params];
            useReg = r.reg || null;
            break;
        }
    }
    // 移除自定义参数相关逻辑，不再读取存储
    const customParams = [];
    useParams.push(...customParams);

    // 页面初始化清洗
    restoreUrl(useParams, useReg);
    cleanAllLinks(useParams, useReg);
    // DOM加载后二次清洗
    document.addEventListener('DOMContentLoaded', ()=>{
        delayClean(useParams, useReg, DELAY.normal);
        bindClickClean(useParams, useReg, DELAY.fast);
        bindScrollMouse(useParams, useReg);
    });
    // 路由切换监听
    window.addEventListener('urlchange', ()=>{
        restoreUrl(useParams, useReg);
        cleanAllLinks(useParams, useReg);
    });

    // 已完全删除所有菜单、自定义参数存储、GM菜单相关代码
})();