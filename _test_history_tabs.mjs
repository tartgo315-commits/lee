import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8'),start=html.indexOf('const HISTORY_TABS='),end=html.indexOf('function renderHistory(){',start);
const names=['trend','returns','flows','goal'],elements=new Map(),calls=[];
function element(){return{attributes:{},hidden:false,children:[],setAttribute(k,v){this.attributes[k]=v;},append(...nodes){this.children.push(...nodes);},replaceChildren(){this.children=[];this.textContent='';},focus(){calls.push('focus:'+this.id);},textContent:''};}
for(const name of names){for(const prefix of ['history-tab-','history-panel-']){const el=element();el.id=prefix+name;elements.set(el.id,el);}}
const target=element();target.id='plan-target';elements.set('plan-target',target);
elements.set('page-history',{classList:{contains:()=>true}});
const ctx=vm.createContext({document:{getElementById:id=>elements.get(id),querySelector:()=>({scrollTo:()=>calls.push('scroll')}),createElement:element},requestAnimationFrame:fn=>fn(),renderNavChart:range=>calls.push('chart:'+range),_navChartRange:'3M',showPage:id=>calls.push('page:'+id),fc:(amount,currency)=>currency+':'+amount,today:()=> '2026-10-18'});
vm.runInContext(html.slice(start,end),ctx);let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
test('History starts on the trend panel',()=>{assert.equal(vm.runInContext('historyActiveTab',ctx),'trend');});
test('Each tab activates exactly one panel with matching accessibility state',()=>{
  for(const name of names){ctx.setHistoryTab(name);assert.equal(names.filter(n=>!elements.get('history-panel-'+n).hidden).length,1);assert.equal(elements.get('history-tab-'+name).attributes['aria-selected'],'true');assert.equal(elements.get('history-tab-'+name).tabIndex,0);}
});
test('Unknown tab keys do not change the selected panel',()=>{ctx.setHistoryTab('flows');ctx.setHistoryTab('unknown');assert.equal(vm.runInContext('historyActiveTab',ctx),'flows');});
test('Arrow keys wrap and Home/End focus the intended tab',()=>{
  const key=(tab,key)=>ctx.handleHistoryTabKey({target:{closest:()=>({dataset:{historyTab:tab}})},key,preventDefault(){}});
  key('goal','ArrowRight');assert.equal(vm.runInContext('historyActiveTab',ctx),'trend');key('trend','ArrowLeft');assert.equal(vm.runInContext('historyActiveTab',ctx),'goal');key('returns','Home');assert.equal(vm.runInContext('historyActiveTab',ctx),'trend');key('trend','End');assert.equal(vm.runInContext('historyActiveTab',ctx),'goal');assert.ok(calls.includes('focus:history-tab-goal'));
});
test('Trend redraws only after its panel is revealed',()=>{
  calls.length=0;ctx.setHistoryTab('returns');assert.ok(!calls.some(c=>c.startsWith('chart:')));ctx.setHistoryTab('trend');assert.ok(calls.includes('chart:3M'));
});
test('Goal shortcut opens the correct section and focuses its amount field',()=>{
  calls.length=0;ctx.openHistorySection('goal','plan-target');assert.ok(calls.includes('page:history'));assert.ok(calls.includes('focus:plan-target'));assert.equal(elements.get('history-panel-goal').hidden,false);
});
test('Panel switching leaves form drafts unchanged',()=>{
  target.value='12345';ctx.setHistoryTab('returns');ctx.setHistoryTab('goal');assert.equal(target.value,'12345');
});
test('Performance cards show unavailable annualization without inventing a rate',()=>{
  const result=element();ctx.renderHistoryPerformanceSummary(result,{available:true,netInvested:1000,profit:-50,days:30,annualized:{rate:null,reason:'现金流可能多解'}},{startDate:'2026-09-18'});
  assert.equal(result.children[1].children[2].children[1].textContent,'暂无');assert.ok(result.children[2].textContent.includes('现金流可能多解'));assert.ok(result.children[2].textContent.includes('区间不足 90 天'));
});

test('A pending chart update does not draw after switching away from trend',()=>{
  const frames=[];ctx.requestAnimationFrame=fn=>frames.push(fn);calls.length=0;
  ctx.setHistoryTab('trend');ctx.setHistoryTab('goal');frames.forEach(fn=>fn());assert.ok(!calls.some(call=>call.startsWith('chart:')));
});
console.log(`${passed} history tab checks passed.`);
