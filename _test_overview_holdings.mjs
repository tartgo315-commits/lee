import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8'),context=vm.createContext({Intl,Date});vm.runInContext(fs.readFileSync('calculation-engine.js','utf8'),context);
const start=html.indexOf('const OVERVIEW_REGIONS='),end=html.indexOf('function resetOverviewHoldingFilters()',start);
const idleStart=html.indexOf('function isUsdIdleProduct('),idleEnd=html.indexOf('\n',idleStart);
vm.runInContext(html.slice(idleStart,idleEnd)+'\n'+html.slice(start,end),context);
context.looksLikeUsdBrokerCash=()=>false;
const valuation={fx:{USD:7,AUD:5},quoteCache:{},now:new Date('2026-10-18T12:00:00Z')};
const products=[{id:1,region:'cn',account:'示例账户',name:'虚构人民币余额',type:'cash',amount:1000,currency:'CNY'},{id:2,region:'us',account:'示例账户',name:'虚构美元余额',type:'cash',amount:100,currency:'USD'},{id:3,region:'us',account:'示例账户',name:'虚构美股',type:'stock_us',ticker:'DEMO',shares:10,costPrice:8,currentPrice:10},{id:4,region:'au',account:'虚构澳洲账户',name:'虚构存款',type:'term_deposit',tdCur:'AUD',principal:1000,rate:5,tdStart:'2025-10-18',tdEnd:'2027-10-18',tdPaidInterest:20,tdPaidInterestDate:'2026-10-01'}];
context.D={products};
const build=(list=products,manual=()=>null)=>context.buildOverviewHoldingRows(list,valuation,manual);
const sum=rows=>context.WealthMath.sum(rows.filter(r=>r.valuation.complete).map(r=>r.valuation.cny));
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
test('Unfiltered holdings reconcile to the valuation engine without modifying records',()=>{
  const before=JSON.stringify(products),rows=build();assert.equal(sum(rows),context.WealthMath.summary(products,valuation).knownCny);assert.equal(JSON.stringify(products),before);
});
test('Manual dollar cash replaces existing cash once and leaves the original ledger untouched',()=>{
  const rows=build(products,()=>150);assert.equal(rows.filter(r=>r.manual).length,1);assert.ok(!rows.some(r=>r.product.id===2));assert.equal(sum(rows),sum(build())+350);assert.equal(products[1].amount,100);
});
test('Zero manual cash is an explicit replacement and unconfigured cash remains visible',()=>{
  const rows=build(products,()=>0);assert.equal(rows.find(r=>r.manual).valuation.cny,0);assert.ok(!rows.some(r=>r.product.id===2));assert.ok(build().some(r=>r.product.id===2));
});
test('Combined filters distinguish same-name accounts in different regions',()=>{
  const rows=build(),key=context.overviewHoldingAccountKey('us','示例账户');
  assert.equal(context.filterOverviewHoldingRows(rows,{region:'us',account:key,type:'stock_us'}).length,1);assert.equal(context.filterOverviewHoldingRows(rows,{region:'cn',account:key,type:''}).length,0);
});
test('Sorting compares converted CNY amounts and keeps missing valuations last',()=>{
  const rows=build([...products,{id:5,type:'fund_cn',region:'cn',account:'虚构基金',fundShares:10,fundCost:1}]);
  const desc=context.filterOverviewHoldingRows(rows,{sort:'desc'}),asc=context.filterOverviewHoldingRows(rows,{sort:'asc'});
  assert.equal(desc.at(-1).product.id,5);assert.equal(asc.at(-1).product.id,5);assert.ok(desc[0].valuation.cny>=desc[1].valuation.cny);assert.ok(asc[0].valuation.cny<=asc[1].valuation.cny);
});
test('Native unrealized gains use actual cost and exclude paid deposit interest',()=>{
  const rows=build();assert.equal(context.overviewHoldingProfit(rows.find(r=>r.product.id===3)).amount,20);assert.equal(context.overviewHoldingProfit(rows.find(r=>r.product.id===4)).amount,30);assert.equal(context.overviewHoldingProfit(rows[0]),null);
});
test('Missing costs and quotes do not create artificial losses',()=>{
  const row=build([{id:7,region:'us',type:'stock_us',shares:10,currentPrice:20}])[0];assert.equal(context.overviewHoldingProfit(row).missing,true);
  const missing=build([{id:8,region:'us',type:'stock_us',shares:10,costPrice:20}])[0];assert.equal(context.overviewHoldingProfit(missing),null);
});
test('Empty and unassigned holdings remain recoverable in the all-assets view',()=>{
  assert.equal(build([]).length,0);const row=build([{id:9,region:'unknown',type:'other',currency:'CNY',amount:10}])[0];assert.equal(row.region,'other');assert.equal(row.account,'未分类');assert.equal(row.valuation.cny,10);
});
test('Filtering and sorting never rearrange the source rows',()=>{
  const rows=build(),before=Array.from(rows,r=>r.key);context.filterOverviewHoldingRows(rows,{region:'us',sort:'asc'});assert.deepEqual(Array.from(rows,r=>r.key),before);
});


