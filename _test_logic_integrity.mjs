/**
 * 业务逻辑 / DOM 契约完整性检查（不依赖 UI 皮肤）
 * Run: node _test_logic_integrity.mjs
 */
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
let passed = 0;
let failed = 0;

function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}

const REQUIRED_FUNCTIONS = [
  'function load(', 'function save(', 'function showPage(',
  'function renderOverview(', 'function renderOverviewDashboard(',
  'function renderRegion(', 'function renderSidebar(',
  'function refreshStocks(', 'function refreshFunds(', 'function refreshAllQuotes(',
  'function refreshBtcPrice(', 'function fetchCNYRates(', 'function takeSnapshot(',
  'function renderHistory(', 'function renderNewsPage(', 'function renderFXPage(',
  'function runAiAdvisor(', 'async function fetchAiAdvice(',
  'function renderMajorEventsWatch(', 'function updateGoalBar(',
  'function prepareSanitizedPayload(', 'function importAssetsV2(',
  'function pollFinnhubQuotesOnce(', 'function patchUsStockLiveRow(',
  'const FX_RATES', 'function totalCNY(',
];

console.log('\n=== 核心 JS 函数存在性 ===');
for (const sig of REQUIRED_FUNCTIONS) {
  ok(html.includes(sig), `存在 ${sig.replace(/\(.*/, '(…)')}`);
}

console.log('\n=== 页面 DOM（page-* 独立页） ===');
const PAGES = ['overview', 'cn', 'us', 'au', 'history', 'news', 'fx', 'settings'];
for (const p of PAGES) {
  const re = new RegExp(`id=["']page-${p}["'][^>]*class=["'][^"']*\\bpage\\b`);
  ok(re.test(html) || new RegExp(`class=["']page[^"']*["'][^>]*id=["']page-${p}["']`).test(html),
    `page-${p} 带 .page 类（可 showPage 切换）`);
}

console.log('\n=== 各页关键容器 id ===');
const CONTAINERS = [
  ['cn-blocks', '中国区持仓容器'],
  ['us-blocks', '美国区持仓容器'],
  ['au-blocks', '澳洲区持仓容器'],
  ['us-stock-panel', '美股面板'],
  ['hist-tbody', 'NAV 历史表'],
  ['nav-history-chart', 'NAV 历史图'],
  ['news-list', '资讯列表'],
  ['fx-usd', '汇率输入 USD'],
  ['ov-events-list', '大事件列表'],
  ['goal-fill', '目标进度条'],
  ['ai-provider', 'AI provider 选择'],
  ['ai-diagnosis-output', 'AI 诊断输出'],
  ['chart-ov', '总览 NAV 图'],
  ['chart-alloc-region', '区域配置饼图'],
  ['chart-alloc-liq', '流动性结构饼图'],
  ['ov-regions', '总览区域持仓'],
];

for (const [id, label] of CONTAINERS) {
  ok(html.includes(`id="${id}"`) || html.includes(`id='${id}'`), `${label} #${id}`);
}

console.log('\n=== showPage 路由语义（应能直达 cn/us/au/history/news/fx） ===');
const showPageBody = (html.match(/function showPage\(id\)\{[\s\S]*?\n\}/) || [''])[0];
for (const id of ['cn', 'us', 'au', 'history', 'news', 'fx', 'overview', 'settings']) {
  const handles =
    showPageBody.includes(`id==='${id}'`) ||
    showPageBody.includes(`'${id}'`) && showPageBody.includes('portfolioSubs') && ['cn','us','au'].includes(id) ||
    showPageBody.includes('marketsSubs') && ['history','news','fx'].includes(id);
  ok(handles, `showPage 覆盖路由 "${id}"`);
}

console.log('\n=== 导航按钮 id（命令面板/深链依赖） ===');
for (const id of ['nav-overview', 'nav-cn', 'nav-us', 'nav-au', 'nav-history', 'nav-news', 'nav-fx', 'nav-settings']) {
  ok(html.includes(`id="${id}"`), `#${id} 导航按钮`);
}

console.log('\n=== 空壳 / 合并页风险检测 ===');
const cnPage = (html.match(/id=["']page-cn["'][\s\S]*?(?=id=["']page-)/) || [''])[0];
const usPage = (html.match(/id=["']page-us["'][\s\S]*?(?=id=["']page-)/) || [''])[0];
ok(cnPage.includes('cn-blocks'), 'page-cn 内含 #cn-blocks（非空壳）');
ok(usPage.includes('us-blocks'), 'page-us 内含 #us-blocks（非空壳）');
ok(!html.includes('function showPortfolioTab(') || html.includes('page-portfolio'),
  '若存在 portfolio hub，则为附加而非唯一入口');

console.log('\n=== renderOverview 仍渲染 ov-regions ===');
const ro = (html.match(/function renderOverview\(\)[\s\S]*?^}/m) || [''])[0];
ok(ro.includes('ov-regions'), 'renderOverview 写入 #ov-regions');

console.log('\n=== page-overview 不与其它 page 嵌套 ===');
ok(
  /<div class="page active" id="page-overview">[\s\S]*?<\/div>\s*<!-- CHINA -->\s*<div class="page" id="page-cn">/.test(html),
  'page-cn 在 page-overview 闭合之后（导航可切换）'
);

console.log(`\n${'='.repeat(44)}`);
console.log(`逻辑契约检查：通过 ${passed} · 失败 ${failed}`);
process.exit(failed > 0 ? 1 : 0);
