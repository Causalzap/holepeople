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
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      tmp.querySelectorAll('script').forEach(s => {
        const n = document.createElement('script');
        [...s.attributes].forEach(a => n.setAttribute(a.name, a.value));
        if (s.src) n.src = s.src;
        else n.textContent = s.textContent;
        document.body.appendChild(n);
      });
    }

    onLoaded && onLoaded(host);
    console.log(`[inject] OK -> ${id} <= ${url}`);
    return html;
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
  showIds.forEach(id => { const el = document.getElementById(id); if (el) el.style.setProperty('display', ''); });
  hideIds.forEach(id => { const el = document.getElementById(id); if (el) el.style.setProperty('display', 'none', 'important'); });
}

// ========== 顶部导航高亮 ==========
function highlightActiveNav() {
  const path = window.location.pathname.split("/").pop();
  const links = document.querySelectorAll(".nav-link");
  links.forEach(link => {
    const href = link.getAttribute("href");
    if (href === path) link.classList.add("active");
    else link.classList.remove("active");
  });
}

// ========== Level 详情渲染（基于 ?n=） ==========
const LEVEL_MAX = 639;
const LIST_SECTION_IDS = ["levels-hero", "levels-tools", "levels-grid", "levels-ad", "levels-featured"];
const DETAIL_HOST_ID = "level-detail-container";

function getLevelFromURL() {
  const sp = new URLSearchParams(location.search);
  const n = parseInt(sp.get("n"), 10);
  if (!n || n < 1 || n > LEVEL_MAX) return null;
  return n;
}

async function showLevelDetail(n) {
  let host = document.getElementById(DETAIL_HOST_ID);
  if (!host) {
    host = document.createElement('section');
    host.id = DETAIL_HOST_ID;
    host.style.minHeight = '40vh';
    const anchor = document.getElementById("levels-hero") || document.getElementById("levels-tools");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(host, anchor);
    else document.body.appendChild(host);
  }

  // 强制隐藏列表区块
  toggleElements([], LIST_SECTION_IDS);
  document.title = `Level ${n} - Hole People`;

  try {
    await inject(DETAIL_HOST_ID, `components/level/${n}.html`);
  } catch {
    const html = await inject(DETAIL_HOST_ID, `components/level/[slug].html`, { runScripts: false });
    const host2 = document.getElementById(DETAIL_HOST_ID);
    host2.innerHTML = html
      .replaceAll('{{LEVEL}}', String(n))
      .replaceAll('{{ slug }}', String(n))
      .replaceAll('{{slug}}', String(n));
    host2.querySelectorAll('script').forEach(s => {
      const nScript = document.createElement('script');
      [...s.attributes].forEach(a => nScript.setAttribute(a.name, a.value));
      nScript.textContent = s.textContent;
      document.body.appendChild(nScript);
    });
  }

  host.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showLevelList() {
  // 清空并隐藏详情容器
  const detail = document.getElementById(DETAIL_HOST_ID);
  if (detail) { detail.innerHTML = ''; detail.style.display = 'none'; }
  // 显示列表区块
  toggleElements(LIST_SECTION_IDS, []);
  document.title = 'Level Guides - Hole People';
}

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

    if (a.hasAttribute('data-level')) {
      const n = parseInt(a.getAttribute('data-level'), 10);
      if (n >= 1 && n <= LEVEL_MAX) {
        e.preventDefault();
        history.pushState({}, '', `?n=${n}`);
        renderLevelsPageByURL();
      }
      return;
    }

    if (a.tagName.toLowerCase() === 'a' && a.href) {
      try {
        const url = new URL(a.href);
        const n = parseInt(url.searchParams.get('n'), 10);
        const currentPage = location.pathname.split('/').pop();
        if (currentPage === 'levels.html' && n >= 1 && n <= LEVEL_MAX) {
          e.preventDefault();
          history.pushState({}, '', `?n=${n}`);
          renderLevelsPageByURL();
        }
      } catch {}
    }
  });

  window.addEventListener('popstate', renderLevelsPageByURL);
}

// ========== 顶部工具条（搜索 & 跳转） ==========
function initLevelsTools() {
  const MAX = LEVEL_MAX;

  const inputMain = document.getElementById('lv-input-main');
  const btnSearch = document.getElementById('lv-search-btn');

  if (inputMain && btnSearch && !btnSearch.dataset.bound) {
    btnSearch.dataset.bound = '1';
    const goLevel = () => {
      const n = parseInt(inputMain.value, 10);
      if (!n || n < 1 || n > MAX) { inputMain.focus(); return; }
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
  highlightActiveNav();

  // —— 是否在 levels.html ——（用 URL 判断更稳）
  const pageFile = location.pathname.split('/').pop();
  const onLevelsPage = (pageFile === 'levels.html');

  // 先根据 URL 初次渲染（处理用户直接访问 levels.html?n=48 的场景）
  if (onLevelsPage) {
    // 先渲一次，防止后面组件脚本短暂把列表显示出来
    renderLevelsPageByURL();
  }

  // 首页组件
  if (document.getElementById("hero-container")) {
    await inject("hero-container", "components/hero.html");
    await inject("overview-container", "components/overview.html");
    await inject("how-to-play-container", "components/how-to-play.html");
    await inject("features-container", "components/features.html");
    await inject("platform-container", "components/platform.html");
    await inject("faq-container", "components/faq.html");
  }

  // Levels 组件
  if (onLevelsPage) {
    await inject("levels-tools", "components/levels-tools.html");
    initLevelsTools();

    await inject("levels-grid", "components/levels-grid.html");
    await inject("levels-ad", "components/levels-ad.html");
    await inject("levels-featured", "components/levels-featured.html");

    // 绑定事件并在组件注入完后再渲一次，确保最终状态是“详情或列表”与 URL 匹配
    bindLevelClickDelegation();
    await renderLevelsPageByURL();
  }

  await inject("footer-container", "components/footer.html");
}

document.addEventListener("DOMContentLoaded", loadComponents);
