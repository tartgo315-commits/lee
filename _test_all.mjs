/**
 * Regression tests for FX_RATES, asset v2, prepareSanitizedPayload
 * Run: node _test_all.mjs
 */
import fs from 'node:fs';

const D = { fx: { USD: 7.24, AUD: 4.75 }, products: [] };

const FX_RATES = {
  get USD_TO_CNY() { return Number(D.fx?.USD) > 0 ? Number(D.fx.USD) : 7.24; },
  get AUD_TO_CNY() { return Number(D.fx?.AUD) > 0 ? Number(D.fx.AUD) : 4.75; },
  get CNY_TO_USD() { return 1 / this.USD_TO_CNY; },
  get CNY_TO_AUD() { return 1 / this.AUD_TO_CNY; },
  get AUD_TO_USD() { return this.AUD_TO_CNY / this.USD_TO_CNY; },
  get USD_TO_AUD() { return this.USD_TO_CNY / this.AUD_TO_CNY; },
  syncCross() {
    D.fx.USDAUD = parseFloat(this.USD_TO_AUD.toFixed(5));
  },
};

function currencyToCnyRate(c) {
  const u = String(c || 'CNY').toUpperCase();
  if (u === 'CNY') return 1;
  if (u === 'USD') return FX_RATES.USD_TO_CNY;
  if (u === 'AUD') return FX_RATES.AUD_TO_CNY;
  return 1;
}
function toCNY(v, c) {
  if (c === 'CNY') return v;
  if (c === 'USD') return v * FX_RATES.USD_TO_CNY;
  if (c === 'AUD') return v * FX_RATES.AUD_TO_CNY;
  return v * currencyToCnyRate(c);
}
function aiRoundWan(n) {
  const v = Number(n);
  if (!isFinite(v)) return 0;
  return Math.round(v / 10000) * 10000;
}
function aiBucketPct(p) {
  const v = Number(p);
  if (!isFinite(v)) return '—';
  if (v >= 45) return `高集中 ${v.toFixed(0)}%`;
  if (v >= 25) return `中等 ${v.toFixed(0)}%`;
  return `分散 ${v.toFixed(0)}%`;
}
function assetV2CnyValue(asset) {
  const cur = String(asset.currency || 'CNY').toUpperCase();
  const qty = Number(asset.holding_qty) || 0;
  if (asset.asset_type === 'Cash' || asset.asset_type === 'Lock') return qty * currencyToCnyRate(cur);
  const px = Number(asset.current_price);
  const price = isFinite(px) && px > 0 ? px : Number(asset.cost_price) > 0 ? Number(asset.cost_price) : 0;
  return qty * price * currencyToCnyRate(cur);
}
function prepareSanitizedPayload(rawAssets, totalNav) {
  const TOTAL_NAV = Number(totalNav) > 0 ? Number(totalNav) : 0;
  if (!Array.isArray(rawAssets) || TOTAL_NAV <= 0) return [];
  return rawAssets.map((asset) => {
    const cnyVal = assetV2CnyValue(asset);
    const allocationPct = TOTAL_NAV > 0 ? (cnyVal / TOTAL_NAV) * 100 : 0;
    const rp = asset.risk_profile || {};
    const px = Number(asset.current_price);
    const sl = Number(rp.stop_loss_price);
    const triggered = !!rp.is_triggered || (rp.has_stop_loss && sl > 0 && px > 0 && px <= sl);
    return {
      market: asset.market,
      asset_type: asset.asset_type,
      currency: String(asset.currency || 'CNY').toUpperCase(),
      allocation_percentage: Math.round(allocationPct * 10) / 10,
      allocation_bucket: aiBucketPct(allocationPct),
      notional_cny_blurred: aiRoundWan(cnyVal),
      status: triggered ? 'TRIGGERED_WARNING' : 'NORMAL',
    };
  });
}

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  ✓', msg);
  } else {
    failed++;
    console.error('  ✗', msg);
  }
}
function approx(a, b, eps = 0.001) {
  return Math.abs(a - b) < eps;
}

console.log('\n=== FX_RATES 矩阵 ===');
FX_RATES.syncCross();
assert(approx(FX_RATES.USD_TO_CNY, 7.24), 'USD_TO_CNY = 7.24');
assert(approx(FX_RATES.AUD_TO_CNY, 4.75), 'AUD_TO_CNY = 4.75');
assert(approx(FX_RATES.CNY_TO_USD, 1 / 7.24), 'CNY_TO_USD 倒数');
assert(approx(FX_RATES.AUD_TO_USD, 4.75 / 7.24), 'AUD_TO_USD 交叉盘');
assert(approx(FX_RATES.USD_TO_AUD, 7.24 / 4.75), 'USD_TO_AUD 交叉盘');
assert(approx(D.fx.USDAUD, 7.24 / 4.75), 'syncCross 写入 D.fx.USDAUD');
assert(approx(toCNY(100, 'USD'), 724), 'toCNY 100 USD');
assert(approx(toCNY(100, 'AUD'), 475), 'toCNY 100 AUD');

console.log('\n=== prepareSanitizedPayload ===');
const crcl = {
  market: 'US',
  asset_type: 'Investment',
  currency: 'USD',
  holding_qty: 10,
  cost_price: 78.2,
  current_price: 84.1,
  risk_profile: { has_stop_loss: true, stop_loss_price: 82.5, is_triggered: false },
};
const cash = { market: 'US', asset_type: 'Cash', currency: 'USD', holding_qty: 5000 };
const nav = assetV2CnyValue(crcl) + assetV2CnyValue(cash);
const payload = prepareSanitizedPayload([crcl, cash], nav);
assert(payload.length === 2, '两条资产');
assert(!('ticker' in payload[0]) && !('holding_qty' in payload[0]), '无 ticker/数量');
assert(payload[0].market === 'US' && payload[0].status === 'NORMAL', 'CRCL 未触发止损');
assert(payload[0].allocation_percentage > 0, 'CRCL 有占比');
const triggered = prepareSanitizedPayload(
  [{ ...crcl, current_price: 80, risk_profile: { has_stop_loss: true, stop_loss_price: 82.5 } }],
  assetV2CnyValue({ ...crcl, current_price: 80 })
);
assert(triggered[0].status === 'TRIGGERED_WARNING', '跌破止损 → TRIGGERED_WARNING');

console.log('\n=== index.html 静态检查 ===');
const html = fs.readFileSync('index.html', 'utf8');
assert(html.includes('--bg-page:#080B12'), '暗黑画布色');
assert(html.includes('FX_RATES'), 'FX_RATES 存在');
assert(html.includes('prepareSanitizedPayload'), 'prepareSanitizedPayload 存在');
assert(html.includes('productToAssetV2'), 'asset v2 导出');
assert(html.includes('portfolioPayload'), 'AI 请求携带 portfolioPayload');
assert(html.includes('--fs-nav:40px'), 'NAV 字号变量');
assert(!html.match(/<style><\/style>/), 'style 块非空');

console.log('\n=== api/ai-advisor.js ===');
const api = fs.readFileSync('api/ai-advisor.js', 'utf8');
assert(api.includes('portfolioPayload'), 'API 解析 portfolioPayload');

console.log(`\n${'='.repeat(40)}`);
console.log(`通过 ${passed} · 失败 ${failed}`);
process.exit(failed > 0 ? 1 : 0);
