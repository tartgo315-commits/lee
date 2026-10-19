import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const c=vm.createContext({Date,Intl});vm.runInContext(fs.readFileSync('stock-sessions.js','utf8'),c);vm.runInContext(fs.readFileSync('calculation-engine.js','utf8'),c);const S=c.StockSessions;
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS '+name);},at=iso=>Date.parse(iso),sec=iso=>at(iso)/1000;
const now=at('2026-10-19T01:00:00Z');
test('Chart timestamps outrank stale regular meta and retain pre/post quotes',()=>{
  const snap=S.fromChart({chart:{result:[{meta:{symbol:'DEMO',regularMarketPrice:100,regularMarketTime:sec('2026-10-16T20:00:00Z')},timestamp:[sec('2026-10-16T12:00:00Z'),sec('2026-10-16T19:55:00Z'),sec('2026-10-16T23:55:00Z')],indicators:{quote:[{close:[99,100,102]}]}}]}},'DEMO',now);
  assert.equal(snap.pre.price,99);assert.equal(snap.post.price,102);assert.equal(S.select(snap,now).price,102);assert.equal(S.select(snap,now).kind,'post');
});
test('Next-session premarket beats prior after-hours without averaging prices',()=>{
  const snap=S.fromQuote({symbol:'DEMO',marketState:'PRE',regularMarketPrice:100,regularMarketTime:sec('2026-10-16T20:00:00Z'),postMarketPrice:102,postMarketTime:sec('2026-10-16T23:55:00Z'),preMarketPrice:110,preMarketTime:sec('2026-10-19T08:05:00Z')},'',at('2026-10-19T08:06:00Z'));
  assert.equal(S.select(snap,at('2026-10-19T08:06:00Z')).price,110);
});
test('Undated 24-hour price is labelled reference with retrieval time, never execution time',()=>{
  const snap=S.fromQuote({symbol:'DEMO',fulldayPrice:105,regularMarketPrice:100,regularMarketTime:sec('2026-10-16T20:00:00Z')},'',now),row=S.select(snap,now);
  assert.equal(row.price,105);assert.equal(row.at,null);assert.equal(row.fetchedAt,now);assert.equal(row.estimated,true);assert.match(row.label,/参考/);
  assert.equal(S.select(snap,now+600001).price,100);
});
test('24-hour reference is not relabelled fresh by unrelated snapshots',()=>{
  const a=S.fromQuote({symbol:'DEMO',fulldayPrice:105,regularMarketPrice:100,regularMarketTime:sec('2026-10-16T20:00:00Z')},'',now-3600000),b=S.fromQuote({symbol:'DEMO',regularMarketPrice:100,regularMarketTime:sec('2026-10-16T20:00:00Z')},'',now);
  assert.equal(S.select(S.merge(a,b),now).price,100);
});
test('Weekend and daylight-saving session windows use America/New_York',()=>{
  assert.equal(S.nightWindow(at('2026-10-17T02:00:00Z')),false);assert.equal(S.nightWindow(at('2026-10-19T01:00:00Z')),true);assert.equal(S.session(at('2026-01-12T14:00:00Z')).kind,'pre');assert.equal(S.session(at('2026-07-13T14:00:00Z')).kind,'regular');
});
test('Real overnight timestamps outrank full-day reference and reject future bars',()=>{
  const snap=S.fromChart({chart:{result:[{meta:{symbol:'DEMO',fulldayPrice:999},timestamp:[sec('2026-10-19T00:59:00Z'),sec('2026-10-20T01:00:00Z')],indicators:{quote:[{close:[106,900]}]}}]}},'DEMO',now),row=S.select(snap,now);
  assert.equal(row.price,106);assert.equal(row.kind,'overnight');assert.equal(row.estimated,false);
});
test('Merging never overwrites a newer session trade with an older one',()=>{
  const a=S.fromQuote({symbol:'DEMO',postMarketPrice:105,postMarketTime:sec('2026-10-16T23:00:00Z')},'',now-1000),b=S.fromQuote({symbol:'DEMO',postMarketPrice:90,postMarketTime:sec('2026-10-16T21:00:00Z')},'',now);
  assert.equal(S.merge(a,b).post.price,105);assert.equal(S.fromChart('bad JSON'),null);assert.equal(S.point(true,123),null);
});
test('Reference valuation preserves the estimate flag and the normal value calculation',()=>{
  const row=c.WealthMath.productValue({type:'stock_us',ticker:'DEMO',shares:2,currentPrice:105,quoteReference:true},{fx:{USD:7}});assert.equal(row.estimated,true);assert.equal(row.cny,1470);
});
const html=fs.readFileSync('index.html','utf8'),code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
const definition=name=>{const m=code.match(new RegExp('(?:async )?function '+name+'\\([^)]*\\)\\{[\\s\\S]*?\\n\\}'));assert.ok(m,name);return m[0];};
async function asyncTest(name,fn){await fn();count++;console.log('PASS '+name);}
await asyncTest('Manual refresh fetches Yahoo even when Twelve Data succeeds',async()=>{
  const x=vm.createContext({Promise,Date,__stockTdRateLimited:false,syncTdRateLimitedFromStorage(){},markTdRateLimited(){},fetchTwelveDataStockPriceDetailed:async()=>({price:100}),fetchStockPriceYahooOrCacheOnly:async()=>({price:110,source:'yahoo',quoteAt:now}),writeStockPriceCache(){}});vm.runInContext(definition('fetchStockPriceWithFallback'),x);const r=await x.fetchStockPriceWithFallback('DEMO');assert.equal(r.price,110);assert.equal(r.source,'yahoo');
});
await asyncTest('Failed Yahoo requests never promote old memory data as a fresh quote',async()=>{
  const x=vm.createContext({Promise,StockSessions:S,fetchTextCrossOrigin:async()=>'',parseYahooChartPrice:()=>null,parseYahooV7Quote:()=>null,yahooQuoteMetaBySym:new Map([['DEMO',{snapshot:S.fromQuote({symbol:'DEMO',regularMarketPrice:100},'',now)}]])});vm.runInContext(definition('fetchYahooOnlyStockPrice'),x);assert.equal(await x.fetchYahooOnlyStockPrice('DEMO'),null);
});

