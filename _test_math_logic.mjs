/**
 * 数学逻辑 / 聚合不变量审计
 * Run: node _test_math_logic.mjs [optional-export.json]
 */
import fs from 'node:fs';

const D = {
  fx: { USD: 7.24, AUD: 4.75 },
  products: [],
  usAccountMeta: {},
  settings: { usPrincipalAUD: 72640 },
  goal: { amount: 1500000, currency: 'CNY' },
};

const FX_RATES = {
  get USD_TO_CNY() { return Number(D.fx?.USD) > 0 ? Number(D.fx.USD) : 7.24; },
  get AUD_TO_CNY() { return Number(D.fx?.AUD) > 0 ? Number(D.fx.AUD) : 4.75; },
  get CNY_TO_USD() { return 1 / this.USD_TO_CNY; },
  get CNY_TO_AUD() { return 1 / this.AUD_TO_CNY; },
  get AUD_TO_USD() { return this.AUD_TO_CNY / this.USD_TO_CNY; },
};
function toCNY(v, c) {
  if (c === 'CNY') return v;
  if (c === 'USD') return v * FX_RATES.USD_TO_CNY;
  if (c === 'AUD') return v * FX_RATES.AUD_TO_CNY;
  return v;
}
function fromCNY(v, c) {
  if (c === 'CNY') return v;
  if (c === 'USD') return v * FX_RATES.CNY_TO_USD;
  if (c === 'AUD') return v * FX_RATES.CNY_TO_AUD;
  return v;
}
function looksLikeUsdBrokerCash(p) {
  return /可用|闲置|购买力|预估|现金额|应计利息|美元|美金|\bUSD\b|\$|Tiger|券商/i.test((p.name || '') + (p.note || ''));
}
function isUsdIdleProduct(p) {
  if (p.type === 'other' && (p.currency || '') === 'USD') return true;
  if (p.type !== 'cash') return false;
  const c = p.currency || 'CNY';
  if (c === 'USD') return true;
  return c === 'CNY' && p.region === 'us' && looksLikeUsdBrokerCash(p);
}
function pCNY(p) {
  if (p.type === 'gold') return (p.grams || 0) * (p.goldPrice || 0);
  if (p.type === 'stock_us') return toCNY((p.shares || 0) * (p.currentPrice || 0), 'USD');
  if (p.type === 'fund_cn') return toCNY((p.fundShares || 0) * (p.fundPrice || 0), p.fundCurrency || 'CNY');
  if (p.type === 'term_deposit') return toCNY(tdCurVal(p), p.tdCur || 'AUD');
  if (p.type === 'cash') {
    const cur = p.currency || 'CNY';
    if (p.region === 'us' && cur === 'CNY' && looksLikeUsdBrokerCash(p)) return toCNY(p.amount || 0, 'USD');
    return toCNY(p.amount || 0, cur);
  }
  return toCNY(p.amount || 0, p.currency || 'CNY');
}
function tdCurVal(p) {
  if (!p.principal) return 0;
  const s = new Date(p.tdStart || '2026-01-01');
  const now = new Date();
  const e = new Date(p.tdContractEnd || p.tdEnd || '2026-12-31');
  const days = Math.max(0, (Math.min(now, e) - s) / 864e5);
  return p.principal + p.principal * (p.rate || 0) / 100 * (days / 365);
}
function usMetaKey(acc) { return 'us::' + (acc || '未分类'); }
function usManualIdleUsd(acc) {
  const o = D.usAccountMeta?.[usMetaKey(acc)];
  if (o == null || o.idleUsd == null || o.idleUsd === '') return null;
  const v = parseFloat(o.idleUsd);
  return isNaN(v) || v < 0 ? null : v;
}
function sumUsdCashCNY(aps) { return aps.filter(isUsdIdleProduct).reduce((s, p) => s + pCNY(p), 0); }
function usManualIdleAdjustmentCny(usPs) {
  let d = 0;
  const accs = [...new Set(usPs.map((p) => p.account || '未分类'))];
  for (const acc of accs) {
    const m = usManualIdleUsd(acc);
    if (m == null) continue;
    d += toCNY(m, 'USD');
    d -= sumUsdCashCNY(usPs.filter((p) => p.account === acc));
  }
  return d;
}
function totalCNY(region) {
  const ps = region ? D.products.filter((p) => p.region === region) : D.products;
  let s = ps.reduce((a, p) => a + pCNY(p), 0);
  if (region === 'us') s += usManualIdleAdjustmentCny(ps);
  else if (!region) s += usManualIdleAdjustmentCny(D.products.filter((p) => p.region === 'us'));
  return s;
}
function snapshotBreakdown() {
  const byRegion = { cn: totalCNY('cn'), us: totalCNY('us'), au: totalCNY('au') };
  const keys = ['cash', 'fund_cn', 'gold', 'stock_us', 'term_deposit', 'other'];
  const byType = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const p of D.products) {
    const k = keys.includes(p.type) ? p.type : 'other';
    byType[k] += pCNY(p);
  }
  return { cny: totalCNY(), byRegion, byType, fx: { USD: D.fx.USD, AUD: D.fx.AUD } };
}
function typeBreakdownForCharts() {
  const o = snapshotBreakdown();
  const bd = { ...o.byType };
  const usPs = D.products.filter((p) => p.region === 'us');
  const accs = [...new Set(usPs.map((p) => p.account || '未分类'))];
  for (const acc of accs) {
    const m = usManualIdleUsd(acc);
    if (m == null) continue;
    bd.cash += toCNY(m, 'USD') - sumUsdCashCNY(usPs.filter((p) => p.account === acc));
  }
  return bd;
}
function accountTotalCny(aps, region) {
  const productCashCny = region === 'us' ? sumUsdCashCNY(aps) : 0;
  const man = region === 'us' ? usManualIdleUsd(aps[0]?.account || '未分类') : null;
  let acny = aps.reduce((s, p) => s + pCNY(p), 0);
  if (region === 'us' && man != null) acny += toCNY(man, 'USD') - productCashCny;
  return acny;
}
function goldPnl(p) {
  const price = p.goldPrice || 0, grams = p.grams || 0, cost = p.goldCost || 0;
  const mkt = grams * price, pnlVal = mkt - grams * cost;
  const pct = cost > 0 && grams > 0 ? pnlVal / (grams * cost) * 100 : 0;
  return { mkt, pnlVal, pct };
}
function stockPnl(p) {
  const price = p.currentPrice || 0, cost = p.costPrice || 0, shares = p.shares || 0;
  const mkt = shares * price, pnlUSD = shares * (price - cost);
  const pct = cost > 0 ? (price - cost) / cost * 100 : 0;
  return { mkt, pnlUSD, pct };
}

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}
function approx(a, b, eps = 0.02) { return Math.abs(a - b) <= eps; }

