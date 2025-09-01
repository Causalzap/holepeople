// scripts/main.js

// ========== 基础工具：把一个 HTML 片段注入到指定容器 ==========
async function inject(id, url, { runScripts = true, onLoaded } = {}) {
  const host = document.getElementById(id);
  if (!host) return console.warn(`[inject] missing host #${id}`);
  try {
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const html = await res.text();
    host.innerHTML = html;

    if (runScripts) {
      // 运行注入片段里的 <script>
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      tmp.querySelectorAll('script').forEach(s => {
        const n = document.createElement('script');
        // 保留 type/module 等属性
        [...s.attributes].forEach(a => n.setAttribute(a.name, a.value));
        if (s.src) n.src = s.src;
        else n.textContent = s.textContent;
        document.body.appendChild(n);
      });
    }

    onLoaded && onLoaded(host);
    console.log(`[inject] OK -> ${id} <= ${url}`);
    return html; // 把原始 html 返回，便于上层替换占位符
  } catch (e) {
    console.error(`[inject] FAIL -> ${id} <= ${url}`, e);
    host.innerHTML = `<div style="padding:12px;border:1px dashed #f99;color:#b00">
      Failed to load ${url}: ${e.message}
    </div>`;
    throw e;
  }
}

// ========== 工具：显示/隐藏一组元素 ==========
function toggleElements(showIds = [], hideIds = []) {
  showIds.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ''; });
  hideIds.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
}

// ========== 顶部导航高亮 ==========
function highlightActiveNav() {
  const path = window.location.pathname.split("/").pop(); // 当前页面文件名
  const links = document.querySelectorAll(".nav-link");
  links.forEach(link => {
    const href = link.getAttribute("href");
    if (href === path) link.classList.add("active");
    else link.classList.remove("active");
  });
}

// ========== Level 详情渲染（基于 ?n=） ==========
const LEVEL_MAX = 639;
const LIST_SECTION_IDS = [
  "levels-hero", "levels-tools", "levels-grid", "levels-ad", "levels-featured"
];
const DETAIL_HOST_ID = "level-detail-container";

function getLevelFromURL() {
  const sp = new URLSearchParams(location.search);
  const n = parseInt(sp.get("n"), 10);
  if (!n || n < 1 || n > LEVEL_MAX) return null;
  return n;
}

async function showLevelDetail(n) {
  // 如果详情容器不存在，创建一个放在 levels-hero 前或 tools 前
  let host = document.getElementById(DETAIL_HOST_ID);
  if (!host) {
    host = document.createElement('section');
    host.id = DETAIL_HOST_ID;
    host.style.minHeight = '40vh';
    const anchor = document.getElementById("levels-hero") || document.getElementById("levels-tools");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(host, anchor);
    else document.body.appendChild(host);
  }

  // 隐藏关卡列表相关区块
  toggleElements([], LIST_SECTION_IDS);

  document.title = `Level ${n} - Hole People`;

  // 1) 尝试加载专用文件 components/level/{n}.html
  // 2) 若 404/失败，回退到通用模板 components/level/[slug].html，并替换 {{LEVEL}}
  try {
    await inject(DETAIL_HOST_ID, `components/level/${n}.html`);
  } catch {
    const html = await inject(DETAIL_HOST_ID, `components/level/[slug].html`, { runScripts: false });
    // 用 LEVEL 占位符做最基础替换（可按需扩展）
    const host2 = document.getElementById(DETAIL_HOST_ID);
    host2.innerHTML = html.replaceAll('{{LEVEL}}', String(n));
    // 重新执行内联脚本（如果有）
    host2.querySelectorAll('script').forEach(s => {
      const nScript = document.createElement('script');
      [...s.attributes].forEach(a => nScript.setAttribute(a.name, a.value));
      nScript.textContent = s.textContent;
      document.body.appendChild(nScript);
    });
  }

  // 页面滚动到详情
  host.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showLevelList() {
  toggleElements(LIST_SECTION_IDS, [DETAIL_HOST_ID]);
  document.title = 'Level Guides - Hole People';
}

// 在 levels.html 上根据 URL 渲染视图
async function renderLevelsPageByURL() {
  const n = getLevelFromURL();
  if (n) await showLevelDetail(n);
  else showLevelList();
}

// ========== 绑定：拦截所有“关卡点击” ==========
function bindLevelClickDelegation() {
  if (document.body.dataset.lvBound) return;
  document.body.dataset.lvBound = '1';

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a, button, [data-level]');
    if (!a) return;

    // 1) [data-level] 直接取数值
    if (a.hasAttribute('data-level')) {
      const n = parseInt(a.getAttribute('data-level'), 10);
      if (n >= 1 && n <= LEVEL_MAX) {
        e.preventDefault();
        history.pushState({}, '', `?n=${n}`);
        renderLevelsPageByURL();
      }
      return;
    }

    // 2) 带 ?n= 的链接
    if (a.tagName.toLowerCase() === 'a' && a.href) {
      try {
        const url = new URL(a.href);
        const n = parseInt(url.searchParams.get('n'), 10);
        // 仅在当前就是 levels.html 时拦截为 SPA；否则让浏览器跳转
        const currentPage = location.pathname.split('/').pop();
        if (currentPage === 'levels.html' && n >= 1 && n <= LEVEL_MAX) {
          e.preventDefault();
          history.pushState({}, '', `?n=${n}`);
          renderLevelsPageByURL();
        }
      } catch { /* ignore */ }
    }
  });

  // 前进/后退时根据 URL 渲染
  window.addEventListener('popstate', renderLevelsPageByURL);
}

