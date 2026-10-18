import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('calculation-engine.js','utf8');
const context=vm.createContext({Intl,Date,console});vm.runInContext(source,context);const M=context.WealthMath;
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
const near=(actual,expected,tolerance=0.011)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const deposit=(extra={})=>({type:'term_deposit',region:'au',principal:10000,rate:5,tdStart:'2025-01-01',tdEnd:'2026-01-01',...extra});
const ctx={fx:{USD:7,AUD:5},quoteCache:{},now:new Date('2026-10-18T12:00:00Z')};
test('Decimal multiplication and summation round only in currency units',()=>{
  assert.equal(M.sum([0.1,0.2,-0.3]),0);assert.equal(M.multiply('0.005',1),0.01);assert.equal(M.multiply('-0.005',1),-0.01);
  assert.equal(M.multiply('1.2345','123.4567','7.1234'),1085.66);
  assert.equal(M.sum([1000000000.01,-1000000000,0.02]),0.03);
});
test('Civil dates reject invalid dates and support leap days',()=>{
  assert.equal(M.dayIndex('2026-02-30'),null);assert.equal(M.dayIndex('2024-02-29')!==null,true);
  assert.equal(M.dayIndex('2025-03-10')-M.dayIndex('2025-03-08'),2);
});
test('Book dates respect selected time zone around UTC midnight',()=>{
  const instant=new Date('2026-10-17T16:05:00Z');assert.equal(M.dateInZone(instant,'Asia/Shanghai'),'2026-10-18');assert.equal(M.dateInZone(instant,'America/New_York'),'2026-10-17');
});
test('Actual/365, Actual/360 and Actual/Actual use their documented day counts',()=>{
  near(M.yearFraction('2024-01-01','2025-01-01','ACT/365F'),366/365,1e-12);
  near(M.yearFraction('2024-01-01','2025-01-01','ACT/ACT'),1,1e-12);
  near(M.yearFraction('2025-01-01','2026-01-01','ACT/360'),365/360,1e-12);
  assert.equal(M.yearFraction('2026-01-02','2026-01-01'),null);
});
test('Simple deposit uses whole contract days, caps at maturity and stops accruing',()=>{
  const p=deposit();assert.equal(M.depositValue(p,'2026-01-01').value,10500);assert.equal(M.depositValue(p,'2027-01-01').value,10500);assert.equal(M.depositValue(p,'2025-01-01').interest,0);
});
test('Weekly compounding is deterministic and never modifies principal or start date',()=>{
  const p=deposit({tdMethod:'weekly',tdRoundInterest:false}),original=JSON.stringify(p);
  const once=M.depositValue(p,'2026-01-01').value;
  for(let day=1;day<=365;day++)M.depositValue(p,new Date(Date.UTC(2025,0,1)+day*86400000).toISOString().slice(0,10));
  assert.equal(M.depositValue(p,'2026-01-01').value,once);assert.equal(JSON.stringify(p),original);
  near(once,10000*(1+0.05*7/365)**52*(1+0.05/365));
});
test('Monthly compounding uses calendar anniversaries including month ends',()=>{
  const p=deposit({tdStart:'2024-01-31',tdEnd:'2024-03-31',tdMethod:'monthly',tdRoundInterest:false});
  near(M.depositValue(p,'2024-03-31').value,10000*(1+.05*29/365)*(1+.05*31/365));
  assert.equal(M.addMonths('2024-01-31',1),'2024-02-29');assert.equal(M.addMonths('2024-01-31',2),'2024-03-31');
});
test('Contract basis controls leap-year interest',()=>{
  assert.equal(M.depositValue(deposit({tdStart:'2024-01-01',tdEnd:'2025-01-01',tdDayCount:'ACT/ACT'}),'2025-01-01').value,10500);
  near(M.depositValue(deposit({tdStart:'2024-01-01',tdEnd:'2025-01-01'}),'2025-01-01').value,10501.37);
});
test('Invalid contract data is incomplete rather than a zero-value deposit',()=>{
  assert.equal(M.depositValue(deposit({tdStart:''}),'2026-01-01').value,null);
  assert.equal(M.depositValue(deposit({tdEnd:'2024-01-01'}),'2026-01-01').complete,false);
});
test('Legacy migration keeps raw contractual fields and is idempotent',()=>{
  const p=deposit({principal:10300,tdStart:'2025-09-01',tdOrigPrincipal:10000,tdContractStart:'2025-01-01',tdCompoundWeekly:true});
  const data=M.migrate({products:[p],settings:{}}),first=JSON.stringify(data);
  assert.equal(p.principal,10300);assert.equal(p.tdStart,'2025-09-01');assert.equal(p.tdBasisPrincipal,10000);assert.equal(p.tdBasisStart,'2025-01-01');assert.equal(p.tdNeedsReview,true);
  assert.equal(JSON.stringify(M.migrate(data)),first);
});
test('Legacy rolled records without original dates keep a stable anchor and require review',()=>{
  const p=deposit({principal:10300,tdStart:'2025-09-01',tdOrigPrincipal:10000,tdCompoundWeekly:true});M.migrate({products:[p]});
  assert.equal(p.tdBasisPrincipal,10300);assert.equal(p.tdBasisStart,'2025-09-01');assert.equal(p.tdLegacyState.tdOrigPrincipal,10000);
});
test('Explicit currencies override suggestive account names',()=>{
  const p={type:'cash',region:'us',amount:100,currency:'CNY',name:'Tiger 美元购买力'};
  assert.equal(M.productValue(p,ctx).cny,100);assert.equal(M.productValue({...p,currency:'USD'},ctx).cny,700);
});
test('Missing foreign rates are incomplete; no fabricated HKD or 1:1 fallback',()=>{
  assert.equal(M.productValue({type:'cash',amount:100,currency:'HKD'},ctx).complete,false);
  assert.equal(M.productValue({type:'cash',amount:100,currency:'HKD'},{fx:{HKD:0.9}}).cny,90);
});
test('Missing stock, gold and fund quotes are marked incomplete',()=>{
  for(const p of [{type:'stock_us',shares:10,ticker:'SYNTHETIC'},{type:'gold',grams:10},{type:'fund_cn',fundShares:10}]){const result=M.productValue(p,ctx);assert.equal(result.complete,false);assert.equal(result.cny,null);}
});
test('Last valid prices can estimate value and carry an estimate flag',()=>{
  const result=M.productValue({type:'stock_us',shares:10,ticker:'SYNTHETIC'},{...ctx,quoteCache:{SYNTHETIC:{price:12}}});
  assert.equal(result.cny,840);assert.equal(result.estimated,true);
});
test('Zero holdings need no quote; malformed quantities are not valued',()=>{
  assert.equal(M.productValue({type:'stock_us',shares:0},ctx).cny,0);assert.equal(M.productValue({type:'stock_us',shares:-10,currentPrice:10},ctx).complete,false);
});
test('Portfolio coverage separates known value from missing valuations',()=>{
  const result=M.summary([{type:'cash',amount:100,currency:'CNY'},{type:'gold',grams:2}],ctx);
  assert.equal(result.knownCny,100);assert.equal(result.complete,false);assert.equal(result.missing.length,1);
});
test('Foreign price and FX gains reconcile exactly to total unrealized gain',()=>{
  const result=M.gainSplit({type:'stock_us',shares:10,costPrice:100,currentPrice:120,costFxToCny:6},ctx);
  assert.equal(result.asset,1200);assert.equal(result.fx,1200);assert.equal(result.total,2400);assert.equal(M.sum([result.asset,result.fx]),result.total);
});
test('Missing acquisition FX and missing costs are reported, never inferred',()=>{
  assert.equal(M.gainSplit({type:'stock_us',shares:10,costPrice:100,currentPrice:120},ctx).complete,false);
  assert.equal(M.gainSplit({type:'stock_us',shares:10,currentPrice:120,costFxToCny:6},ctx).complete,false);
});
test('Foreign cash FX gains contain no invented asset-price return',()=>{
  const result=M.gainSplit({type:'cash',currency:'USD',amount:100,costFxToCny:6},ctx);assert.equal(result.asset,0);assert.equal(result.fx,100);
});
test('XIRR matches a one-year 10% return and a one-year 20% loss',()=>{
  near(M.xirr([{date:'2025-01-01',amount:-100},{date:'2026-01-01',amount:110}]).rate,.1,1e-9);
  near(M.xirr([{date:'2025-01-01',amount:-100},{date:'2026-01-01',amount:80}]).rate,-.2,1e-9);
});
test('XIRR accounts for dated additional contributions',()=>{
  near(M.xirr([{date:'2023-01-01',amount:-100},{date:'2024-01-01',amount:-100},{date:'2024-12-31',amount:231}]).rate,.1,1e-9);
});
test('Non-conventional or same-day cash flows do not show a spurious annualized return',()=>{
  assert.equal(M.xirr([{date:'2025-01-01',amount:-100},{date:'2025-02-01',amount:300},{date:'2025-03-01',amount:-200}]).rate,null);
  assert.equal(M.xirr([{date:'2025-01-01',amount:-100},{date:'2025-01-01',amount:110}]).rate,null);
});
test('Deposits are excluded from investment profit',()=>{
  const result=M.performance({startDate:'2025-01-01',openingCny:100,confirmed:true},[{date:'2025-06-01',type:'deposit',amount:100,currency:'CNY'}],200,'2026-01-01');
  assert.equal(result.profit,0);assert.equal(result.netInvested,200);near(result.annualized.rate,0,1e-10);
});
test('Withdrawals and historical FX are included in profit correctly',()=>{
  const result=M.performance({startDate:'2025-01-01',openingCny:1000,confirmed:true},[{date:'2025-06-01',type:'deposit',amount:100,currency:'USD',fxToCny:6},{date:'2025-09-01',type:'withdrawal',amount:200,currency:'CNY'}],1500,'2026-01-01');
  assert.equal(result.netInvested,1400);assert.equal(result.profit,100);
});
test('No baseline, invalid cashflow FX or incomplete NAV means no performance report',()=>{
  assert.equal(M.performance(null,[],100,'2026-01-01').available,false);
  const tracking={startDate:'2025-01-01',openingCny:100,confirmed:true};
  assert.equal(M.performance(tracking,[],100,'2026-01-01',false).available,false);
  assert.equal(M.performance(tracking,[{date:'2025-06-01',type:'deposit',amount:100,currency:'USD'}],200,'2026-01-01').available,false);
});
test('Scenario dates require explicit assumptions and use monthly saving, not raw NAV slopes',()=>{
  assert.equal(M.forecast(100,200,null,'2026-01-01').available,false);
  const result=M.forecast(100,200,{confirmed:true,monthlyContribution:10,rates:[0,0,0]},'2026-01-01');
  assert.equal(result.scenarios[0].months,10);assert.equal(result.scenarios[0].date,'2026-11-01');
});
test('Unreachable scenarios and already-achieved goals are handled',()=>{
  const plan={confirmed:true,monthlyContribution:0,rates:[0,0,0]};assert.equal(M.forecast(100,200,plan,'2026-01-01').scenarios[0].date,null);assert.equal(M.forecast(200,100,plan,'2026-01-01').scenarios[0].months,0);
});
test('Already-paid interest is not counted twice with cash',()=>{
  const p=deposit({tdPaidInterest:200,tdPaidInterestDate:'2025-10-01'});
  const result=M.depositValue(p,'2026-01-01');assert.equal(result.value,10300);assert.equal(result.totalInterest,500);assert.equal(result.interest,300);
  assert.equal(M.depositValue(p,'2025-06-01').paidInterest,0);
});
test('Invalid payout and unsupported contract methods are not silently valued',()=>{
  assert.equal(M.depositValue(deposit({tdPaidInterest:1000,tdPaidInterestDate:'2025-10-01'}),'2026-01-01').complete,false);
  assert.equal(M.depositValue(deposit({tdMethod:'weekly',tdPaidInterest:1,tdPaidInterestDate:'2025-10-01'}),'2026-01-01').complete,false);
  assert.equal(M.depositValue(deposit({tdMethod:'unknown'}),'2026-01-01').complete,false);
  assert.equal(M.depositValue(deposit({tdDayCount:'unknown'}),'2026-01-01').complete,false);
  assert.equal(M.productValue(deposit({tdTimeZone:'invalid/timezone'}),ctx).complete,false);
});
test('Long-horizon XIRR remains numerically stable',()=>{
  const start='1926-01-01',end='2026-01-01',days=M.dayIndex(end)-M.dayIndex(start),terminal=100*Math.pow(1.03,days/365);
  near(M.xirr([{date:start,amount:-100},{date:end,amount:terminal}]).rate,.03,1e-9);
});
test('Empty strings and booleans are not accepted as financial amounts',()=>{
  assert.equal(M.number('   '),null);assert.equal(M.number(false),null);assert.equal(M.number('0'),0);
});
test('HTML integration preserves engine copies, explicit currencies and snapshot guards',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.equal(fs.readFileSync('public/calculation-engine.js','utf8'),source);
  for(const file of ['public/index.html','lee wealth.html'])assert.equal(fs.readFileSync(file,'utf8'),html);
  assert.ok(html.includes('if(!quality.complete)'));
  assert.ok(!html.includes("currency='USD';\n    p={...p,amount"));
  assert.ok(html.includes("SK+'_before_calculation_v3'"));
  assert.ok(html.includes('function save(){'));
  for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
});