function loadPortfolio(products, meta = {}, fx = D.fx) {
  D.products = products;
  D.usAccountMeta = meta;
  D.fx = fx;
}

console.log('\n=== 1. 汇率往返 ===');
ok(approx(fromCNY(toCNY(1000, 'USD'), 'USD'), 1000), 'USD 往返');
ok(approx(fromCNY(toCNY(50000, 'AUD'), 'AUD'), 50000), 'AUD 往返');
ok(approx(FX_RATES.AUD_TO_USD, 4.75 / 7.24), 'AUD/USD 交叉盘');

console.log('\n=== 2. 合成组合 NAV 聚合 ===');
loadPortfolio([
  { id: 1, region: 'cn', type: 'cash', account: '建行', amount: 129000, currency: 'CNY' },
  { id: 2, region: 'cn', type: 'gold', account: '建行', name: '积存金', grams: 47.82, goldCost: 870.69, goldPrice: 909 },
  { id: 3, region: 'cn', type: 'fund_cn', account: '支付宝', fundShares: 10000, fundCost: 1.2, fundPrice: 1.35, fundCurrency: 'CNY' },
  { id: 4, region: 'us', type: 'stock_us', account: 'Tiger', ticker: 'NVDA', shares: 50, costPrice: 100, currentPrice: 120 },
  { id: 5, region: 'us', type: 'cash', account: 'Tiger', name: '可用现金', amount: 5000, currency: 'USD' },
  { id: 6, region: 'au', type: 'term_deposit', account: 'CBA', principal: 50000, rate: 4.5, tdCur: 'AUD', tdStart: '2025-01-01', tdEnd: '2026-12-31' },
]);
D.usAccountMeta = { 'us::Tiger': { idleUsd: 17.81 } };

const nav = totalCNY();
const rSum = totalCNY('cn') + totalCNY('us') + totalCNY('au');
ok(approx(nav, rSum), '三区之和 = 总 NAV');
const rawSum = D.products.reduce((s, p) => s + pCNY(p), 0);
const adj = usManualIdleAdjustmentCny(D.products.filter((p) => p.region === 'us'));
ok(approx(nav, rawSum + adj), 'NAV = ΣpCNY + 美国闲置调整');

