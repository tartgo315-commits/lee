import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
function definition(name){const m=code.match(new RegExp('(?:async )?function '+name+'\\([^)]*\\)\\{[\\s\\S]*?\\n\\}'));assert.ok(m,name);return m[0];}
const controller=code.slice(code.indexOf("const STOCK_PRICE_CACHE_KEY="),code.indexOf('function readStockPriceCacheStore(){'));
let now=Date.parse('2026-10-18T02:00:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
function setup(shared=new Map()){
  let calls=0;
  const banner={style:{},textContent:'',className:''};
  const context=vm.createContext({Date:Clock,console,syncNavigationNotices(){},location:{protocol:'https:',origin:'https://test.invalid'},D:{products:[{type:'stock_us',ticker:'AAA'},{type:'stock_us',ticker:'BBB'}]},document:{hidden:false,getElementById:()=>banner},localStorage:{getItem:k=>shared.get(k)??null,setItem:(k,v)=>shared.set(k,String(v)),removeItem:k=>shared.delete(k)},fetch:async url=>{calls++;const symbols=new URL(url).searchParams.get('symbol').split(',');return{status:200,json:async()=>symbols.length===1?{price:'10'}:Object.fromEntries(symbols.map(sym=>[sym,{price:'10'}]))};}});
  const pollDeclarations=code.slice(code.indexOf("const STOCK_AUTO_POLL_KEY="),code.indexOf('async function runFinnhubQuotePoll(){'));
  vm.runInContext(controller+'\n'+definition('parseTwelveDataQuotePayload')+'\n'+definition('fetchTwelveDataStockPriceDetailed')+'\n'+definition('fetchTwelveDataBatch')+'\n'+definition('formatStockCacheAge')+'\n'+definition('updateStockQuoteFallbackBanner')+'\nconst FINNHUB_QUOTE_POLL_MS=1800000;\n'+definition('finnhubDesiredSymbols')+'\n'+pollDeclarations,context);
  const run=text=>vm.runInContext(text,context);
  return{context,shared,banner,run,calls:()=>calls};
}
let passed=0;
async function test(name,fn){now=Date.parse('2026-10-18T02:00:00Z');await fn();passed++;console.log('PASS '+name);}
await test('All entry scripts parse and deployment copies match',()=>{
  new vm.Script(code);
  for(const file of ['public/index.html','lee wealth.html'])assert.equal(fs.readFileSync(file,'utf8'),html);
});
await test('Minute and unknown 429 errors use a short cooldown',()=>{
  const t=setup();
  for(const [text,kind] of [['You have run out of API credits for the current minute','minute'],['Too many requests','unknown']]){
    t.context.data={code:429,message:text};const limit=t.run('classifyTwelveDataLimit(data)');
    assert.equal(limit.limitKind,kind);assert.equal(limit.retryAt,now+60000);
  }
});
await test('Only explicit daily exhaustion waits for midnight UTC',()=>{
  const t=setup();const limit=t.run("classifyTwelveDataLimit({code:429,message:'You have run out of API credits for the day'})");
  assert.equal(limit.limitKind,'day');assert.equal(limit.retryAt,Date.parse('2026-10-19T00:00:00Z'));
  assert.equal(t.run("classifyTwelveDataLimit({error:'unauthorized',code:401})"),null);
});
await test('Unknown HTTP 429 responses are detected without a JSON code',()=>{
  assert.equal(setup().run("classifyTwelveDataLimit({error:'busy'},429).limitKind"),'unknown');
});
await test('Legacy all-day flags are migrated to a short, expiring recheck',()=>{
  const storage=new Map([['stock_td_limit_until',String(now+20*3600000)]]);const t=setup(storage);
  t.run('syncTdRateLimitedFromStorage()');assert.equal(t.run('__stockTdRateLimited'),true);
  assert.equal(Number(storage.get('stock_td_limit_until')),now+60000);
  now+=60001;t.run('syncTdRateLimitedFromStorage()');assert.equal(t.run('__stockTdRateLimited'),false);
});
await test('Confirmed daily limits survive reloads and are not shortened by concurrent minute errors',()=>{
  const t=setup();t.run("markTdRateLimited(classifyTwelveDataLimit({code:429,message:'daily limit'}))");
  t.run("markTdRateLimited(classifyTwelveDataLimit({code:429,message:'per minute limit'}))");
  const reloaded=setup(t.shared);reloaded.run('syncTdRateLimitedFromStorage()');
  assert.equal(reloaded.run('__stockTdLimitKind'),'day');assert.equal(reloaded.run('__stockTdRateLimited'),true);
});
await test('Banners distinguish minute, daily and unconfirmed limits',()=>{
  for(const [message,expected] of [['per minute limit','每分钟'],['daily limit','今日额度'],['limit','未确认']]){
    const t=setup();t.context.message=message;
    t.run("stockPriceSourceBySym.set('AAA',{source:'yahoo'});markTdRateLimited(classifyTwelveDataLimit({code:429,message}));updateStockQuoteFallbackBanner()");
    assert.ok(t.banner.textContent.includes(expected));
    if(message!=='daily limit')assert.ok(!t.banner.textContent.includes('今日额度已用尽'));
  }
});
await test('Overlapping single and batch requests share one upstream request',async()=>{
  const t=setup();const batch=t.run("fetchTwelveDataBatch(['AAA','AAA','BBB'])");const single=t.run("fetchTwelveDataStockPriceDetailed('aaa')");
  assert.equal((await batch).map.size,2);assert.equal((await single).price,10);assert.equal(t.calls(),1);
});
await test('One-minute quote cache works across page reloads and expires',async()=>{
  const t=setup();await t.run("fetchTwelveDataStockPriceDetailed('AAA')");
  const reloaded=setup(t.shared);assert.equal((await reloaded.run("fetchTwelveDataStockPriceDetailed('AAA')")).price,10);assert.equal(reloaded.calls(),0);
  now+=60001;await reloaded.run("fetchTwelveDataStockPriceDetailed('AAA')");assert.equal(reloaded.calls(),1);
});
await test('Cooldown prevents network calls and expires without reloading',async()=>{
  const t=setup();t.run("markTdRateLimited(classifyTwelveDataLimit({code:429,message:'minute limit'}))");
  assert.equal((await t.run("fetchTwelveDataBatch(['AAA'])")).rateLimited,true);assert.equal(t.calls(),0);
  now+=60001;assert.equal((await t.run("fetchTwelveDataBatch(['AAA'])")).map.get('AAA'),10);assert.equal(t.calls(),1);
});
await test('Partial batch success is retained when another symbol is limited',async()=>{
  const t=setup();t.context.fetch=async()=>({status:200,json:async()=>({AAA:{price:'12'},BBB:{code:429,message:'minute limit'}})});
  const result=await t.run("fetchTwelveDataBatch(['AAA','BBB'])");assert.equal(result.map.get('AAA'),12);assert.equal(result.rateLimited,true);
});
await test('HTTP 429 without a provider code still starts cooldown',async()=>{
  const t=setup();t.context.fetch=async()=>({status:429,json:async()=>({error:'busy'})});
  const result=await t.run("fetchTwelveDataBatch(['AAA'])");assert.equal(result.limitKind,'unknown');assert.equal(result.rateLimited,true);
});
await test('Non-JSON HTTP 429 responses also respect cooldown',async()=>{
  const t=setup();t.context.fetch=async()=>({status:429,json:async()=>{throw Error('gateway HTML');}});
  const result=await t.run("fetchTwelveDataBatch(['AAA'])");assert.equal(result.limitKind,'unknown');assert.equal(result.rateLimited,true);
});
await test('Late success never clears a concurrent daily limit',async()=>{
  const t=setup();let release;t.context.fetch=async url=>url.includes('AAA')?{status:200,json:async()=>({code:429,message:'daily limit'})}:new Promise(resolve=>{release=()=>resolve({status:200,json:async()=>({price:'10'})});});
  const a=t.run("fetchTwelveDataBatch(['AAA'])");const b=t.run("fetchTwelveDataBatch(['BBB'])");await a;release();await b;
  assert.equal(t.run('__stockTdLimitKind'),'day');assert.equal(t.run('__stockTdRateLimited'),true);
});
await test('Empty ledgers do not query a fixed watchlist',()=>{
  const t=setup();t.context.D.products=[];assert.equal(t.run('finnhubDesiredSymbols().size'),0);
});
await test('Returning to a tab respects the existing 30-minute polling interval',async()=>{
  const t=setup();let polls=0;t.context.runFinnhubQuotePoll=async()=>{polls++;return 1;};
  await t.run('pollFinnhubQuotesOnce()');await t.run('pollFinnhubQuotesOnce()');assert.equal(polls,1);
  now+=1800001;await t.run('pollFinnhubQuotesOnce()');assert.equal(polls,2);
});
await test('Polling interval is shared with another tab and hidden tabs pause',async()=>{
  const t=setup();t.context.runFinnhubQuotePoll=async()=>1;await t.run('pollFinnhubQuotesOnce()');
  const other=setup(t.shared);let polls=0;other.context.runFinnhubQuotePoll=async()=>{polls++;return 1;};await other.run('pollFinnhubQuotesOnce()');assert.equal(polls,0);
  now+=1800001;other.context.document.hidden=true;await other.run('pollFinnhubQuotesOnce()');assert.equal(polls,0);
  other.context.document.hidden=false;await other.run('pollFinnhubQuotesOnce()');assert.equal(polls,1);
});
await test('Failed polls allow retry after one minute',async()=>{
  const t=setup();let polls=0;t.context.runFinnhubQuotePoll=async()=>{polls++;return 0;};
  await t.run('pollFinnhubQuotesOnce()');now+=59000;await t.run('pollFinnhubQuotesOnce()');assert.equal(polls,1);
  now+=1001;await t.run('pollFinnhubQuotesOnce()');assert.equal(polls,2);
});
await test('Polling batch failures go directly to Yahoo instead of retrying Twelve Data per symbol',async()=>{
  const t=setup();let batchCalls=0,fallbackCalls=0;
  Object.assign(t.context,{fetchTwelveDataBatch:async()=>{batchCalls++;return{map:new Map(),rateLimited:false};},fetchStockPriceYahooOrCacheOnly:async()=>{fallbackCalls++;return{price:10,source:'yahoo'};},fetchStockPriceWithFallback:()=>{throw Error('duplicate credit use');},patchUsStockLiveRow:()=>{},updateStockQuoteFallbackBanner:()=>{},scheduleOverviewLiveRefresh:()=>{}});
  vm.runInContext(definition('runFinnhubQuotePoll'),t.context);
  assert.equal(await t.run('runFinnhubQuotePoll()'),2);assert.equal(batchCalls,1);assert.equal(fallbackCalls,2);
});
await test('Limit state initialization occurs after its declarations',()=>{
  assert.ok(code.lastIndexOf('\nsyncTdRateLimitedFromStorage();')>code.indexOf('let __stockTdLimitUntil='));
  assert.ok(code.lastIndexOf('\nhydrateStocksFromCacheOnLoad();')>code.indexOf('const STOCK_PRICE_CACHE_KEY='));
});
console.log(`${passed} quote-limit regression tests passed.`);
