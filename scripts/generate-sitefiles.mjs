// scripts/generate-sitefiles.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR  = path.resolve(__dirname, '..');

// ⚠️ 部署时请设置：BASE_URL=https://www.holepeoplelevel.com
const BASE_URL  = process.env.BASE_URL || 'https://www.holepeoplelevel.com';

// 解析出 origin（如 https://www.holepeoplelevel.com）
function getOriginFromBase(base) {
  try {
    const u = new URL(base); 
    if (u.hostname === 'holepeoplelevel.com') {
      u.hostname = 'www.holepeoplelevel.com';
    }
    return `${u.protocol}//${u.host}`.replace(/\/+$/, '');
  } catch {
    return String(base).replace(/\/+$/, '');
  }
}
const ORIGIN = getOriginFromBase(BASE_URL);

// 若存在 public 且其中有 index.html，则扫描 public；否则扫描根目录
async function detectScanDir() {
  const pub = path.join(ROOT_DIR, 'public');
  try {
    const s = await fs.stat(pub);
    if (s.isDirectory()) {
      await fs.stat(path.join(pub, 'index.html'));
      return pub;
    }
  } catch {}
  return ROOT_DIR;
}

const EXCLUDE_DIRS = new Set([
  'node_modules', 'scripts', 'data', 'assets', 'components',
  'img', 'images', '_partials', '_includes'
]);

// 这些文件不应进入 sitemap（如谷歌验证页等）
const EXCLUDE_SITEMAP_BASENAME = [
  /^google[0-9a-z]+\.html$/i,
  /^404\.html$/i,
  /^500\.html$/i
];

const DEFAULTS = {
  homepage: { changefreq: 'daily',  priority: '1.0' },
  listpage: { changefreq: 'daily',  priority: '0.9' },
  level:    { changefreq: 'weekly', priority: '0.8' },
  page:     { changefreq: 'weekly', priority: '0.8' },
};

async function scanHtmlFiles(dir, acc = []) {
  const ents = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of ents) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (EXCLUDE_DIRS.has(ent.name)) continue;
      await scanHtmlFiles(full, acc);
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.html')) {
      acc.push(full);
    }
  }
  return acc;
}

function shouldExcludeFromSitemap(filePath, scanDir) {
  const rel = path.relative(scanDir, filePath).replace(/\\/g, '/');
  const base = path.basename(rel);
  return EXCLUDE_SITEMAP_BASENAME.some(re => re.test(base));
}

function filePathToUrl(filePath, scanDir) {
  const rel = path.relative(scanDir, filePath).replace(/\\/g, '/');
  if (rel.toLowerCase() === 'index.html') return `${ORIGIN}/`;
  return `${ORIGIN}/${rel}`;
}

async function getLastMod(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.mtime.toISOString();
  } catch { return null; }
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&apos;');
}

/* -------------------- sitemap.xml -------------------- */
async function generateSitemap() {
  const SCAN_DIR = await detectScanDir();
  const DATA_DIR = path.join(ROOT_DIR, 'data');
  const LEVEL_MAP_FILE  = path.join(DATA_DIR, 'level-videos.json');
  const LEVEL_META_FILE = path.join(DATA_DIR, 'level-videos.meta.json'); // 可选

  console.log('🔎 扫描目录：', SCAN_DIR.replace(ROOT_DIR, '.'));

  // 1) 扫描静态 html
  const htmlFiles = await scanHtmlFiles(SCAN_DIR);
  const htmlFilesFiltered = htmlFiles.filter(fp => !shouldExcludeFromSitemap(fp, SCAN_DIR));

  const staticUrls = await Promise.all(htmlFilesFiltered.map(async fp => {
    const loc = filePathToUrl(fp, SCAN_DIR);
    const lastmod = await getLastMod(fp);
    let priority   = DEFAULTS.page.priority;
    let changefreq = DEFAULTS.page.changefreq;
    if (loc === `${ORIGIN}/`) {
      priority   = DEFAULTS.homepage.priority;
      changefreq = DEFAULTS.homepage.changefreq;
    } else if (loc.endsWith('/levels.html')) {
      priority   = DEFAULTS.listpage.priority;
      changefreq = DEFAULTS.listpage.changefreq;
    }
    return { loc, lastmod, changefreq, priority };
  }));

  // 2) 追加关卡 url（来自 data/level-videos.json）
  let levelUrls = [];
  try {
    const txt = await fs.readFile(LEVEL_MAP_FILE, 'utf-8');
    const map = JSON.parse(txt);
    const levels = Object.keys(map).map(k => parseInt(k,10))
      .filter(Number.isFinite).sort((a,b)=>a-b);

    // 可选 meta → lastmod
    let meta = {};
    try {
      meta = JSON.parse(await fs.readFile(LEVEL_META_FILE, 'utf-8'));
    } catch {}

    levelUrls = levels.map(n => ({
      // ✅ 修正为实际详情页路径（带 www 由 ORIGIN 保证）
      loc: `${ORIGIN}/levels.html?n=${n}`,
      lastmod: (meta[String(n)]?.publishedAt || meta[String(n)]?.uploadDate) ?? null,
      changefreq: DEFAULTS.level.changefreq,
      priority:   DEFAULTS.level.priority
    }));
    console.log(`📼 读取关卡：${levels.length} 个`);
  } catch (e) {
    console.warn('⚠️ 跳过关卡 URL（未找到 data/level-videos.json 或解析失败）：', e.message);
  }

  // 3) 合并 & 排序（去重）
  const byLoc = new Map();
  [...staticUrls, ...levelUrls].forEach(u => byLoc.set(u.loc, u));
  const urls = [...byLoc.values()].sort((a,b)=>a.loc.localeCompare(b.loc));

  // 4) 写出 sitemap.xml（写到扫描目录，以便被部署）
  const outFile = path.join(SCAN_DIR, 'sitemap.xml');
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  for (const u of urls) {
    lines.push('  <url>');
    lines.push(`    <loc>${xmlEscape(u.loc)}</loc>`);
    if (u.lastmod)    lines.push(`    <lastmod>${xmlEscape(u.lastmod)}</lastmod>`);
    if (u.changefreq) lines.push(`    <changefreq>${xmlEscape(u.changefreq)}</changefreq>`);
    if (u.priority)   lines.push(`    <priority>${xmlEscape(u.priority)}</priority>`);
    lines.push('  </url>');
  }
  lines.push('</urlset>\n');
  await fs.writeFile(outFile, lines.join('\n'), 'utf-8');
  console.log(`✅ 写入：${path.relative(process.cwd(), outFile)}`);
  return outFile;
}

