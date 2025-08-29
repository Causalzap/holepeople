(function () {
    const HEADER_MOUNT_ID = 'header-container';
    const FOOTER_MOUNT_ID = 'footer-container';
  
    document.addEventListener('DOMContentLoaded', () => {
      injectFragment(HEADER_MOUNT_ID, onHeaderReady);
      injectFragment(FOOTER_MOUNT_ID);
    });
  
    function injectFragment(mountId, onReady) {
      const mount = document.getElementById(mountId);
      if (!mount) return;
      const src = mount.getAttribute('data-src');
      if (!src) return;
  
      fetch(src)
        .then(r => r.text())
        .then(html => {
          mount.innerHTML = html;
          if (typeof onReady === 'function') onReady(mount);
        })
        .catch(() => {});
    }
  
    function onHeaderReady(scope) {
      bindHamburger(scope);
      robustHighlight(scope);
    }
  
    function bindHamburger(scope) {
      const burger = scope.querySelector('.hamburger');
      const menu = scope.querySelector('.nav-menu');
      if (!burger || !menu) return;
      burger.addEventListener('click', () => {
        const opened = menu.classList.toggle('active');
        burger.setAttribute('aria-expanded', opened ? 'true' : 'false');
      });
    }
  
    /**
     * 更稳的高亮逻辑：
     * - 同时兼容 /blog、/blog.html、blog.html、子目录部署、末尾斜杠
     * - 如果没有精确命中，用“包含关系 + 文件名 stem”兜底
     */
    function robustHighlight(scope) {
      const links = Array.from(scope.querySelectorAll('.nav-link'));
      if (!links.length) return;
  
      const loc = window.location;
      const curPathRaw = loc.pathname || '/';
  
      // 归一化当前路径
      const curPath = normalize(curPathRaw);
      const curStem = toStem(curPath);
  
      let matched = false;
  
      for (const a of links) {
        const href = (a.getAttribute('href') || '').trim();
        if (!href || href.startsWith('#')) continue;
  
        // 解析链接为绝对路径并归一化
        const linkAbsPath = normalize(new URL(href, loc.origin).pathname);
        const linkStem = toStem(linkAbsPath);
  
        // 1) 严格匹配（最优先）
        if (curPath === linkAbsPath) {
          setActive(a);
          matched = true;
          continue;
        }
  
        // 2) 末尾 index 互换（/ 与 /index.html）
        if (swapIndexEqual(curPath, linkAbsPath)) {
          setActive(a);
          matched = true;
          continue;
        }
  
        // 3) stem 匹配（/blog == /blog.html）
        if (curStem && linkStem && curStem === linkStem) {
          setActive(a);
          matched = true;
          continue;
        }
  
        // 4) 兜底：当前路径以链接名结尾（防止子目录情况）
        if (curPath.endsWith(stripLeadingSlash(linkAbsPath))) {
          setActive(a);
          matched = true;
          continue;
        }
      }
  
      // 如果啥都没匹配到，且是首页，给 Home
      if (!matched && (curPath === '/' || curStem === 'index')) {
        const home = links.find(x => /(^|\/)index(\.html?)?$/i.test(new URL(x.href).pathname) || /home/i.test(x.textContent||''));
        if (home) setActive(home);
      }
  
      function setActive(el) {
        el.classList.add('active');
        el.setAttribute('aria-current', 'page');
      }
  
      function normalize(p) {
        // 去掉多余斜杠、统一小写、去掉末尾斜杠（根路径除外）
        let s = (p || '/').replace(/\/{2,}/g, '/');
        if (s.length > 1) s = s.replace(/\/+$/, '');
        return s.toLowerCase();
      }
      function toStem(p) {
        const file = p.split('/').pop() || '';
        if (!file) return 'index';
        return file.replace(/\.html?$/i, '') || 'index';
      }
      function swapIndexEqual(a, b) {
        const ax = a.replace(/\/index(\.html?)?$/i, '');
        const bx = b.replace(/\/index(\.html?)?$/i, '');
        return ax === bx;
      }
      function stripLeadingSlash(s){ return (s||'').replace(/^\/+/, ''); }
    }
  })();
  