// ========== 顶部工具条（搜索 & 跳转） ==========
function initLevelsTools() {
  const MAX = LEVEL_MAX;

  // ---- 大搜索框：按关卡号直达 ----
  const inputMain = document.getElementById('lv-input-main');
  const btnSearch = document.getElementById('lv-search-btn');

  if (inputMain && btnSearch && !btnSearch.dataset.bound) {
    btnSearch.dataset.bound = '1';
    const goLevel = () => {
      const n = parseInt(inputMain.value, 10);
      if (!n || n < 1 || n > MAX) { inputMain.focus(); return; }
      // 如果当前就是 levels.html，改为 SPA 渲染；否则走普通跳转
      const current = location.pathname.split('/').pop();
      if (current === 'levels.html') {
        history.pushState({}, '', `?n=${n}`);
        renderLevelsPageByURL();
      } else {
        location.href = `levels.html?n=${n}`;
      }
    };
    btnSearch.addEventListener('click', goLevel);
    inputMain.addEventListener('keydown', e => { if (e.key === 'Enter') goLevel(); });
  }

  // ---- Jump to range：生成区间 & 滚到关卡网格 ----
  const select = document.getElementById('lv-range');
  const btnRange = document.getElementById('lv-range-go');

  if (select && !select.dataset.filled) {
    select.dataset.filled = '1';
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
      location.hash = `range-${select.value}`;
      const grid = document.getElementById('section-levels-grid') || document.getElementById('levels-grid');
      grid?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.dispatchEvent(new CustomEvent('lv:jumpRange', { detail: { range: select.value }}));
    });
  }
}

// ========== 页面组件装载 ==========
async function loadComponents() {
  await inject("header-container", "components/header.html");
  highlightActiveNav(); // header 注入完成后再执行

  // 首页
  if (document.getElementById("hero-container")) {
    await inject("hero-container", "components/hero.html");
    await inject("overview-container", "components/overview.html");
    await inject("how-to-play-container", "components/how-to-play.html");
    await inject("features-container", "components/features.html");
    await inject("platform-container", "components/platform.html");
    await inject("faq-container", "components/faq.html");
  }

  // Level Guides
  const onLevelsPage = !!document.getElementById("levels-hero");
  if (onLevelsPage) {
    await inject("levels-tools", "components/levels-tools.html");
    initLevelsTools();

    await inject("levels-grid", "components/levels-grid.html");
    await inject("levels-ad", "components/levels-ad.html");
    await inject("levels-featured", "components/levels-featured.html");

    // 绑定关卡点击代理 + 根据 URL 渲染（列表/详情）
    bindLevelClickDelegation();
    await renderLevelsPageByURL();
  }

  await inject("footer-container", "components/footer.html");
}

document.addEventListener("DOMContentLoaded", loadComponents);
