import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
const block=html.slice(html.indexOf('const NAV_PAGES='),html.indexOf('// ══ SIDEBAR'));
const elements=new Map(),calls=[],events={};let active='overview';
for(const page of ['overview','cn','us','au','history','news','fx','settings']){
  elements.set('page-'+page,{classList:{contains:()=>active===page,remove:()=>{if(active===page)active='';},add:()=>active=page}});
  elements.set('nav-'+page,{classList:{remove(){},add(){}}});
}
elements.set('topbar-title',{textContent:''});const main={scrollTop:0,scrollTo({top}){this.scrollTop=top;}};
const location={hash:''},writes=[];
const ctx=vm.createContext({location,history:{pushState(a,b,url){writes.push('push:'+url);location.hash=url;},replaceState(a,b,url){writes.push('replace:'+url);location.hash=url;}},window:{addEventListener:(name,fn)=>events[name]=fn},document:{title:'',addEventListener(){},querySelector:()=>main,getElementById:id=>elements.get(id),querySelectorAll:selector=>[...elements].filter(([id])=>id.startsWith(selector==='.page'?'page-':'nav-')).map(([,el])=>el)},titles:{overview:'总览',history:'NAV 历史'},closeCmdk(){},closeMobileSidebar(){},historyActiveTab:'trend',renderOverview:()=>calls.push('overview'),renderRegion:id=>calls.push(id),renderUsStockPanel(){},renderHistory:()=>calls.push('history'),renderNewsPage(){},renderFXPage(){},renderSettings(){},setHistoryTab:tab=>calls.push('tab:'+tab)});
vm.runInContext(block,ctx);let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
test('Only whitelisted page and panel keys are accepted',()=>{for(const hash of ['#/settings/private','#/cn/goal','#/history/private','#/unknown','#/history/goal?amount=10'])assert.equal(ctx.parseNavigationHash(hash).hash,'#/overview');assert.equal(ctx.parseNavigationHash('#/history').hash,'#/history/trend');});
test('Direct goal link opens its panel without an intermediate entry',()=>{location.hash='#/history/goal';ctx.initNavigation();assert.equal(active,'history');assert.equal(ctx.historyActiveTab,'goal');assert.equal(writes.length,0);});
test('Repeated navigation does not add duplicate entries',()=>{ctx.showPage('cn');ctx.showPage('cn');assert.deepEqual(writes,['push:#/cn']);});
test('History shortcuts make a single entry with the desired panel',()=>{ctx.showPage('history',{tab:'flows'});assert.equal(writes.at(-1),'push:#/history/flows');assert.equal(writes.length,2);});
test('Back and forward apply routes without creating history entries',()=>{location.hash='#/cn';events.popstate();events.hashchange();assert.equal(active,'cn');assert.equal(writes.length,2);location.hash='#/history/flows';events.popstate();assert.equal(ctx.historyActiveTab,'flows');assert.equal(writes.length,2);});
test('Moving within history avoids rebuilding forms',()=>{calls.length=0;location.hash='#/history/goal';events.popstate();assert.ok(calls.includes('tab:goal'));assert.ok(!calls.includes('history'));});
test('Invalid or legacy hashes recover with replace rather than push',()=>{location.hash='#private';events.hashchange();assert.equal(active,'overview');assert.equal(location.hash,'#/overview');assert.equal(writes.at(-1),'replace:#/overview');});
test('Back restores the previous page scroll offset',()=>{ctx.showPage('cn');main.scrollTop=320;ctx.showPage('history',{tab:'goal'});location.hash='#/cn';events.popstate();assert.equal(main.scrollTop,320);});
test('Panel routes do not include financial data',()=>{assert.ok(html.includes("showPage('history',{tab});"));assert.ok(html.includes('setHistoryTab(historyActiveTab,false,false)'));assert.ok(html.includes("commitNavigation('history',tab)"));});
console.log(passed+' navigation checks passed.');