test('Default view keeps every region and groups same-name accounts separately',()=>{
  const rows=context.filterOverviewHoldingRows(build(),{sort:'desc'}),groups=context.groupOverviewHoldingRows(rows);
  assert.deepEqual(Array.from(groups,g=>g.region),['cn','us','au']);
  assert.equal(groups.reduce((n,g)=>n+g.count,0),rows.length);
  assert.equal(groups[0].accounts[0].account,groups[1].accounts[0].account);
  assert.equal(context.WealthMath.sum(groups.map(g=>g.knownCny)),sum(rows));
});
test('Group totals reflect manual idle replacement and incomplete valuations',()=>{
  const rows=build([...products,{id:10,type:'fund_cn',region:'cn',account:'示例账户',fundShares:10}],()=>150),groups=context.groupOverviewHoldingRows(rows);
  assert.equal(groups[0].missing,1);assert.equal(groups[0].accounts[0].missing,1);
  assert.equal(context.WealthMath.sum(groups.map(g=>g.knownCny)),sum(rows));
});
test('Account order remains stable when valuation sorting changes',()=>{
  const rows=build([...products,{id:11,type:'cash',region:'cn',account:'第二账户',currency:'CNY',amount:2000}]);
  const names=sort=>Array.from(context.groupOverviewHoldingRows(context.filterOverviewHoldingRows(rows,{sort}))[0].accounts,g=>g.account);
  assert.deepEqual(names('asc'),names('desc'));
});

