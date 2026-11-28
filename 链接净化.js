// ==UserScript==
// @name         链接净化
// @namespace    https://gitcode.com/lhj1618/Tool/releases/js
// @author       lhj1618
// @version      1.2
// @description  页面加载前净化URL，支持 rsv_* / utm_* / *_from 等通配符批量删除追踪参数，多站点专属规则
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

    // 合法主机名（支持子域名、多级后缀；空串/协议冒号等会匹配失败）
    const hostReg = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

    // 全局通用追踪正则：源词根 + 可选分隔符后缀；同时兼容 *_from / *_ref / *_source / referrer
    // 采用大小写不敏感，避免 UTM_Source 这类漏网
    const baseTrackReg = /^(spm|scm|track|tracking|trk|share|embed|embeds|refer|referrer|ref|from|source|src|alias|brand|mkt|feature|redir|sprefix|snr|vd_source)([._\-][a-z0-9_\-]*)?$|_from$|_ref$|_source$|_referrer$|^referrer$/i;

    // 通用删除参数池（支持通配符：前缀 utm_*、后缀 *_from、中缀 spm_*_from、包含 *token*）
    const commonParams = [
        // —— 广告 / 点击 ID ——
        'gclid','dclid','gbraid','wbraid','fbclid','msclkid','yclid','twclid','ttclid',
        'li_fat_id','igshid','igsh','ncid','cmpid','epik','s_kwcid','ef_id','rb_clickid',
        '_openstat','vero_id','_branch_match_id','_branch_referrer',
        // —— UTM / 营销 ——
        'utm_*','mkt_tok','mkt','mc_cid','mc_eid','oly_anon_id','oly_enc_id','__s',
        '_hsenc','_hsmi','hsCtaTracking','vero_conv','sfmc_id','elqTrackId','elqTrack',
        '_ga','_gl','_gac_*',
        // —— Adobe / 其它追踪 ——
        'sc_*','s_cid','trk_*','trk',
        // —— 中文站点常见来源 ——
        'spm','spm_*','scm','scm_*','src','from','source','alias','vd_source','brand',
        'curator_clanid','snr','redir','sprefix','feature','from_source','from_spmid','spmid',
        // —— 分享 ——
        'share_*','share','share_from','share_source','share_medium','share_channel',
        'tt_*','wx_*','wt_*','fb_*','fb_action_ids','fb_action_types','fb_source','fb_ref',
        // —— 其它 ——
        '__twitter_impression','isappinstalled','_*'
    ];

    // 各站点专属追踪参数（支持通配符前缀）
    const siteRule = {
        bili: {
            host: /(bilibili|biligame)\.com$/,
            params: ['vd_source','hotRank','launch_id','session_id','seid','buvid','from','pagefrom',
                     'spm_*','spm_id_from','spmid','from_source','from_spmid','share_source','share_medium',
                     'share_tag','share_from','share_plat','bbid','ts','is_story_h5','up_id','timestamp',
                     'unique_k','plat_id','referfrom','csource','seek_version'],
            reg: /^(utm_|share_|spm|from_)|(From|_from|source)$/i
        },
        baidu: {
            host: /baidu\.com$/,
            params: ['rsv_*','oq','gpc','tn','eqid','entry','dyTabStr','ie','f','rqlang','inputT','bs',
                     'rsv_spt','rsv_iqid','rsv_t','rsv_bp','rsv_dl','rsv_pq','rsv_sug1','rsv_sug2',
                     'rsv_sug3','rsv_sug4','rsv_sug5','rsv_sug6','rsv_sug7','rsv_sug8','rsv_sug9',
                     'rsv_enter','rsv_btype','rsv_ers','fenlei','wd2','rsv_lv','rsv_swap','hisfilter'],
            reg: /^rsv_/i
        },
        bing: {
            host: /bing\.com$/,
            params: ['qs','form','sp','lq','pq','sc','sk','cvid','cs','ghc','ghsh','ghacc','ghpl'],
            reg: /^gh/i
        },
        google: {
            host: /google\.[a-z.]{2,15}$/,
            params: ['gs_lcp','sxsrf','ei','sa','oi','ved','usg','gs_lcrp','sca_esv','uact','dlnr','biw','bih'],
            reg: null
        },
        douyin: {
            host: /(douyin|tiktok|iesdouyin)\.com$/,
            params: ['source','aid','enter_from','web_id','extra_params','tt_*','share_sign','share_version',
                     'share_token','share_link_id','from_aid','from_ssr','refer','ts','share_*'],
            reg: /^(utm_|share_|from_)/i
        },
        csdn: {
            host: /csdn\.net$/,
            params: ['ops_request_misc','request_id','biz_id','usp','spm_*','utm_*','sitetype','logfrom',
                     'sharer_shareid','sharer_sharetime'],
            reg: null
        },
        ali: {
            host: /(taobao|tmall|1688|fliggy|alimama)\.(com|hk|cn)$/,
            params: ['spm_*','acm','scm','scm_*','scene','pvid','pvid2','ali_trackid','ali_ab',
                     'abbucket','bxsign','ut_sk'],
            reg: /^(utm_|spm_|from_|ref|track|wh_|wx_|ali_)/i
        },
        amazon: {
            host: /amazon\.[a-z.]{2,15}$/,
            params: ['qid','crid','sprefix','pd_rd_*','pf_rd_*','psc','smid','ref_','refRID','sr','th','_encoding'],
            reg: /_ref|^(utm_|ref|pd_rd_|pf_rd_|track|sc_)/i
        },
        youtube: {
            host: /youtube\.[a-z.]{2,15}$/,
            params: ['embeds_referring_euri','feature','redir_token','pp','ab_channel','pcampaignid','si','featured'],
            reg: /^(si|feature|pp)$/i
        },
        zhihu: {
            host: /(zhihu|zhimg)\.com$/,
            params: ['utm_*','spm_*','share_code','s_r','s_s_i','s_q','share_source','zhida_source',
                     'utm_psn','edition','dt_dapp','share_token'],
            reg: null
        },
        xiaohongshu: {
            host: /(xiaohongshu|xhslink)\.com$/,
            params: ['share_id','share_from','appuid','apptime','app_platform','app_version',
                     'share_token','share_user_id','share_medium','share_channel','share_source',
                     'share_uid','xhsshare','xhs_share_source'],
            reg: /^(share_|utm_)/i
        },
        weibo: {
            host: /(weibo|sina)\.(com|cn)$/,
            params: ['from','refer_flag','source','sudaref','topnav','wvr','share_uid',
                     'mpshare','scene','subscene'],
            reg: null
        },
        jd: {
            host: /jd\.com$/,
            params: ['cu','utm_*','ad_od','ad_source','spm_*','scm_*','campaign_id','ad_creative_id','extension_id'],
            reg: /^(ad_|utm_|spm_|scm_)/i
        },
        kuaishou: {
            host: /kuaishou\.com$/,
            params: ['fid','cc','followRefer','shareToken','shareObjectId','shareMethod','shareId',
                     'shareResourceType','shareMode','share_*'],
            reg: /^share_/i
        },
        pdd: {
            host: /(pinduoduo|yangkeduo)\.com$/,
            params: ['refer_share_id','refer_share_uid','refer_share_channel','refer_share_form',
                     '_oak_share_by','_x_share_id','_x_share_source','refer_page_el_sn'],
            reg: /^(refer_share_|_x_share_|_oak_share_)/i
        }
    };

    // 劫持 history 路由，自定义 urlchange 事件
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
     * 通配符匹配器（v2）
     *  - 支持 * 出现在任意位置：'utm_*'、'*_from'、'spm_*_from'、'*token*'
     *  - 精确项转为 Set 做 O(1) 匹配，通配项预编译为正则
     *  - 全部大小写不敏感
     * @param {string[]} paramList
     * @returns {(key:string)=>boolean}
     */
    function buildWildcardMatcher(paramList) {
        const exactSet = new Set();
        const regexList = [];
        const escapeReg = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        for (const raw of paramList) {
            if (typeof raw !== 'string') continue;
            const p = raw.trim();
            if (!p) continue;
            if (p.includes('*')) {
                const src = p.split('*').map(escapeReg).join('.*');
                regexList.push(new RegExp('^' + src + '$', 'i'));
            } else {
                exactSet.add(p.toLowerCase());
            }
        }
        return function matchKey(key) {
            const k = String(key).toLowerCase();
            if (exactSet.has(k)) return true;
            for (let i = 0; i < regexList.length; i++) {
                if (regexList[i].test(k)) return true;
            }
            return false;
        };
    }

    // 核心：清理当前页面地址栏
    function restoreUrl(params, extraReg = null) {
        const url = new URL(location.href);
        const sp = url.searchParams;
        if (!sp.size) return;
        const match = buildWildcardMatcher(params);
        Array.from(sp.keys()).forEach(key => {
            if (match(key) || baseTrackReg.test(key) || (extraReg && extraReg.test(key))) {
                sp.delete(key);
            }
        });
        if (url.href !== location.href) history.replaceState({}, '', url.href);
    }

    // 批量清洗页面所有 a / area 链接
    function cleanAllLinks(params, extraReg = null) {
        const match = buildWildcardMatcher(params);
        const scan = (els) => {
            for (const el of els) {
                if (!el.hostname || !hostReg.test(el.hostname)) continue;
                let u;
                try { u = new URL(el.href); } catch (_) { continue; }
                const sp = u.searchParams;
                if (!sp.size) continue;
                Array.from(sp.keys()).forEach(key => {
                    if (match(key) || baseTrackReg.test(key) || (extraReg && extraReg.test(key))) {
                        sp.delete(key);
                    }
                });
                if (el.href !== u.href) el.href = u.href;
            }
        };
        scan(document.getElementsByTagName('a'));
        scan(document.getElementsByTagName('area'));
    }

    function delayClean(params, reg, time) {
        setTimeout(() => {
            restoreUrl(params, reg);
            cleanAllLinks(params, reg);
        }, time);
    }

    // 滚动 / 鼠标移动触发刷新链接
    function bindScrollMouse(params, reg) {
        window.addEventListener('scroll', () => {
            const st = document.documentElement.scrollTop;
            if (Math.abs(st - topScroll) > 120) {
                cleanAllLinks(params, reg);
                topScroll = st;
            }
        }, {passive: true});
        let x = 0, y = 0;
        window.addEventListener('pointermove', e => {
            if (Math.abs(e.clientX - x) > 20 || Math.abs(e.clientY - y) > 20) {
                cleanAllLinks(params, reg);
                x = e.clientX; y = e.clientY;
            }
        }, {passive: true});
    }

    // 点击后自动清洗链接
    function bindClickClean(params, reg, delay) {
        setTimeout(() => {
            const handler = () => delayClean(params, reg, 0);
            document.querySelectorAll('a,button,div,li').forEach(el => {
                el.removeEventListener('click', handler);
                el.addEventListener('click', handler, true);
            });
        }, delay);
    }

    // 匹配当前站点规则
    let useParams = [...commonParams];
    let useReg = null;
    for (const r of Object.values(siteRule)) {
        if (r.host.test(host)) {
            useParams = [...commonParams, ...r.params];
            useReg = r.reg || null;
            break;
        }
    }

    // 页面初始化清洗
    restoreUrl(useParams, useReg);
    cleanAllLinks(useParams, useReg);

    document.addEventListener('DOMContentLoaded', () => {
        delayClean(useParams, useReg, DELAY.normal);
        bindClickClean(useParams, useReg, DELAY.fast);
        bindScrollMouse(useParams, useReg);
    });

    window.addEventListener('urlchange', () => {
        restoreUrl(useParams, useReg);
        cleanAllLinks(useParams, useReg);
    });
})();