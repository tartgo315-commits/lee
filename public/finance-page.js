function financeDisplayRows(){return FinanceView.displayRows(buildOverviewHoldingRows(D.products,valuationContext(),usManualIdleUsd),D.products);}
function financeViewStatus(view){return FinanceView.status(financeDisplayRows(),view);}
function openFinanceStock(market='US'){openModal(market==='ASX'?'au':'us');document.getElementById('m-type').value='stock_us';onType();document.getElementById('m-stock-market').value=market;syncStockCurrencyLabels();syncStockFunding(true);}
function openFinanceCash(currency){const region=currency==='AUD'?'au':'us';openModal(region);document.getElementById('m-type').value='cash';onType();const existing=D.products.find(p=>p.type==='cash'&&p.currency===currency&&FinanceView.financial(p,D.products));document.getElementById('m-account').value=existing?.account||(currency==='AUD'?'TIGER澳洲':'Tiger');document.getElementById('m-name').value=currency==='AUD'?'澳元现金':'美元现金';document.getElementById('m-currency').value=currency;if(typeof AccountPicker!=='undefined')AccountPicker.sync('m-account');}
function financeGroupHtml(rows,currency){
 if(!rows.length)return '<p class="privacy-note">暂无记录。添加持仓或通过转账转入券商现金后显示。</p>';
 const groups=new Map();for(const row of rows){const key=JSON.stringify([row.product.region,row.account]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 return [...groups.values()].map(list=>{const p=list[0].product,account=list[0].account,cny=WealthMath.sum(list.filter(r=>r.valuation.complete).map(r=>r.valuation.cny));
  const rowsHtml=list.map(compactHoldingHtml).join('');
  return '<div class="account-block"><div class="finance-account-title">'+escOvHtml(FinanceView.accountLabel(account,list.map(r=>r.product)))+' · '+list.length+' 项</div><div class="products-wrap open">'+rowsHtml+'</div></div>';
 }).join('');
}
function renderFinancePage(){
 const rows=financeDisplayRows().filter(r=>r.region==='us'),state=FinanceView.status(rows),total=document.getElementById('us-total'),sub=document.getElementById('us-sub'),growth=document.getElementById('us-growth');
 total.textContent=(state.complete?'':'已知部分 ')+fc(state.knownCny,'CNY',0);sub.textContent='等值 '+fc(fromCNY(state.knownCny,'USD'),'USD',2)+' · '+fc(fromCNY(state.knownCny,'AUD'),'AUD',2);if(growth)growth.style.display='none';
 const section=(key,label,currency,action)=>{const list=rows.filter(r=>FinanceView.category(r.product)===key),status=FinanceView.status(list);return '<section class="finance-section" id="finance-'+key+'" aria-label="'+label+'"><div class="finance-section-heading"><h2>'+label+'</h2>'+(!status.complete?'<span>已知部分</span>':'')+threeCurrencyHtml(status.knownCny)+''+action+'</div>'+financeGroupHtml(list,currency)+'</section>';};
 const addStock=market=>'<button type="button" class="btn btn-outline btn-sm" onclick="openFinanceStock(\''+market+'\')">添加持仓</button>',addCash=currency=>'<button type="button" class="btn btn-outline btn-sm" onclick="openFinanceCash(\''+currency+'\')">登记现金</button>';
 let html=section('usStocks','美股','USD',addStock('US'))+section('asx','澳洲股票','AUD',addStock('ASX'))+'<section class="finance-cash" aria-label="账户现金"><div class="finance-section-heading"><h2>账户现金</h2>'+threeCurrencyHtml(FinanceView.status(rows.filter(r=>['usdCash','audCash','otherCash'].includes(FinanceView.category(r.product)))).knownCny)+'<button type="button" class="btn btn-primary btn-sm" onclick="LedgerUI.open(\'transfer\')">转入 / 转出</button></div><p class="privacy-note">按现金的实际币种分别统计；股票市值不再计入现金。</p>'+section('usdCash','美元现金 · USD','USD',addCash('USD'))+section('audCash','澳元现金 · AUD','AUD',addCash('AUD'))+'</section>';
 for(const [key,label] of [['otherCash','其他币种现金'],['transit','在途资金'],['other','其他金融资产']])if(rows.some(r=>FinanceView.category(r.product)===key))html+=section(key,label,'CNY','');
 document.getElementById('us-blocks').innerHTML=html;document.getElementById('us-stock-panel').hidden=true;renderStockLibrary();
}
