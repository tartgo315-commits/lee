/**
 * E2E smoke test via Puppeteer
 * Run: npx -y puppeteer@23 node _test_e2e.mjs
 */
import puppeteer from 'puppeteer';

const URL = 'http://127.0.0.1:5178/index.html';
const SK = 'wo_v2';

const seed = {
  products: [
    {
      id: 1, region: 'us', type: 'stock_us', account: 'Tiger', name: 'Circle', ticker: 'CRCL',
      shares: 10, costPrice: 78.2, currentPrice: 84.1, stopLoss: 82.5,
      risk_profile: { has_stop_loss: true, stop_loss_price: 82.5, is_triggered: false },
      createdAt: '2026-06-10', updatedAt: '2026-06-10',
    },
    {
      id: 2, region: 'us', type: 'cash', account: 'Tiger', name: '可用现金',
      amount: 5000, currency: 'USD', createdAt: '2026-06-10', updatedAt: '2026-06-10',
    },
    {
      id: 3, region: 'au', type: 'term_deposit', account: 'CBA', name: '定存',
      principal: 50000, rate: 4.5, tdCur: 'AUD', currency: 'AUD',
      tdStart: '2026-01-01', tdEnd: '2027-01-01', tdCompoundWeekly: true,
      createdAt: '2026-06-10', updatedAt: '2026-06-10',
    },
  ],
  navHistory: [],
  fx: { USD: 7.24, AUD: 4.75 },
  nextId: 4,
  settings: {},
  usAccountMeta: {},
  goal: { amount: 1500000, currency: 'CNY', label: '存款目标' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
let failed = 0;
function ok(c, m) {
  if (c) { passed++; console.log('  ✓', m); }
  else { failed++; console.error('  ✗', m); }
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // seed localStorage
  await page.evaluate((key, data) => {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem('wo_hide_http_datatip', '1');
    localStorage.setItem('wo_proxy_skip', '1');
    localStorage.setItem('wo_theme_v', '5dark');
    localStorage.removeItem('wo_light');
  }, SK, seed);
  await page.reload({ waitUntil: 'domcontentloaded' });

  // dismiss banners if any
  await page.evaluate(() => {
    ['http-data-migrate-banner', 'proxy-miss-banner', 'file-protocol-banner'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  });

  await page.waitForFunction(() => document.getElementById('ov-cny')?.textContent?.includes('¥'), { timeout: 8000 }).catch(() => {});

  const ui = await page.evaluate(() => {
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const navEl = document.getElementById('ov-cny');
    const navFs = navEl ? getComputedStyle(navEl).fontSize : '';
    const navFw = navEl ? getComputedStyle(navEl).fontWeight : '';
    const tickerText = document.getElementById('cmd-tickers')?.textContent || '';
    return {
      bodyBg,
      navText: navEl?.textContent || '',
      navFs,
      navFw,
      tickerHasUsdCny: /USD\/CNY/.test(tickerText) && /7\.2/.test(tickerText),
      tickerHasGold: /Gold/i.test(tickerText),
      totalNav: typeof totalCNY === 'function' ? totalCNY() : 0,
    };
  });

  ok(ui.bodyBg === 'rgb(11, 15, 23)' || ui.bodyBg.includes('11, 15, 23'), `暗黑背景 body = ${ui.bodyBg}`);
  ok(ui.navText.includes('¥') && !ui.navText.includes('—'), `NAV 有数值: ${ui.navText.trim()}`);
  ok(parseFloat(ui.navFs) >= 28, `NAV 字号合理 (${ui.navFs})`);
  ok(parseInt(ui.navFw, 10) >= 600, `NAV 字重 ≥600 (${ui.navFw})`);
  ok(ui.tickerHasUsdCny, '驾驶舱 Ticker 含 USD/CNY');
  ok(ui.tickerHasGold, '驾驶舱 Ticker 含 Gold');

  await page.evaluate(() => { showPage('us'); });
  await sleep(500);
  const usUi = await page.evaluate(() => {
    const crclRow = [...document.querySelectorAll('.pr-sub,.ov-prod-sub')].find((e) => e.textContent.includes('止损'));
    return { crclStopSub: crclRow?.textContent || '' };
  });
  ok(usUi.crclStopSub.includes('止损'), `CRCL 行显示止损: ${usUi.crclStopSub.slice(0, 40)}…`);
  ok(ui.totalNav > 0, `TOTAL_NAV > 0 (${ui.totalNav})`);

  const payload = await page.evaluate(() => {
    if (typeof getSanitizedPortfolioPayload !== 'function') return null;
    return getSanitizedPortfolioPayload();
  });
  ok(Array.isArray(payload) && payload.length >= 2, `脱敏 payload ${payload?.length} 条`);
  ok(payload?.every((p) => !('ticker' in p) && p.status), 'payload 无 ticker 且有 status');
  ok(payload?.some((p) => p.market === 'US' && p.asset_type === 'Investment'), '含 US Investment');

  // v2 import
  const importResult = await page.evaluate(() => {
    const assets = [{
      market: 'US', asset_type: 'Investment', currency: 'USD', ticker: 'VOO',
      holding_qty: 5, cost_price: 400, current_price: 410,
      account: 'Tiger', name: 'Vanguard',
    }];
    const before = D.products.length;
    const n = importAssetsV2(assets);
    return { n, after: D.products.length, hasVoo: D.products.some((p) => p.ticker === 'VOO') };
  });
  ok(importResult.n === 1 && importResult.hasVoo, 'v2 导入 VOO 成功');

  // FX page
  await page.click('#nav-fx');
  await sleep(500);
  const fxUsd = await page.$eval('#fx-usd', (el) => el.value).catch(() => '');
  ok(fxUsd === '7.24' || fxUsd === '7.240', `汇率页 USD 默认 ${fxUsd}`);

  // local diagnose (no API)
  await page.click('#nav-overview');
  await sleep(300);
  await page.evaluate(() => { if (typeof runAiAdvisor === 'function') runAiAdvisor(); });
  await sleep(800);
  const diagHtml = await page.$eval('#ai-diagnosis-output', (el) => el.innerHTML).catch(() => '');
  ok(diagHtml.length > 50, '本地诊断有输出');

  console.log(`\nE2E: 通过 ${passed} · 失败 ${failed}`);
} finally {
  await browser.close();
}
process.exit(failed > 0 ? 1 : 0);