test('Zero stock rows move out of current holdings without hiding invalid quantities or changing value',()=>{
  const zero={id:31,type:'stock_us',region:'us',account:'示例账户',ticker:'ZERO',shares:0,costPrice:5},watch={...zero,id:32,ticker:'WATCH',stockList:'watch'},invalid={...zero,id:33,shares:null};
  const source=[...products,zero,watch,invalid],before=JSON.stringify(source),rows=build(source);
  assert.ok(!rows.some(r=>r.product.id===31||r.product.id===32));assert.ok(rows.some(r=>r.product.id===33));assert.equal(sum(rows),sum(build(products)));assert.equal(JSON.stringify(source),before);
  assert.equal(context.stockLibraryKind(zero),'history');assert.equal(context.stockLibraryKind(watch),'watch');assert.equal(context.stockLibraryKind({...watch,shares:2}),'current');assert.equal(context.stockLibraryKind(invalid),'current');
});
test('Archived record lookup keeps account IDs separate and ignores reversed sales',()=>{
  const p={id:31},events=[{id:'one',date:'2026-10-01',changes:[{ref:'p:31'}],trade:{side:'sell',realizedPnl:12.5}},{id:'other',date:'2026-10-02',changes:[{ref:'p:32'}],trade:{side:'sell',realizedPnl:500}},{id:'undo',date:'2026-10-03',reversedAt:'2026-10-04',changes:[{ref:'p:31'}],trade:{side:'sell',realizedPnl:50}},{id:'unknown',date:'2026-10-05',changes:[{ref:'p:31'}],trade:{side:'sell'}}];
  const before=JSON.stringify(events),records=context.stockLibraryRecords(p,events),result=context.stockLibraryRealized(records);assert.deepEqual(Array.from(records,e=>e.id),['unknown','one']);assert.equal(result.amount,12.5);assert.equal(result.known,1);assert.equal(result.sales,2);assert.equal(JSON.stringify(events),before);
});
test('Backfilled trades match the same ticker and cash account without counting unknown realized profit',()=>{
  const p={id:51,type:'stock_us',ticker:'DEMO',account:'券商甲',shares:0},data={products:[p,{id:52,region:'us',account:'券商甲'},{id:53,region:'us',account:'券商乙'}]},events=[{id:'match',date:'2026-10-01',recordOnly:true,changes:[],trade:{side:'sell',ticker:'DEMO',cashRef:'p:52'}},{id:'other',date:'2026-10-02',recordOnly:true,changes:[],trade:{side:'sell',ticker:'DEMO',cashRef:'p:53'}}],records=context.stockLibraryRecords(p,events,data);
  assert.deepEqual(Array.from(records,e=>e.id),['match']);assert.equal(context.stockLibraryRealized(records).known,0);
});
test('Full sale archives the product, rebuy restores it and cash is settled once',()=>{
  vm.runInContext(fs.readFileSync('movement-engine.js','utf8'),context);vm.runInContext(fs.readFileSync('ledger-workflows.js','utf8'),context);const W=context.WealthMovements,L=context.LedgerWorkflows;
  let data={products:[{id:51,region:'us',type:'stock_us',account:'券商甲',ticker:'DEMO',shares:2,costPrice:8,currentPrice:10},{id:52,region:'us',type:'cash',account:'券商甲',currency:'USD',amount:100}],nextId:53,movementLog:[],cashFlows:[],fx:{USD:7}};
  const opts={id:'sell',date:'2026-10-19',today:'2026-10-19',timestamp:'2026-10-19T10:00:00Z',reason:'示例卖出',productId:51,cashRef:'p:52',side:'sell',quantity:2,price:10,fee:1};data=W.apply(data,L.stockTrade(data,opts));assert.equal(context.stockLibraryKind(data.products[0]),'history');assert.equal(data.products[1].amount,119);assert.equal(context.stockLibraryRealized(context.stockLibraryRecords(data.products[0],data.movementLog,data)).amount,3);
  data.products[0].stockList='watch';data=W.apply(data,L.stockTrade(data,{...opts,id:'rebuy',side:'buy',quantity:1,price:12,fee:0,reason:'示例买回'}));assert.equal(context.stockLibraryKind(data.products[0]),'current');assert.equal(data.products[1].amount,107);assert.equal(data.movementLog.length,2);assert.equal(data.cashFlows.length,0);assert.equal(data.products[0].stockList,undefined);data=W.apply(data,L.stockTrade(data,{...opts,id:'resell',side:'sell',quantity:1,price:13,fee:0}));assert.equal(context.stockLibraryKind(data.products[0]),'history');
});
test('Hidden stocks never hide a manual broker cash account or create a review task',()=>{
  const zero={id:61,type:'stock_us',region:'us',account:'券商甲',ticker:'ZERO',shares:0,costPrice:0,currentPrice:0,stockList:'watch'};
  assert.deepEqual(Array.from(context.stockRegionAccounts([zero],'us',()=>120)),['券商甲']);assert.equal(context.stockRegionAccounts([zero],'us',()=>null).length,0);
  const data={products:[],nextId:61,movementLog:[],cashFlows:[],fx:{USD:7}},event=context.prepareWatchStock(data,zero,{id:'watch-zero',timestamp:'2026-10-19T10:00:00Z',date:'2026-10-19',today:'2026-10-19',reason:'示例关注'}),next=context.WealthMovements.apply(data,event);
  assert.equal(event.reviewRequired,false);assert.equal(event.flow,null);assert.equal(next.cashFlows.length,0);assert.equal(context.WealthMath.productValue(next.products[0],{fx:next.fx}).cny,0);assert.throws(()=>context.prepareWatchStock(data,{...zero,shares:1},{}));
});
console.log(passed+' total holdings checks passed.');
