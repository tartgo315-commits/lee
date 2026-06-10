/**
 * 路由与页面渲染 E2E（验证业务逻辑未丢）
 * Run: node _test_routes_e2e.mjs  (需 5178 服务 + puppeteer)
 */
import puppeteer from 'puppeteer';

const URL = 'http://127.0.0.1:5178/index.html';
const SK = 'wo_v2';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const seed = {
  products: [
    { id: 1, region: 'cn', type: 'fund_cn', account: '支付宝', name: '测试基金', fundCode: '021740',
      fundShares: 100, fundCost: 1, fundPrice: 2, fundCurrency: 'CNY', createdAt: '2026-06-10', updatedAt: '2026-06-10' },
    { id: 2, region: 'us', type: 'stock_us', account: 'Tiger', name: 'Circle', ticker: 'CRCL',
      shares: 10, costPrice: 78.2, currentPrice: 84.1, stopLoss: 82.5, createdAt: '2026-06-10', updatedAt: '2026-06-10' },
    { id: 3, region: 'au', type: 'term_deposit', account: 'CBA', name: '定存', principal: 50000, rate: 4.1,
      tdCur: 'AUD', currency: 'AUD', tdStart: '2026-01-01', tdEnd: '2027-01-01', tdCompoundWeekly: true,
      createdAt: '2026-06-10', updatedAt: '2026-06-10' },
  ],
  navHistory: [{ date: '2026-06-01', cny: 200000 }, { date: '2026-06-10', cny: 210000 }],
  fx: { USD: 7.24, AUD: 4.75 },
  nextId: 4, settings: {}, usAccountMeta: {},
  goal: { amount: 1500000, currency: 'CNY', label: '存款目标' },
};

let passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; console.log('  ✓', m); } else { failed++; console.error('  ✗', m); } }

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate((key, data) => {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem('wo_hide_http_datatip', '1');
    localStorage.setItem('wo_proxy_skip', '1');
    localStorage.setItem('wo_theme_v', '5dark');
  }, SK, seed);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1200);

  console.log('\n=== 函数存在（运行时） ===');
  const fns = await page.evaluate(() => ({
    showPage: typeof showPage === 'function',
    renderOverview: typeof renderOverview === 'function',
    refreshAllQuotes: typeof refreshAllQuotes === 'function',
    runAiAdvisor: typeof runAiAdvisor === 'function',
    totalCNY: typeof totalCNY === 'function',
    importAssetsV2: typeof importAssetsV2 === 'function',
  }));
  for (const [k, v] of Object.entries(fns)) ok(v, `${k}()`);

  console.log('\n=== showPage 各路由 ===');
  const routes = [
    { id: 'overview', check: () => document.getElementById('page-overview')?.classList.contains('active') },
    { id: 'cn', check: () => document.getElementById('cn-blocks')?.innerHTML?.length > 20 },
    { id: 'us', check: () => document.getElementById('us-blocks')?.innerHTML?.length > 20 },
    { id: 'au', check: () => document.getElementById('au-blocks')?.innerHTML?.length > 20 },
    { id: 'history', check: () => document.getElementById('hist-tbody') != null },
    { id: 'news', check: () => document.getElementById('news-list') != null },
    { id: 'fx', check: () => document.getElementById('fx-usd') != null },
    { id: 'settings', check: () => document.getElementById('page-settings')?.classList.contains('active') },
  ];

  for (const r of routes) {
    await page.evaluate((id) => { showPage(id); }, r.id);
    await sleep(400);
    const okRoute = await page.evaluate((checkStr) => {
      const check = new Function('return (' + checkStr + ')()');
      return !!check();
    }, r.check.toString());
    ok(okRoute, `showPage('${r.id}') 页面可用`);
  }

  console.log('\n=== 总览数据 ===');
  await page.evaluate(() => showPage('overview'));
  await sleep(500);
  const ov = await page.evaluate(() => ({
    nav: document.getElementById('ov-cny')?.textContent || '',
    regions: document.getElementById('ov-regions')?.innerHTML?.length || 0,
    topHold: document.getElementById('ov-top-holdings')?.innerHTML?.length || 0,
    total: totalCNY(),
  }));
  ok(ov.total > 0, `totalCNY() = ${ov.total}`);
  ok(ov.nav.includes('¥'), `Hero NAV 有值: ${ov.nav.trim()}`);
  ok(ov.regions > 50 || ov.topHold > 50, `持仓区有内容 (ov-regions=${ov.regions}, top=${ov.topHold})`);

  console.log('\n=== 本地 AI 诊断 ===');
  await page.evaluate(() => { showPage('overview'); runAiAdvisor(); });
  await sleep(600);
  const aiLen = await page.$eval('#ai-diagnosis-output', (el) => el.innerHTML.length).catch(() => 0);
  ok(aiLen > 40, `runAiAdvisor 有输出 (${aiLen} chars)`);

  console.log(`\n路由 E2E：通过 ${passed} · 失败 ${failed}`);
} finally {
  await browser.close();
}
process.exit(failed > 0 ? 1 : 0);