/* -------------------- robots.txt -------------------- */
async function generateRobots() {
  const content = `# robots.txt generated by generate-sitefiles.mjs

# --- Global default ---
User-agent: *
Allow: /

# Disallow local build/source folders (project-specific)
Disallow: /components/
Disallow: /data/
Disallow: /node_modules/
Disallow: /scripts/

# （如需完全屏蔽静态资源目录可解开下一行，但通常没必要）
# Disallow: /assets/

# --- LLM-specific allowances/blocks (可选) ---
User-Agent: GPTBot
Allow: /llms.txt
Disallow: /

User-Agent: anthropic-ai
Allow: /llms.txt
Disallow: /

# --- Search engine tuning ---
User-Agent: Googlebot
Allow: /
Disallow: /api/
Disallow: /_next/
Disallow: /static/
Disallow: /404
Disallow: /500
# 如需屏蔽 JSON 可保留下一行；否则删除
Disallow: /*.json$

# 允许静态资源类型
Allow: /*.css$
Allow: /*.js$
Allow: /*.png$
Allow: /*.jpg$
Allow: /*.jpeg$
Allow: /*.gif$
Allow: /*.webp$

# Sitemaps
Sitemap: ${ORIGIN}/sitemap.xml
`;
  const out = path.join(ROOT_DIR, 'robots.txt');
  await fs.writeFile(out, content, 'utf-8');
  console.log(`✅ 写入：${path.relative(process.cwd(), out)}`);
  return out;
}

/* -------------------- llms.txt / llms-full.txt -------------------- */
async function generateLlmsFull() {
  const SCAN_DIR = await detectScanDir();

  // 静态 HTML（去除不该收录的）
  const htmlFiles = (await scanHtmlFiles(SCAN_DIR)).filter(fp => !shouldExcludeFromSitemap(fp, SCAN_DIR));
  const staticUrls = htmlFiles.map(fp => filePathToUrl(fp, SCAN_DIR));

  // 关卡 URL（与 sitemap 保持一致）
  const DATA_DIR = path.join(ROOT_DIR, 'data');
  const LEVEL_MAP_FILE  = path.join(DATA_DIR, 'level-videos.json');
  let levelUrls = [];
  try {
    const txt = await fs.readFile(LEVEL_MAP_FILE, 'utf-8');
    const map = JSON.parse(txt);
    const levels = Object.keys(map).map(k => parseInt(k,10))
      .filter(Number.isFinite).sort((a,b)=>a-b);
    levelUrls = levels.map(n => `${ORIGIN}/levels.html?n=${n}`);
  } catch {}

  const all = Array.from(new Set([...staticUrls, ...levelUrls]))
    .sort((a,b)=>a.localeCompare(b));

  const out = path.join(SCAN_DIR, 'llms-full.txt');
  await fs.writeFile(out, all.join('\n') + '\n', 'utf-8');
  console.log(`✅ 写入：${path.relative(process.cwd(), out)}`);
  return out;
}

async function generateLlmsTxt() {
  const content = `# LLMs crawling instructions
User-agent: *
Allow: /

Sitemap: ${ORIGIN}/sitemap.xml
Sitemap: ${ORIGIN}/llms-full.txt
`;
  const SCAN_DIR = await detectScanDir();
  const out = path.join(SCAN_DIR, 'llms.txt');
  await fs.writeFile(out, content, 'utf-8');
  console.log(`✅ 写入：${path.relative(process.cwd(), out)}`);
  return out;
}

/* -------------------- main -------------------- */
async function main() {
  await generateSitemap();
  await generateLlmsFull();
  await generateLlmsTxt();
  await generateRobots();
  console.log('🎉 站点文件已生成完成。');
  console.log(`👉 现在你可以访问：${ORIGIN}/sitemap.xml`);
  console.log(`👉 现在你可以访问：${ORIGIN}/llms-full.txt`);
  console.log(`👉 现在你可以访问：${ORIGIN}/llms.txt`);
  console.log(`👉 现在你可以访问：${ORIGIN}/robots.txt`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
