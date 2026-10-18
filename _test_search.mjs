import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('const CMDK_ITEMS='),end=html.indexOf('function isMobileNav()',start);
const ledger={products:[{id:1,region:'us',account:'演示证券账户',name:'示例科技',ticker:'DEMO',amount:987654},{id:2,region:'us',account:'演示证券账户',name:'示例指数',ticker:'ETFDEMO'},{id:3,region:'cn',account:'演示证券账户',name:'示例基金',fundCode:'009999'},{id:4,region:'au',account:'澳洲演示银行',name:'<img src=x onerror=alert(1)>定存'}]};
const calls=[];const ctx=vm.createContext({D:ledger,console,showPage:id=>calls.push(id)});
vm.runInContext(html.slice(start,end),ctx);
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
test('Empty query offers the existing pages and actions without listing private assets',()=>{
  const items=ctx.filterCmdkItems('  ');assert.equal(items.length,11);assert.ok(items.every(it=>!it.kind));
});
test('Page queries filter immediately and exact page names rank first',()=>{
  const items=ctx.filterCmdkItems('设置');assert.equal(items[0].id,'settings');assert.ok(items.length<11);assert.ok(!items.some(it=>it.id==='snapshot'));
});
test('Asset names, account names, ticker symbols and fund codes are searchable',()=>{
  assert.equal(ctx.filterCmdkItems('示例科技')[0].label,'示例科技');
  assert.equal(ctx.filterCmdkItems('demo').filter(it=>it.kind==='资产').length,2);
  assert.equal(ctx.filterCmdkItems('009999')[0].label,'示例基金');
  assert.equal(ctx.filterCmdkItems('演示证券账户').filter(it=>it.kind==='账户').length,2);
});
test('Accounts deduplicate within a region and retain their regional destinations',()=>{
  const accounts=ctx.filterCmdkItems('演示证券账户').filter(it=>it.kind==='账户');assert.equal(accounts.length,2);assert.notEqual(accounts[0].id,accounts[1].id);
});
test('Search tolerates whitespace and case and supports combined terms',()=>{
  assert.equal(ctx.filterCmdkItems('  US   dEmO  ').length,2);assert.equal(ctx.filterCmdkItems('不存在的资产').length,0);
});
test('Every search uses current ledger records after additions, edits and deletions',()=>{
  ledger.products.push({id:5,region:'cn',account:'新增账户',name:'新增资产'});assert.equal(ctx.filterCmdkItems('新增资产').length,1);
  ledger.products[4].name='改名资产';assert.equal(ctx.filterCmdkItems('新增资产').length,0);assert.equal(ctx.filterCmdkItems('改名资产').length,1);
  ledger.products.pop();assert.equal(ctx.filterCmdkItems('改名资产').length,0);
});
test('Search result descriptions contain context, never financial amounts',()=>{
  const items=ctx.getCmdkItems(true);assert.ok(!JSON.stringify(items).includes('987654'));assert.ok(items.some(it=>it.label.includes('<img')));
});
test('Page result actions preserve their intended destination',()=>{
  ctx.filterCmdkItems('设置')[0].run();assert.equal(calls.pop(),'settings');
});
test('All inline scripts parse and deployed entry points remain identical',()=>{
  for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
  for(const file of ['public/index.html','lee wealth.html'])assert.equal(fs.readFileSync(file,'utf8'),html);
});

test('Search binding is idempotent and filters input after initialization',()=>{
  const listeners={},renders=[];
  const input={dataset:{},value:'设置',addEventListener:(name,fn)=>{assert.ok(!listeners[name]);listeners[name]=fn;}};
  ctx.document={getElementById:()=>input};ctx.renderCmdkList=value=>renders.push(value);
  ctx.initCmdk();ctx.initCmdk();listeners.input({isComposing:false});assert.deepEqual(renders,['设置']);
  ctx.searchTestListeners=listeners;ctx.searchTestRenders=renders;
});
test('Chinese composition does not filter midway or execute Enter prematurely',()=>{
  const executions=[];ctx.execCmdkIndex=index=>executions.push(index);
  ctx.searchTestListeners.input({isComposing:true});assert.equal(ctx.searchTestRenders.length,1);
  ctx.searchTestListeners.keydown({key:'Enter',isComposing:true});
  ctx.searchTestListeners.keydown({key:'Enter',keyCode:229});assert.equal(executions.length,0);
  ctx.searchTestListeners.compositionend();assert.equal(ctx.searchTestRenders.length,2);
  ctx.searchTestListeners.keydown({key:'Enter',preventDefault(){}});assert.equal(executions.length,1);
});
console.log(`${passed} search checks passed.`);