await asyncTest('Verified quote updates every account for a ticker, preserving holdings and cash',async()=>{
  const t=Date.now(),snap=S.fromQuote({symbol:'DEMO',postMarketPrice:120,postMarketTime:Math.floor((t-60000)/1000)},'',t),products=[{id:1,type:'stock_us',ticker:'DEMO',shares:2,costPrice:80,currentPrice:100},{id:2,type:'stock_us',ticker:'DEMO',shares:4,costPrice:70,currentPrice:100},{id:3,type:'cash',amount:1000}],D={products};let writes=0,guardForce=false;
  const x=vm.createContext({Date,StockSessions:S,D,yahooQuoteMetaBySym:new Map([['DEMO',{snapshot:snap}]]),stockPriceSourceBySym:new Map(),today:()=> '2026-10-19',commitLiveQuotePrice:(before,after,force)=>{guardForce=force;return true;},writeStockPriceCache:()=>writes++,patchOverviewStockRow(){},scheduleOverviewLiveRefresh(){},debouncedFinnhubSave(){},updateStockQuoteFallbackBanner(){},document:{querySelectorAll:()=>[]},syncFhmktBadgeForTicker(){},scheduleUsLiveAggregates(){},scheduleRenderUsStockPanelFromLiveQuote(){}});
  vm.runInContext(definition('patchUsStockLiveRow'),x);x.patchUsStockLiveRow('DEMO',120,{source:'yahoo'});assert.equal(guardForce,true);assert.equal(products[0].currentPrice,120);assert.equal(products[1].currentPrice,120);assert.equal(products[0].shares,2);assert.equal(products[1].costPrice,70);assert.equal(products[2].amount,1000);assert.equal(writes,1);
});
await asyncTest('Cache roundtrip retains quote execution time separately from cache time',async()=>{
  const store=new Map(),x=vm.createContext({Date,STOCK_PRICE_CACHE_KEY:'cache',readStockPriceCacheStore:()=>JSON.parse(store.get('cache')||'{}'),localStorage:{setItem:(k,v)=>store.set(k,v)}});vm.runInContext(definition('writeStockPriceCache')+'\n'+definition('getCachedStockPrice'),x);x.writeStockPriceCache('DEMO',105,{timestamp:now,quoteAt:null,estimated:true,sessions:{fullDay:{price:105,at:null,fetchedAt:now}}});const cached=x.getCachedStockPrice('DEMO');assert.equal(cached.timestamp,now);assert.equal(cached.quoteAt,null);assert.equal(cached.estimated,true);assert.equal(cached.sessions.fullDay.fetchedAt,now);
});
assert.equal(fs.readFileSync('stock-sessions.js','utf8'),fs.readFileSync('public/stock-sessions.js','utf8'));console.log(count+' extended-session checks passed.');
