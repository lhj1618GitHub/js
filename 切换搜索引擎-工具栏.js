// ==UserScript==
// @name         搜索引擎快速切换工具栏
// @namespace    https://gitcode.com/lhj1618/Tool/releases/js
// @version      1.4
// @description  顶部/上滑显示，齿轮管理+临时关闭按钮
// @author       User
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // 默认内置搜索引擎 [名称, 搜索链接前缀]
    const defaultEngines = [
        ["百度", "https://www.baidu.com/s?wd="],
        ["搜狗", "https://www.sogou.com/web?query="],
        ["必应", "https://cn.bing.com/search?q="],
        ["抖音搜索", "https://www.douyin.com/search?q="],
        ["知乎", "https://www.zhihu.com/search?q="],
        ["B站", "https://search.bilibili.com/all?keyword="]
    ];

    let engineList = GM_getValue("searchEngineList", defaultEngines);
    let lastScrollY = window.scrollY;
    let toolBar = null;
    let tempHide = false;

    // 解析URL
    function parseUrl(url) {
        let a = document.createElement('a');
        a.href = url;
        return {
            origin: a.origin,
            host: a.hostname,
            path: a.pathname,
            full: url
        };
    }

    // 严格判断：当前页面 是否属于【已配置的搜索结果页面】
    function isMatchSearchResultPage() {
        const currUrl = location.href;
        return engineList.some(prefix => {
            const pre = prefix[1];
            // 必须以搜索前缀开头，才判定为搜索结果页
            return currUrl.startsWith(pre);
        });
    }

    // 全局样式
    GM_addStyle(`
        #searchSwitchToolBar{
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            background: rgba(30,30,30,0.92);
            padding: 10px 15px;
            box-sizing: border-box;
            z-index: 999999;
            transform: translateY(100%);
            transition: transform 0.3s ease;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px;
        }
        #searchSwitchToolBar.show{
            transform: translateY(0);
        }
        .search-engine-item{
            color: #fff;
            padding: 6px 12px;
            background: #2563eb;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            border: none;
            outline: none;
        }
        .search-engine-item:hover{
            background: #1d4ed8;
        }
        .engine-setting-btn{
            background: transparent;
            font-size: 16px;
            padding: 4px 8px;
        }
        .engine-setting-btn:hover{
            background: rgba(255,255,255,0.15);
        }
        .toolbar-close-btn{
            background: #ef4444;
            padding: 4px 10px !important;
        }
        .toolbar-close-btn:hover{
            background: #dc2626;
        }
        #engineEditBox{
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%,-50%);
            background: #fff;
            padding: 20px;
            border-radius: 8px;
            z-index: 1000000;
            display: none;
            min-width: 400px;
            box-shadow: 0 0 20px #0003;
        }
        .mask-layer{
            position: fixed;
            inset:0;
            background:#0006;
            z-index:999999;
            display:none;
        }
    `);

    // 提取搜索关键词
    function getSearchKeyWord(){
        const url = location.href;
        let key = "";
        const ruleMap = [
            [/wd=([^&]+)/],
            [/query=([^&]+)/],
            [/q=([^&]+)/],
            [/keyword=([^&]+)/]
        ];
        for(let r of ruleMap){
            let res = url.match(r[0]);
            if(res && res[1]){
                key = decodeURIComponent(res[1]);
                break;
            }
        }
        return key;
    }

    // 渲染工具栏
    function renderToolBar(){
        if(toolBar) toolBar.remove();
        tempHide = false;
        toolBar = document.createElement("div");
        toolBar.id = "searchSwitchToolBar";

        engineList.forEach(item=>{
            let btn = document.createElement("button");
            btn.className = "search-engine-item";
            btn.innerText = item[0];
            btn.onclick = ()=>{
                let key = getSearchKeyWord();
                if(!key) return alert("未读取到搜索关键词");
                location.href = item[1] + encodeURIComponent(key);
            };
            toolBar.appendChild(btn);
        });

        // 齿轮设置按钮
        let settingBtn = document.createElement("button");
        settingBtn.className = "search-engine-item engine-setting-btn";
        settingBtn.innerText = "⚙️";
        settingBtn.title = "管理搜索引擎";
        settingBtn.onclick = showEditPanel;
        toolBar.appendChild(settingBtn);

        // 临时关闭按钮
        let closeBtn = document.createElement("button");
        closeBtn.className = "search-engine-item toolbar-close-btn";
        closeBtn.innerText = "✕";
        closeBtn.title = "临时隐藏工具栏";
        closeBtn.onclick = ()=>{
            tempHide = true;
            toolBar.classList.remove("show");
        };
        toolBar.appendChild(closeBtn);

        document.body.appendChild(toolBar);
    }

    // 编辑面板
    function createEditPanel(){
        let mask = document.createElement("div");
        mask.className = "mask-layer";
        mask.onclick = ()=>{
            mask.style.display = "none";
            editBox.style.display = "none";
        };

        let editBox = document.createElement("div");
        editBox.id = "engineEditBox";
        editBox.innerHTML = `
            <h3>自定义搜索引擎管理</h3>
            <p>格式：引擎名称|搜索链接前缀</p>
            <textarea id="engineTextarea" style="width:100%;height:220px;padding:8px;margin:10px 0;">${engineList.map(v=>v.join("|")).join("\n")}</textarea>
            <div style="text-align:right;">
                <button id="saveEngineBtn" style="padding:5px 15px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;">保存配置</button>
                <button id="resetEngineBtn" style="padding:5px 15px;background:#999;color:#fff;border:none;border-radius:4px;cursor:pointer;margin-left:8px;">恢复默认</button>
            </div>
        `;
        document.body.append(mask,editBox);

        editBox.querySelector("#saveEngineBtn").onclick = ()=>{
            let val = editBox.querySelector("#engineTextarea").value.trim();
            let arr = val.split("\n").filter(line=>line.includes("|"));
            let newList = arr.map(line=>line.split("|").map(s=>s.trim()));
            GM_setValue("searchEngineList",newList);
            engineList = newList;
            renderToolBar();
            mask.style.display = "none";
            editBox.style.display = "none";
            alert("配置保存成功！");
        };

        editBox.querySelector("#resetEngineBtn").onclick = ()=>{
            GM_setValue("searchEngineList",defaultEngines);
            engineList = defaultEngines;
            renderToolBar();
            mask.style.display = "none";
            editBox.style.display = "none";
            alert("已恢复默认！");
        };
    }

    function showEditPanel(){
        let box = document.getElementById("engineEditBox");
        let mask = document.querySelector(".mask-layer");
        if(!box) createEditPanel();
        box.style.display = "block";
        mask.style.display = "block";
    }

    // 滚动监听
    function bindScrollEvent(){
        window.addEventListener("scroll",()=>{
            const nowY = window.scrollY;
            if(nowY <= 10 || nowY < lastScrollY){
                tempHide = false;
                toolBar.classList.add("show");
            }else if(nowY > lastScrollY && !tempHide){
                toolBar.classList.remove("show");
            }
            lastScrollY = nowY;
        });
    }

    // 严格初始化：仅当前URL匹配搜索前缀才加载
    if(isMatchSearchResultPage()){
        renderToolBar();
        bindScrollEvent();
        if(window.scrollY <= 10){
            toolBar.classList.add("show");
        }
    }
})();
