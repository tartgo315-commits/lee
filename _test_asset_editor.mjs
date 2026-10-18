import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8'),elements=new Map();
function get(id){if(!elements.has(id))elements.set(id,{value:'',open:false,scrollTop:0,textContent:''});return elements.get(id);}
const ctx=vm.createContext({Intl,Date,document:{getElementById:get},D:{products:[]},today:()=> '2026-10-18',onType(){},updateFundModalTip(){},openModal(region){get('m-tdzone').value={cn:'Asia/Shanghai',us:'America/New_York',au:'Australia/Sydney'}[region];get('m-tdround').value='cents';}});
vm.runInContext(fs.readFileSync('calculation-engine.js','utf8'),ctx);
vm.runInContext(html.slice(html.indexOf('function assetEditorFocusId('),html.indexOf('function openModal(region,account){')),ctx);
vm.runInContext(html.slice(html.indexOf('function editProduct(id){'),html.indexOf('function deleteProduct(id){')),ctx);
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
test('New records focus account entry and existing records focus their main amount field',()=>{
  assert.equal(ctx.assetEditorFocusId(false,'cash'),'m-account');for(const [type,id] of Object.entries({cash:'m-amount',gold:'m-grams',stock_us:'m-shares',fund_cn:'m-fshares',term_deposit:'m-principal'}))assert.equal(ctx.assetEditorFocusId(true,type),id);
});
test('Opening an editor resets disclosure and scroll state without changing field values',()=>{
  get('asset-cost-details').open=true;get('td-payout-details').open=true;get('td-advanced').open=true;get('asset-editor-body').scrollTop=400;get('m-cost-fx').value='7.2';ctx.resetAssetEditorSections();assert.equal(get('asset-editor-body').scrollTop,0);assert.equal(get('asset-cost-details').open,false);assert.equal(get('m-cost-fx').value,'7.2');
});
test('Existing historical cost and paid-interest data open their disclosure sections',()=>{
  get('m-cost-fx').value='7.2';get('m-tdpaid').value='20';get('m-region').value='au';get('m-tdzone').value='Australia/Sydney';get('m-tdround').value='cents';ctx.syncAssetEditorSections();assert.equal(get('asset-cost-details').open,true);assert.equal(get('td-payout-details').open,true);assert.equal(get('td-advanced').open,false);
});
test('Non-default contract time zones and interest precision stay visible on edit',()=>{
  get('m-tdzone').value='UTC';ctx.syncAssetEditorSections();assert.equal(get('td-advanced').open,true);get('m-tdzone').value='Australia/Sydney';get('m-tdround').value='end';ctx.syncAssetEditorSections();assert.equal(get('td-advanced').open,true);
});
test('Editing zero balances, holdings, prices and costs does not blank them',()=>{
  const products=[{id:1,type:'cash',region:'cn',amount:0},{id:2,type:'stock_us',region:'us',shares:0,costPrice:0,currentPrice:0},{id:3,type:'fund_cn',region:'cn',fundShares:0,fundCost:0,fundPrice:0},{id:4,type:'gold',region:'cn',grams:0,goldCost:0,goldPrice:0}];ctx.D.products=products;
  for(const [id,fields] of [[1,['m-amount']],[2,['m-shares','m-cost','m-sprice']],[3,['m-fshares','m-fcost','m-fprice']],[4,['m-grams','m-gcost','m-gprice']]]){ctx.editProduct(id);for(const field of fields)assert.equal(get(field).value,0,field);}
});
test('Editing a zero-interest deposit preserves its canonical maturity date',()=>{
  ctx.D.products=[{id:5,type:'term_deposit',region:'au',principal:1000,currency:'USD',rate:0,tdStart:'2025-10-18',tdContractEnd:'2027-10-18'}];ctx.editProduct(5);assert.equal(get('m-rate').value,0);assert.equal(get('m-tdend').value,'2027-10-18');assert.equal(get('m-tdcur').value,'USD');
});
console.log(`${passed} asset editor checks passed.`);