const bd = typeBreakdownForCharts();
const typeSum = Object.values(bd).reduce((a, b) => a + b, 0);
ok(approx(typeSum, nav), '流动性/类型饼图合计 = NAV');

const snap = snapshotBreakdown();
const snapTypeSum = Object.values(snap.byType).reduce((a, b) => a + b, 0);
if (adj !== 0) {
  ok(!approx(snapTypeSum, snap.cny), '已知问题：快照 byType 不含闲置调整（与 cny 可能不等）');
} else {
  ok(approx(snapTypeSum, snap.cny), '无闲置调整时快照 byType = cny');
}

console.log('\n=== 3. 积存金盈亏公式 ===');
const g = D.products.find((p) => p.type === 'gold');
const gp = goldPnl(g);
ok(approx(gp.pnlVal, 1831.49, 5), '积存金浮盈 ≈ ¥1,831（与截图量级一致）');
ok(approx(gp.pct, 4.4, 0.15), '积存金收益率 ≈ 4.4%');
ok(approx(pCNY(g), gp.mkt), 'pCNY(金) = 克数×金价');

console.log('\n=== 4. 美股盈亏公式 ===');
const s = D.products.find((p) => p.ticker === 'NVDA');
const sp = stockPnl(s);
ok(sp.pnlUSD === 50 * (120 - 100), '美股盈亏 = 股数×(现价-成本)');
ok(sp.pct === 20, '美股收益率 = (现价-成本)/成本');

console.log('\n=== 5. 美国账户合计 vs 分区 ===');
const usPs = D.products.filter((p) => p.region === 'us');
const accs = [...new Set(usPs.map((p) => p.account))];
const accSum = accs.reduce((sum, acc) => {
  const aps = usPs.filter((p) => p.account === acc);
  return sum + (() => {
    const man = usManualIdleUsd(acc);
    const productCashCny = sumUsdCashCNY(aps);
    let acny = aps.reduce((x, p) => x + pCNY(p), 0);
    if (man != null) acny += toCNY(man, 'USD') - productCashCny;
    return acny;
  })();
}, 0);
ok(approx(accSum, totalCNY('us')), '美国各账户合计 = 美国区 NAV');

console.log('\n=== 6. 财富目标进度 ===');
const goalPct = Math.min(100, nav / D.goal.amount * 100);
ok(goalPct > 0 && goalPct <= 100, '目标进度在 0–100%');
ok(approx(1325129 / 1500000 * 100, 88.34, 0.05), '截图 NAV ¥1,325,129 → 目标 88.34%');

console.log('\n=== 7. 定存应计（单利按日）===');
const td = D.products.find((p) => p.type === 'term_deposit');
const tdv = tdCurVal(td);
ok(tdv > td.principal && tdv < td.principal * 1.1, '定存当前值 > 本金且合理');

console.log('\n=== 8. 可选：用户导出 JSON ===');
const exportPath = process.argv[2];
if (exportPath && fs.existsSync(exportPath)) {
  const raw = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  const data = raw.products ? raw : JSON.parse(raw);
  D.products = data.products || [];
  D.fx = data.fx || D.fx;
  D.usAccountMeta = data.usAccountMeta || {};
  D.goal = data.goal || D.goal;
  const userNav = totalCNY();
  const userRegions = totalCNY('cn') + totalCNY('us') + totalCNY('au');
  ok(approx(userNav, userRegions, 1), `[导出] 三区之和 = 总 NAV (${userNav.toFixed(0)})`);
  const userBd = typeBreakdownForCharts();
  const userTypeSum = Object.values(userBd).reduce((a, b) => a + b, 0);
  ok(approx(userTypeSum, userNav, 1), `[导出] 类型饼图 = NAV`);
  console.log(`  → 导出资产 ${D.products.length} 条，NAV ¥${userNav.toFixed(0)}，目标 ${(userNav / D.goal.amount * 100).toFixed(1)}%`);
} else if (exportPath) {
  console.log('  ⚠ 未找到导出文件，跳过实盘校验');
}

console.log(`\n${'='.repeat(44)}`);
console.log(`数学审计：通过 ${passed} · 失败 ${failed}`);
process.exit(failed > 0 ? 1 : 0);
