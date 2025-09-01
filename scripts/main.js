// scripts/main.js

async function inject(id, url) {
    const host = document.getElementById(id);
    if (!host) return console.warn(`[inject] missing host ${id}`);
    try {
        const response = await fetch(`${url}?v=${Date.now()}`, { cache: "no-cache" });
        const html = await response.text();
        host.innerHTML = html;
        
        // 运行注入片段里的<script>
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        tmp.querySelectorAll('script').forEach(s => {
            const n = document.createElement('script');
            if (s.src) {
                n.src = s.src;
            } else {
                n.textContent = s.textContent;
            }
            document.body.appendChild(n);
        });
        console.log(`[inject] OK -> ${id} <= ${url}`);
    } catch (e) {
        console.error(`[inject] FAIL -> ${id} <= ${url}`, e);
        host.innerHTML = `<div style="padding:12px;border:1px dashed #f99;color:#b00">
            Failed to load ${url}: ${e.message}
        </div>`;
    }
}

// === 高亮导航栏 ===
function highlightActiveNav() {
    const path = window.location.pathname.split("/").pop(); // 当前页面文件名
    const links = document.querySelectorAll(".nav-link");

    links.forEach(link => {
        const href = link.getAttribute("href");
        if (href === path) {
            link.classList.add("active");
        } else {
            link.classList.remove("active");
        }
    });
}

async function loadComponents() {
    await inject("header-container", "components/header.html");
    highlightActiveNav(); // header 注入完成后再执行

    // 首页需要的组件
    if (document.getElementById("hero-container")) {
        await inject("hero-container", "components/hero.html");
        await inject("overview-container", "components/overview.html");
        await inject("how-to-play-container", "components/how-to-play.html");
        await inject("features-container", "components/features.html");
        await inject("platform-container", "components/platform.html");
        await inject("faq-container", "components/faq.html");
    }

    // Level Guides 页面需要的组件
    if (document.getElementById("levels-hero")) {
        await inject("levels-hero", "components/levels-hero.html");
        await inject("levels-tools", "components/levels-tools.html");

        // 组件插入后马上初始化交互（Search / Go / 下拉填充）
        initLevelsTools();

        await inject("levels-grid", "components/levels-grid.html");
        await inject("levels-ad", "components/levels-ad.html");
        await inject("levels-featured", "components/levels-featured.html");
    }

    await inject("footer-container", "components/footer.html");
}

// 初始化 Level Guides 顶部工具条（搜索 & 跳转）
function initLevelsTools() {
    const MAX = 570;

    // ---- 大搜索框：按关卡号直达 ----
    const inputMain = document.getElementById('lv-input-main');
    const btnSearch = document.getElementById('lv-search-btn');

    if (inputMain && btnSearch && !btnSearch.dataset.bound) {
        btnSearch.dataset.bound = '1';
        const goLevel = () => {
            const n = parseInt(inputMain.value, 10);
            if (!n || n < 1 || n > MAX) { 
                inputMain.focus(); 
                return; 
            }
            // 跳到关卡详情页（沿用你的路由）
            location.href = `levels.html?n=${n}`;
        };
        btnSearch.addEventListener('click', goLevel);
        inputMain.addEventListener('keydown', e => { 
            if (e.key === 'Enter') goLevel(); 
        });
    }

    // ---- Jump to range：生成区间 & 滚到关卡网格 ----
    const select = document.getElementById('lv-range');
    const btnRange = document.getElementById('lv-range-go');

    if (select && !select.dataset.filled) {
        select.dataset.filled = '1';
        // 填充 1–20, 21–40, ... , 561–570
        for (let start = 1; start <= MAX; start += 20) {
            const end = Math.min(start + 19, MAX);
            const opt = document.createElement('option');
            opt.value = `${start}-${end}`;
            opt.textContent = `Level ${start}–${end}`;
            select.appendChild(opt);
        }
    }

    if (btnRange && select && !btnRange.dataset.bound) {
        btnRange.dataset.bound = '1';
        btnRange.addEventListener('click', () => {
            if (!select.value) return;
            // 设置 hash 方便 grid 脚本读取，滚到网格
            location.hash = `range-${select.value}`;
            const grid = document.getElementById('section-levels-grid') || document.getElementById('levels-grid');
            grid?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // 派发事件，供 levels-grid 监听后自动展开该组（如需）
            document.dispatchEvent(new CustomEvent('lv:jumpRange', { detail: { range: select.value }}));
        });
    }
}

document.addEventListener("DOMContentLoaded", loadComponents);
