import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
function def(name){const found=html.match(new RegExp('function '+name+'\\([^)]*\\)\\{[\\s\\S]*?\\n\\}'));assert.ok(found,name);return found[0];}
const label={textContent:'',style:{}},c=vm.createContext({Intl,Date,current:90,complete:true,ovRange:9999,ovChart:null,D:{products:[{type:'cash'}],navHistory:[{date:'2026-10-01',cny:100}],settings:{}},document:{getElementById:id=>id==='ov-nav-lbl'?label:null},today:()=> '2026-11-04',localTodayISO:()=> '2026-11-04',mergeWatchEvents:()=>[],eventDaysUntil:()=>1,fc:(v,cur,d=0)=>'¥'+Number(v).toFixed(d)});
vm.runInContext(fs.readFileSync('calculation-engine.js','utf8'),c);
vm.runInContext('function totalCNY(){return current;}function valuationStatus(){return {complete};}',c);
for(const name of ['latestComparableSnapshot','buildAiDailyBriefOneLiner','renderNavMiniChart','usMetaKey','usManualIdleUsd'])vm.runInContext(def(name),c);
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name);}
test('Snapshot comparison excludes incomplete, future, impossible and nonnumeric snapshots',()=>{
 const last=c.latestComparableSnapshot([{date:'2026-11-01',cny:100},{date:'2026-11-03',cny:80,complete:false},{date:'2026-11-05',cny:1},{date:'2026-02-30',cny:1},{date:'2026-11-04',cny:'Infinity'},{date:'2026-11-04',cny:''}], '2026-11-04');assert.equal(last.date,'2026-11-01');
});
test('Current topbar amounts recompute despite an old daily cache',()=>{
 c.D.aiDailyBrief={version:'evidence-v1',date:'2026-11-04',line:'OUTDATED'};assert.match(c.buildAiDailyBriefOneLiner(),/较10-01快照 −¥10/);c.current=120;assert.match(c.buildAiDailyBriefOneLiner(),/\+¥20/);c.current=90;
});
test('Building a derived topbar summary never changes the saved ledger',()=>{const before=JSON.stringify(c.D);c.buildAiDailyBriefOneLiner();assert.equal(JSON.stringify(c.D),before);});
test('Incomplete valuation never presents a calculated account change',()=>{c.complete=false;assert.match(c.buildAiDailyBriefOneLiner(),/估值待补全/);c.complete=true;});
test('Empty ledgers have an explicit first-use hint',()=>{const saved=c.D.products;c.D.products=[];assert.match(c.buildAiDailyBriefOneLiner(),/添加资产/);c.D.products=saved;});
test('Stop-loss alerts precede routine macro events and distinguish breached from approaching levels',()=>{
 const saved=c.D.products;c.D.products=[{type:'stock_us',ticker:'DEMO',currentPrice:90,stopLoss:100}];c.mergeWatchEvents=()=>[{date:'2026-11-10',title:'美国 CPI 数据发布',impact:'high'}];
 assert.match(c.buildAiDailyBriefOneLiner(),/^有持仓已触及止损/);assert.ok(c.buildAiDailyBriefOneLiner().includes('美国 CPI 数据发布'));c.D.products[0].currentPrice=102;assert.match(c.buildAiDailyBriefOneLiner(),/^有持仓接近止损/);c.D.products=saved;c.mergeWatchEvents=()=>[];
});
test('Hero change specifies its baseline and includes a negative percentage sign',()=>{c.renderNavMiniChart(9999);assert.match(label.textContent,/较10-01 −¥10（−10.0%）/);assert.match(label.title,/不等于投资收益/);});
test('A zero opening snapshot never invents a zero-percent return',()=>{c.D.navHistory[0].cny=0;c.renderNavMiniChart(9999);assert.ok(!label.textContent.includes('%'));c.D.navHistory[0].cny=100;});
test('Hero does not substitute an old historical change for incomplete current NAV',()=>{c.complete=false;c.renderNavMiniChart(9999);assert.match(label.textContent,/暂不比较/);c.complete=true;});
test('Manual USD balances reject Infinity and partially numeric imported strings',()=>{
 c.D.usAccountMeta={'us::Tiger':{idleUsd:'100.50'}};assert.equal(c.usManualIdleUsd('Tiger'),100.5);for(const v of ['Infinity','100 USD',-1,'abc']){c.D.usAccountMeta['us::Tiger'].idleUsd=v;assert.equal(c.usManualIdleUsd('Tiger'),null);}
});
test('Bank account names are escaped in both display text and identifying attributes',()=>{
 const account='Savings "A" <b> & \'B\'';
 Object.assign(c,{stockRegionAccounts:()=>[account],usManualIdleUsd:()=>null,isZeroStock:()=>false,pCNY:()=>1,fromCNY:v=>v,compactHoldingHtml:()=>'<div>holding</div>',valuationContext:()=>({fx:{USD:7,AUD:5}}),escOvHtml:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')});c.escAttr=c.escOvHtml;
 vm.runInContext(def('buildAccountBlocks'),c);const result=c.buildAccountBlocks([{id:1,type:'cash',region:'au',account,amount:1,currency:'AUD'}],'au');assert.ok(!result.includes('<b>'));assert.ok(result.includes('&lt;b&gt;'));assert.ok(result.includes('data-key="Savings &quot;A&quot;'));
});
test('Historical asset labels include ASX stocks and show in-transit holdings',()=>{assert.ok(html.includes("stock_us:'股票 / ETF'"));assert.ok(html.includes("in_transit:'在途资金'"));assert.ok(html.includes("'term_deposit','in_transit','other'].map"));});
test('Liquidity categories classify overridden legacy other-cash as cash without negative buckets',()=>{
 const x=vm.createContext({Intl,Date});vm.runInContext(fs.readFileSync('calculation-engine.js','utf8'),x);const M=x.WealthMath,products=[{id:1,type:'other',region:'us',account:'Tiger',name:'Broker cash',currency:'USD',amount:5000},{id:2,type:'cash',region:'au',account:'Bank',currency:'AUD',amount:100},{id:3,type:'stock_us',region:'us',account:'Tiger',ticker:'DEMO',shares:1,currentPrice:10,costPrice:9}];
 const start=html.indexOf('const OVERVIEW_REGIONS='),end=html.indexOf('function resetOverviewHoldingFilters()',start);vm.runInContext(def('isUsdIdleProduct')+'\n'+html.slice(start,end),x);Object.assign(x,{D:{products,fx:{USD:7,AUD:5}},looksLikeUsdBrokerCash:()=>true,usManualIdleUsd:()=>500,totalCNY:()=>0,valuationContext:()=>({fx:{USD:7,AUD:5}})});vm.runInContext(def('snapshotBreakdown'),x);const before=JSON.stringify(products),snapshot=x.snapshotBreakdown();assert.equal(snapshot.byType.other,0);assert.equal(snapshot.byType.cash,4000);assert.equal(M.sum(Object.values(snapshot.byType)),4070);assert.equal(JSON.stringify(products),before);
});
console.log(count+' full review regressions passed.');
