import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('function selectOverviewEvents('),end=html.indexOf('function toggleOverviewEvents()',start);
const context=vm.createContext({});vm.runInContext(html.slice(start,end),context);
const select=context.selectOverviewEvents;let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
const asOf='2026-10-18';
const event=(date,id)=>({kind:'event',date,id});const news=(date,id)=>({kind:'news',date,id});
const ids=items=>Array.from(items,item=>item.id);
test('Summary shows four nearest future events and includes today',()=>{
  const items=[event('2026-12-01',5),event('2026-10-17',0),event(asOf,1),event('2026-10-20',3),event('2026-10-19',2),event('2026-11-01',4)];
  assert.deepEqual(ids(select(items,false,asOf,'all')),[1,2,3,4]);
});
test('Past news does not fill upcoming schedule slots',()=>{
  const items=[news('2026-10-16','old'),event('2026-10-25','due'),news('2026-10-18','new'),event('2026-10-17','past')];
  assert.deepEqual(ids(select(items,false,asOf,'all')),['due']);
});
test('News filter shows the four latest stories',()=>{
  const items=Array.from({length:6},(_,i)=>news('2026-10-'+(12+i),i));
  assert.deepEqual(ids(select(items,false,asOf,'news')),[5,4,3,2]);
});
test('Expanded view omits completed events and news',()=>{
  const items=[event('2026-10-17','past'),news(asOf,'news'),event('2026-10-25','due')];
  assert.deepEqual(ids(select(items,true,asOf,'all')),['due']);
});
test('An all-past calendar is empty in both summary and expanded views',()=>{
  const items=[event('2026-10-01','past')];assert.equal(select(items,false,asOf,'personal').length,0);assert.equal(select(items,true,asOf,'personal').length,0);
});
test('Selection never reorders or edits source records',()=>{
  const items=[event('2026-11-01','later'),event(asOf,'today')];const before=JSON.stringify(items);
  select(items,false,asOf,'all');select(items,true,asOf,'all');assert.equal(JSON.stringify(items),before);
});
test('Empty event sources work for both collapsed and expanded views',()=>{
  assert.equal(select([],false,asOf,'all').length,0);assert.equal(select([],true,asOf,'all').length,0);
});
test('Unresolved past maturities remain actionable while completed events stay hidden',()=>{
 const items=[{...event('2026-09-01','unresolved'),personal:true,actionPending:true},event('2026-10-17','done'),{...event(asOf,'elapsed'),pending:false},event('2026-10-25','future')];
 assert.deepEqual(ids(select(items,true,asOf,'all')),['unresolved','future']);
});
test('Explicit future timestamps survive a prior source-calendar date',()=>{
 assert.deepEqual(ids(select([{...event('2026-10-17','timezone'),pending:true}],true,asOf,'all')),['timezone']);
});
console.log(`${passed} overview event checks passed.`);
