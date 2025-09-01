// scripts/main.js

// ======= singleton guard: 防止 main.js 被重复执行 =======
(function () {
  if (window.__HP_MAIN_SINGLETON__) {
    console.warn('[main.js] duplicate load detected -> skip init');
    return;
  }
  window.__HP_MAIN_SINGLETON__ = true;
})();

// ========== 基础工具：把一个 HTML 片段注入到指定容器 ==========
async function inject(id, url, { runScripts = true, onLoaded, silent = false } = {}) {
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
    if (!silent) {
      host.innerHTML = `<div style="padding:12px;border:1px dashed #f99;color:#b00">
        Failed to load ${url}: ${e.message}
      </div>`;
    }
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

// ====== Canonical 处理 ======
const CANONICAL_ORIGIN = "https://www.holepeoplelevel.com";
let canonicalGuard = null;    // MutationObserver
let canonicalTarget = "";     // 期望的 href

function ensureCanonicalEl() {
  let el = document.getElementById("canonical-link");
  if (!el) {
    el = document.createElement("link");
    el.id = "canonical-link";
    el.rel = "canonical";
    document.head.appendChild(el);
  }
  // 保留唯一
  document.querySelectorAll('link[rel="canonical"]').forEach(other => {
    if (other !== el) other.remove();
  });
  return el;
}

function startCanonicalGuard() {
  if (canonicalGuard) return;
  canonicalGuard = new MutationObserver(() => {
    const el = ensureCanonicalEl();
    if (el.getAttribute("href") !== canonicalTarget) el.setAttribute("href", canonicalTarget);
    document.querySelectorAll('link[rel="canonical"]').forEach(other => {
      if (other !== el) other.remove();
    });
  });
  canonicalGuard.observe(document.head, { childList: true, subtree: true });
}

function setCanonical(n) {
  canonicalTarget = (Number.isFinite(n) && n >= 1 && n <= LEVEL_MAX)
    ? `${CANONICAL_ORIGIN}/levels.html?n=${n}`
    : `${CANONICAL_ORIGIN}/levels.html`;

  const el = ensureCanonicalEl();
  if (el.getAttribute("href") !== canonicalTarget) el.setAttribute("href", canonicalTarget);

  // 兜底一轮（宏/微任务）
  queueMicrotask(() => { if (el.getAttribute("href") !== canonicalTarget) el.setAttribute("href", canonicalTarget); });
  setTimeout(() => { if (el.getAttribute("href") !== canonicalTarget) el.setAttribute("href", canonicalTarget); }, 0);

  startCanonicalGuard();
}

function getLevelFromURL() {
  const sp = new URLSearchParams(location.search);
  const n = parseInt(sp.get("n"), 10);
  if (!n || n < 1 || n > LEVEL_MAX) return null;
  return n;
}

// —— 只用通用模板，不再探测 /components/level/{n}.html ——
// —— 详情态也不注入列表组件，避免二次渲染/闪动 ——
async function showLevelDetail(n) {
  let host = document.getElementById(DETAIL_HOST_ID);
  if (!host) {
    host = document.createElement("section");
    host.id = DETAIL_HOST_ID;
    host.style.minHeight = "40vh";
    const anchor = document.getElementById("levels-hero") || document.getElementById("levels-tools");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(host, anchor);
    else document.body.appendChild(host);
  }

  toggleElements([], LIST_SECTION_IDS);
  document.title = `Level ${n} - Hole People`;
  setCanonical(n);

  let tpl = null;
  try {
    const res = await fetch(`components/level/[slug].html?v=${Date.now()}`, { cache: "no-cache" });
    if (res.ok) tpl = await res.text();
  } catch {}

  if (!tpl) {
    host.innerHTML = `<div style="padding:12px;border:1px dashed #f99;color:#b00">Failed to load level template.</div>`;
  } else {
    const html = tpl
      .replaceAll("{{LEVEL}}", String(n))
      .replaceAll("{{ slug }}", String(n))
      .replaceAll("{{slug}}", String(n));
    host.innerHTML = html;

    host.querySelectorAll("script").forEach(s => {
      const ns = document.createElement("script");
      [...s.attributes].forEach(a => ns.setAttribute(a.name, a.value));
      if (s.src) ns.src = s.src; else ns.textContent = s.textContent;
      document.body.appendChild(ns);
    });
  }

  host.scrollIntoView({ behavior: "smooth", block: "start" });
  setCanonical(n);
}

function showLevelList() {
  const detail = document.getElementById(DETAIL_HOST_ID);
  if (detail) { detail.innerHTML = ''; detail.style.display = 'none'; }
  toggleElements(LIST_SECTION_IDS, []);
  document.title = 'Level Guides - Hole People';
  setCanonical(null);
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
  // 函数级防抖，避免意外重复调用
  if (loadComponents.__running) {
    console.warn('[main.js] loadComponents already running -> skip');
    return;
  }
  loadComponents.__running = true;
  try {
    await inject("header-container", "components/header.html");
    highlightActiveNav();

    const pageFile = location.pathname.split('/').pop();
    const onLevelsPage = (pageFile === 'levels.html');
    const currentN = getLevelFromURL();

    if (onLevelsPage) {
      // 详情态：只渲染详情，不注入列表相关组件，避免二次渲染
      if (currentN) {
        setCanonical(currentN);
        bindLevelClickDelegation();
        await showLevelDetail(currentN);
      } else {
        // 列表态：注入工具/网格/广告/精选
        await inject("levels-tools", "components/levels-tools.html");
        initLevelsTools();

        await inject("levels-grid", "components/levels-grid.html");
        await inject("levels-ad", "components/levels-ad.html");
        await inject("levels-featured", "components/levels-featured.html");

        bindLevelClickDelegation();
        showLevelList(); // 只调用一次
      }
    }

    await inject("footer-container", "components/footer.html");
  } finally {
    loadComponents.__running = false;
  }
}

// 只绑定一次，防止重复初始化
document.addEventListener("DOMContentLoaded", loadComponents, { once: true });
