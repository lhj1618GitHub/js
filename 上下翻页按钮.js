// ==UserScript==
// @name                PageUp/Down
// @name:zh-CN          上下翻页按钮
// @version             1.0.0
// @description         在页面的右侧添加翻页按钮，支持移动设备
// @author              lhj1618
// @match               *://*/*
// @grant               none
// @license             MIT
// ==/UserScript==

(function() {
    'use strict';

    // 配置
    const config = {
        buttonSize: '40px',          // 按钮大小
        buttonOpacity: '0.5',        // 按钮空闲时不透明度
        buttonHoverOpacity: '0.9',   // 按钮聚焦时的不透明度
        buttonColor: '#98FB98',      // 按钮背景色
        buttonPosition: '20px',      // 距离右边缘的距离
        buttonSpacing: '20px',       // 按钮之间的间距
        zIndex: 9999                 // 确保按钮显示在其他元素之上
    };

    // 按钮样式
    const upArrowSvg = "∧";
    const downArrowSvg = "∨";

    // 创建按钮
    function createButtons() {
        // 为按钮创建容器
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.right = config.buttonPosition;
        container.style.top = '50%';
        container.style.transform = 'translateY(-50%)';
        container.style.zIndex = config.zIndex;
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = config.buttonSpacing;

        // 创建向上翻页按钮
        const upButton = document.createElement('button');
        upButton.innerHTML = upArrowSvg;
        upButton.title = 'Page Up';
        styleButton(upButton);
        upButton.addEventListener('click', () => {
            window.scrollBy({
                top: -window.innerHeight * 0.9,
                behavior: 'smooth'
            });
        });

        // 创建向下翻页按钮
        const downButton = document.createElement('button');
        downButton.innerHTML = downArrowSvg;
        downButton.title = 'Page Down';
        styleButton(downButton);
        downButton.addEventListener('click', () => {
            window.scrollBy({
                top: window.innerHeight * 0.9,
                behavior: 'smooth'
            });
        });

        // 容器添加按钮
        container.appendChild(upButton);
        container.appendChild(downButton);

        // 容器添加文字
        document.body.appendChild(container);
    }

    // 为按钮应用样式
    function styleButton(button) {
        button.style.width = config.buttonSize;
        button.style.height = config.buttonSize;
        button.style.borderRadius = '50%';
        button.style.backgroundColor = config.buttonColor;
        button.style.border = 'none';
        button.style.outline = 'none';
        button.style.cursor = 'pointer';
        button.style.display = 'flex';
        button.style.justifyContent = 'center';
        button.style.alignItems = 'center';
        button.style.padding = '0';
        button.style.opacity = config.buttonOpacity;
        button.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
        button.style.transition = 'opacity 0.3s, transform 0.3s';

        // 悬停效果
        button.addEventListener('mouseenter', () => {
            button.style.opacity = config.buttonHoverOpacity;
            button.style.transform = 'scale(1.1)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.opacity = config.buttonOpacity;
            button.style.transform = 'scale(1)';
        });

        // 触摸设备支持
        button.addEventListener('touchstart', () => {
            button.style.opacity = config.buttonHoverOpacity;
            button.style.transform = 'scale(1.1)';
        });

        button.addEventListener('touchend', () => {
            button.style.opacity = config.buttonOpacity;
            button.style.transform = 'scale(1)';
        });
    }

    // 在页面加载后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createButtons);
    } else {
        createButtons();
    }
})();