test('Imported scenarios cannot silently substitute missing inputs or unordered rates',()=>{
  const plan={confirmed:true,monthlyContribution:100,rates:[0,3,5]};
  assert.equal(M.forecast(null,5000,plan,'2026-10-18').available,false);
  assert.equal(M.forecast(1000,5000,{...plan,monthlyContribution:null},'2026-10-18').available,false);
  assert.equal(M.forecast(1000,5000,{...plan,rates:[5,3,0]},'2026-10-18').available,false);
  assert.equal(M.forecast(1000,5000,plan,'invalid').available,false);
});
test('Live chart neither mutates stored snapshots nor plots partial NAV',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const code=html.slice(html.indexOf('function renderNavMiniChart('),html.indexOf('// ══ REGION PAGE'));
  let complete=true;const snapshot={date:'2026-10-18',cny:1000};
  const chart={data:{datasets:[{}]},update(){},destroy(){}};
  const sandbox={D:{navHistory:[{date:'2026-10-17',cny:900},snapshot],settings:{}},WealthMath:M,Date,ovRange:9999,ovChart:chart,__ovChartDays:9999,__ovChartDark:true,today:()=>snapshot.date,totalCNY:()=>1200,valuationStatus:()=>({complete}),fc:String,document:{body:{classList:{contains:()=>false}},getElementById:()=>({style:{}})}};
  vm.createContext(sandbox);vm.runInContext(code,sandbox);
  sandbox.renderNavMiniChart(9999);assert.equal(snapshot.cny,1000);assert.equal(chart.data.datasets[0].data[1],1200);
  complete=false;sandbox.renderNavMiniChart(9999);assert.equal(chart.data.datasets[0].data[1],1000);
  assert.equal(sandbox.D.navHistory.length,2);
});
console.log(`${passed} calculation checks passed.`);
