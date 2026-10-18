import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html=fs.readFileSync('index.html','utf8');
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
function definition(name){
  const match=code.match(new RegExp('(?:async )?function '+name+'\\([^)]*\\)\\{[\\s\\S]*?\\n\\}'));
  assert.ok(match,`function ${name} exists`);
  return match[0];
}
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS '+name);}
check('All JavaScript parses',()=>new vm.Script(code));
check('All three supported entry points match',()=>{
  for(const file of ['public/index.html','lee wealth.html'])assert.equal(fs.readFileSync(file,'utf8'),html);
});
check('Personal import presets and automatic stock-specific stop-loss seeding are absent',()=>{
  for(const marker of ['TIGER_PRESET','ALIPAY_CN_PRESET_NAMES','CBA_AU_IMPORT_TAG','seedCrclDefaultStopLoss','与截图一致','已预填你的'])assert.ok(!html.includes(marker));
  assert.ok(!/\b\d{3}-\d{3}\s*·/.test(html),'no bank routing references');
});
check('New accounts have no personal principal or financial goal',()=>{
  const declaration=code.match(/const blank=\(\)=>\([^\n]+/)[0];
  const data=vm.runInNewContext(declaration+'\nblank()');
  assert.equal(Object.keys(data.settings).length,0);
  assert.equal(data.goal.amount,0);
  assert.equal(data.products.length,0);
});
check('Previously configured principal is retained, never replaced by a preset',()=>{
  const context=vm.createContext({D:{settings:{usPrincipalAUD:1000}},totalCNY:()=>2000,fromCNY:v=>v/2,toCNY:v=>v*2});
  vm.runInContext(definition('getUsPrincipalGrowth'),context);
  assert.equal(vm.runInContext('getUsPrincipalGrowth().principalAUD',context),1000);
  context.D.settings={};
  assert.equal(vm.runInContext('getUsPrincipalGrowth().principalAUD',context),0);
});
check('AI context and structured payload use anonymized builders',()=>{
  const context=vm.createContext({buildSanitizedPortfolio:()=> 'SAFE SUMMARY',buildEventsCalendarContext:()=> 'PUBLIC EVENTS',getSanitizedPortfolioPayload:()=>[{market:'US'}],buildFullPortfolioText:()=>{throw Error('private builder called');},buildFullPortfolioPayload:()=>{throw Error('private builder called');}});
  vm.runInContext(definition('buildAiPortfolioContext')+'\n'+definition('getAiPortfolioPayload'),context);
  assert.ok(vm.runInContext('buildAiPortfolioContext()',context).includes('SAFE SUMMARY'));
  assert.equal(vm.runInContext('getAiPortfolioPayload()[0].market',context),'US');
  assert.ok(!definition('postAiAdvisor').includes('WO_REMOTE_PROXY_ORIGIN'),'no alternate AI destination');
  assert.ok(!html.includes('sanitized:false'));
});
check('Outbound event context omits personal events and computed NAV reactions',()=>{
  const context=vm.createContext({mergeWatchEvents:()=>[{personal:true,date:'2026-01-01',title:'PRIVATE ACCOUNT'},{personal:false,date:'2026-01-01',title:'PUBLIC EVENT',actualPending:true,actual:'PRIVATE NAV REACTION'}],localTodayISO:()=> '2026-01-01',eventDaysUntil:()=>0,getWatchNewsItems:()=>[]});
  vm.runInContext(definition('buildEventsCalendarContext'),context);
  const result=vm.runInContext('buildEventsCalendarContext()',context);
  assert.ok(result.includes('PUBLIC EVENT'));
  assert.ok(!result.includes('PRIVATE'));
});
check('Refresh operation contains no snapshot or news write',()=>{
  const source=definition('refreshAllQuotes');
  assert.ok(!source.includes('takeSnapshot('));
  assert.ok(!source.includes('refreshNewsFeeds('));
});
check('Blank batch import and invalid dates have explicit validation',()=>{
  assert.ok(definition('saveBatch').includes('请先填写至少一条持仓'));
  assert.ok(definition('saveBatch').includes('shares<=0'));
  assert.ok(definition('saveProduct').includes('tdEnd<=tdStart'));
});
check('Every new-asset field has a programmatically associated label',()=>{
  const modal=html.slice(html.indexOf('id="modal" role="dialog"'),html.indexOf('// ══ DATA ══'));
  for(const id of ['m-region','m-type','m-account','m-name','m-amount','m-currency','m-principal','m-rate','m-tdstart','m-tdend','m-note'])assert.ok(modal.includes(`for="${id}"`),id);
});
check('Responsive overrides correct explicit grid span and selector specificity',()=>{
  assert.ok(html.includes('.terminal-dashboard>.term-zone-intel{grid-row:auto;'));
  assert.ok(html.includes('#page-overview #ov-regions{grid-template-columns:minmax(0,1fr)'));
  assert.ok(html.includes('.fx-chip{flex-shrink:0}'));
  assert.ok(html.includes('.topbar-right>#snap-btn'));
});
console.log(`${passed} audit regressions passed.`);
