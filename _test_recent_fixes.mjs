/**
 * 验证最近四项修复的逻辑
 * Run: node _test_recent_fixes.mjs [LEEsWealth.json]
 */
import fs from 'node:fs';

const FX = { USD: 7.24, AUD: 4.75 };
const FX_RATES = {
  get USD_TO_CNY() { return FX.USD; },
  get AUD_TO_CNY() { return FX.AUD; },
};
function toCNY(v, c) {
  if (c === 'CNY') return v;
  if (c === 'USD') return v * FX.USD;
  if (c === 'AUD') return v * FX.AUD;
  return v;
}
function fromCNY(v, c) {
  if (c === 'CNY') return v;
  if (c === 'USD') return v / FX.USD;
  if (c === 'AUD') return v / FX.AUD;
  return v;
}
function aiRoundWan(n) {
  const v = Number(n);
  if (!isFinite(v)) return 0;
  return Math.round(v / 10000) * 10000;
}
function snapHistUsdAud(n) {
  const snapUsdRate = n.fx?.USD > 0 ? n.fx.USD : FX_RATES.USD_TO_CNY;
  const snapAudRate = n.fx?.AUD > 0 ? n.fx.AUD : FX_RATES.AUD_TO_CNY;
  return { usd: n.cny / snapUsdRate, aud: n.cny / snapAudRate, snapUsdRate, snapAudRate };
}
function fundNotionalCny(p) {
  return aiRoundWan(toCNY((p.fundPrice || 0) * (p.fundShares || 0), p.fundCurrency || 'CNY'));
}
function missingGoldPrice(products) {
  return products.some((p) => p.type === 'gold' && !(p.goldPrice > 0));
}
function assetV2TdOrig(a) {
  return Number(a.tdOrigPrincipal) > 0 ? Number(a.tdOrigPrincipal) : null;
}

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}
function approx(a, b, eps = 1) {
  return Math.abs(a - b) <= eps;
}

console.log('\n=== 修复 1：NAV 历史快照汇率 ===');
const snapOld = { cny: 1270051.771530838, fx: { USD: 6.91965, AUD: 4.74372 } };
const { usd: snapUsd, aud: snapAud } = snapHistUsdAud(snapOld);
const wrongUsd = fromCNY(snapOld.cny, 'USD'); // 用当前 7.24
ok(snapUsd > wrongUsd, `2026-03-30 快照 USD：按当时汇率 ${snapUsd.toFixed(0)} > 按现汇率 ${wrongUsd.toFixed(0)}`);
ok(approx(snapUsd, snapOld.cny / 6.91965), 'USD = cny / snap.fx.USD');
ok(approx(snapAud, snapOld.cny / 4.74372), 'AUD = cny / snap.fx.AUD');
const snapNoFx = { cny: 1000000, fx: {} };
const fb = snapHistUsdAud(snapNoFx);
ok(approx(fb.usd, 1000000 / FX.USD), '无 fx 时 fallback 到当前 USD 汇率');

console.log('\n=== 修复 2：AI 基金 USD→CNY ===');
const usdFund = { fundPrice: 1.024744, fundShares: 10143.42, fundCurrency: 'USD' };
const cnyFund = { fundPrice: 2.0605, fundShares: 30937.15, fundCurrency: 'CNY' };
const usdNotional = fundNotionalCny(usdFund);
const wrongUsdNotional = aiRoundWan(usdFund.fundPrice * usdFund.fundShares);
ok(usdNotional > wrongUsdNotional * 5, `USD 基金名义 ${usdNotional} >> 未换算 ${wrongUsdNotional}`);
ok(approx(usdNotional, aiRoundWan(toCNY(10143.42 * 1.024744, 'USD')), 10000), '海嘉稳利量级约 7 万 CNY');
ok(fundNotionalCny(cnyFund) === aiRoundWan(30937.15 * 2.0605), 'CNY 基金换算不变');

console.log('\n=== 修复 3：金价缺失警告 ===');
ok(missingGoldPrice([{ type: 'gold', goldPrice: 0 }]), 'goldPrice=0 → 应警告');
ok(!missingGoldPrice([{ type: 'gold', goldPrice: 917.38 }]), '有金价 → 不警告');
ok(!missingGoldPrice([{ type: 'fund_cn' }]), '无黄金 → 不警告');
ok(missingGoldPrice([{ type: 'gold', goldPrice: null }]), 'goldPrice 空 → 应警告');

console.log('\n=== 修复 4：assetV2 定存 tdOrigPrincipal ===');
ok(assetV2TdOrig({ tdOrigPrincipal: 20748.74 }) === 20748.74, '有值时写入');
ok(assetV2TdOrig({ tdOrigPrincipal: 0 }) === null, '0 时不预设');
ok(assetV2TdOrig({}) === null, '缺失时不预设');

const exportPath = process.argv[2] || 'c:/Users/Administrator/Downloads/LEEsWealth_2026-06-12.json';
if (fs.existsSync(exportPath)) {
  console.log('\n=== 实盘 JSON 交叉验证 ===');
  const D = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  FX.USD = D.fx?.USD || 7.24;
  FX.AUD = D.fx?.AUD || 4.75;
  const snap330 = D.navHistory?.find((n) => n.date === '2026-03-30');
  if (snap330?.fx) {
    const h = snapHistUsdAud(snap330);
    const live = fromCNY(snap330.cny, 'USD');
    ok(Math.abs(h.usd - live) > 1000, `[导出] 3/30 快照 USD 与现汇率差 > $1000（${(h.usd - live).toFixed(0)}）`);
  }
  const haijia = D.products?.find((p) => p.name?.includes('海嘉'));
  if (haijia) {
    const n = fundNotionalCny(haijia);
    ok(n >= 60000 && n <= 80000, `[导出] 海嘉稳利 AI 名义 ${n} 在 6–8 万区间`);
  }
  ok(!missingGoldPrice(D.products || []), '[导出] 当前数据有金价，不应警告');
  const auTd = D.products?.find((p) => p.type === 'term_deposit' && p.tdOrigPrincipal > 0);
  if (auTd) ok(auTd.tdOrigPrincipal > 0 && auTd.tdOrigPrincipal <= auTd.principal, '[导出] 定存 tdOrigPrincipal ≤ principal');
}

console.log(`\n${'='.repeat(44)}`);
console.log(`验证：通过 ${passed} · 失败 ${failed}`);
process.exit(failed > 0 ? 1 : 0);
