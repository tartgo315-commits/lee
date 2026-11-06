function financeDisplayRows(){return FinanceView.displayRows(buildOverviewHoldingRows(D.products,valuationContext(),usManualIdleUsd),D.products);}
function financeViewStatus(view){return FinanceView.status(financeDisplayRows(),view);}
function financeProfitStatus(){return FinanceView.profit(D,financeDisplayRows(),valuationContext());}
function financeStatementHtml(){
 const s=D.financeStatements?.at(-1);if(!s)return '';
 const comparison=typeof financeStatementComparison==='function'?financeStatementComparison(s,financeDisplayRows(),D.fx):null;
 const at=new Date(s.capturedAt),stamp=Number.isFinite(at.getTime())?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at):'';
 return '<span class="finance-statement-line"><button type="button" class="finance-statement-btn" onclick="openFinanceProfitDetails()" title="券商当时报告的账户总资产；对账记录，不重复计入资产">'+escOvHtml(s.source||'券商')+' 券商总资产 '+fc(s.totalAud,'AUD',2)+' <small>'+escOvHtml(stamp)+'</small></button>'+(comparison?'<span class="finance-reconciliation-difference">'+(comparison.available?'估值 − 券商对账 '+valuationSigned(comparison.deltaAud,'AUD')+' · 非同一时点'+(comparison.estimated?' · 含缓存 / 参考价':''):escOvHtml(comparison.reason))+'</span>':'')+'</span>';
}
function appendFinanceStatementEditor(body){
 const old=D.financeStatements?.at(-1),box=document.createElement('section');box.className='finance-statement-editor';
 const title=document.createElement('h3');title.textContent='券商总资产对账';box.append(title);
 for(const [id,label,type,value] of [['finance-statement-source','券商 / 来源','text',old?.source||'Tiger'],['finance-statement-total','券商总资产（AUD）','number',old?.totalAud??''],['finance-statement-at','截图时间（北京时间）','datetime-local',old?.capturedAt?old.capturedAt.slice(0,19):'']]){const lab=document.createElement('label'),input=document.createElement('input');lab.htmlFor=id;lab.textContent=label;input.id=id;input.type=type;input.value=value;if(type==='datetime-local')input.step='1';if(type==='number'){input.min='0';input.step='0.01';}box.append(lab,input);}
 const note=document.createElement('p');note.textContent='保存券商该时点的报告值，用于与网站行情估值比较；不增加现金、不替换实时估值、不改历史快照。';box.append(note);
 const error=document.createElement('p');error.id='finance-statement-error';error.setAttribute('role','status');const button=document.createElement('button');button.type='button';button.className='btn btn-primary';button.textContent='保存券商对账值';button.onclick=saveFinanceStatement;box.append(error,button);body.append(box);
}
function saveFinanceStatement(){
 try{
  const totalAud=WealthMath.number(document.getElementById('finance-statement-total').value),local=document.getElementById('finance-statement-at').value,source=document.getElementById('finance-statement-source').value.trim(),stamp=local.length===16?local+':00':local,at=new Date(stamp+'+08:00');
  if(totalAud===null||totalAud<0||!source||!local||!Number.isFinite(at.getTime())||at.getTime()>Date.now()+120000)throw Error('请核对券商名称、非负总资产和截图时间');
  const statement={id:crypto.randomUUID(),source,totalAud,currency:'AUD',capturedAt:stamp+'+08:00',recordedAt:new Date().toISOString()};
  const next=JSON.parse(JSON.stringify(D));next.financeStatements=[...(next.financeStatements||[]),statement];localStorage.setItem(SK+'_before_finance_statement_'+Date.now(),JSON.stringify(D));persistMovementLedger(next);closeModal('finance-profit-modal');refreshAfterMovement();showToast({message:'已保存券商对账值，资产明细与历史保持不变',type:'success'});
 }catch(e){document.getElementById('finance-statement-error').textContent=e.message;}
}
function financeProfitHtml(){const p=financeProfitStatus(),percent=p.available&&p.percent!==null?'（'+(p.percent>0?'+':'')+p.percent.toFixed(2)+'%）':'';return '<span class="finance-profit-summary"><button type="button" class="finance-profit-btn '+(p.available?(p.profitAud>=0?'positive':'negative'):'')+'" onclick="openFinanceProfitDetails()" title="按网站行情估值减净投入计算；含汇率影响，与券商截图时点不同">'+(p.available?'估算累计盈亏 '+(p.profitAud>0?'+':'')+fc(p.profitAud,'AUD',2)+percent:'估算累计盈亏 · 待补资料')+'</button><span class="finance-capital-line" title="总投入按累计净投入统计；当前总额按网站当前行情或缓存估值，不代表实时成交报价"><span>总投入 '+(p.netAud!==null&&p.available?fc(p.netAud,'AUD',2):'待核实')+'</span><span>行情估值 '+(Number.isFinite(p.currentAud)?fc(p.currentAud,'AUD',2):'估值待补')+'</span></span>'+financeStatementHtml()+'</span>';}
function openFinanceProfitDetails(){const p=financeProfitStatus(),body=document.getElementById('finance-profit-body');body.replaceChildren();const line=(label,value)=>{const row=document.createElement('p');row.textContent=label+'：'+value;body.append(row);};line('计算口径','全部股票 / 金融资产与券商现金的澳币现值 − 累计净投入；包含汇率影响，不是单只持仓账面盈亏');if(!p.available)line('暂不能计算',p.reason);line('原保存本金',p.baseAud===null?'未填写':fc(p.baseAud,'AUD',2));line('之后已记录转入',fc(p.addedAud,'AUD',2));line('之后已记录转出',fc(p.withdrawnAud,'AUD',2));line('累计净投入',p.netAud===null?'未填写':fc(p.netAud,'AUD',2));if(p.available){line('当前股票与现金合计',fc(p.currentAud,'AUD',2));line('估算累计盈亏（含汇率）',(p.profitAud>0?'+':'')+fc(p.profitAud,'AUD',2)+(p.percent!==null?'（'+p.percent.toFixed(2)+'%）':''));}line('说明','Saver 转入 Tiger 是本分类的追加投入；股票买卖、美元与澳币券商账户间划转不重复增加本金。若有未记入网站的历史入出金，请在设置中更新累计净投入。');appendFinanceStatementEditor(body);modalReturnFocus=document.activeElement;document.getElementById('finance-profit-modal').classList.add('open');document.querySelector('#finance-profit-modal button').focus();}
function openFinanceStock(market='US'){openModal(market==='ASX'?'au':'us');document.getElementById('m-type').value='stock_us';onType();document.getElementById('m-stock-market').value=market;syncStockCurrencyLabels();syncStockFunding(true);}
function openFinanceCash(currency){const region=currency==='AUD'?'au':'us';openModal(region);document.getElementById('m-type').value='cash';onType();const existing=D.products.find(p=>p.type==='cash'&&p.currency===currency&&FinanceView.financial(p,D.products));document.getElementById('m-account').value=existing?.account||(currency==='AUD'?'TIGER澳洲':'Tiger');document.getElementById('m-name').value=currency==='AUD'?'澳元现金':'美元现金';document.getElementById('m-currency').value=currency;if(typeof AccountPicker!=='undefined')AccountPicker.sync('m-account');}
function financeGroupHtml(rows,currency){
 if(!rows.length)return '<p class="privacy-note">暂无记录。添加持仓或通过转账转入券商现金后显示。</p>';
 const groups=new Map();for(const row of rows){const key=JSON.stringify([row.product.region,row.account]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 return [...groups.values()].map(list=>{const p=list[0].product,account=list[0].account,cny=WealthMath.sum(list.filter(r=>r.valuation.complete).map(r=>r.valuation.cny));
  const rowsHtml=list.filter(r=>!financeEmbeddedInterest(r,rows)).map(compactHoldingHtml).join('');
  return '<div class="account-block"><div class="finance-account-title">'+escOvHtml(FinanceView.accountLabel(account,list.map(r=>r.product)))+' · '+list.length+' 项</div><div class="products-wrap open">'+rowsHtml+'</div></div>';
 }).join('');
}
function renderFinancePage(){
 const rows=financeDisplayRows().filter(r=>r.region==='us'),state=FinanceView.status(rows),total=document.getElementById('us-total'),sub=document.getElementById('us-sub'),growth=document.getElementById('us-growth');
 total.textContent=(state.complete?'':'已知部分 ')+fc(state.knownCny,'CNY',0);sub.textContent='等值 '+fc(fromCNY(state.knownCny,'USD'),'USD',2)+' · '+fc(fromCNY(state.knownCny,'AUD'),'AUD',2);if(growth){growth.style.display='inline-flex';growth.innerHTML=financeProfitHtml();}
 const section=(key,label,currency,action)=>{const list=rows.filter(r=>FinanceView.category(r.product)===key),status=FinanceView.status(list);return '<section class="finance-section" id="finance-'+key+'" aria-label="'+label+'"><div class="finance-section-heading"><h2>'+label+'</h2>'+(!status.complete?'<span>已知部分</span>':'')+threeCurrencyHtml(status.knownCny)+''+action+'</div>'+financeGroupHtml(list,currency)+'</section>';};
 const addStock=market=>'<button type="button" class="btn btn-outline btn-sm" onclick="openFinanceStock(\''+market+'\')">添加持仓</button>',addCash=currency=>'<button type="button" class="btn btn-outline btn-sm" onclick="openFinanceCash(\''+currency+'\')">登记现金</button>';
 let html=section('usStocks','美股','USD',addStock('US'))+section('asx','澳洲股票','AUD',addStock('ASX'))+'<section class="finance-cash" aria-label="账户现金"><div class="finance-section-heading"><h2>账户现金</h2>'+threeCurrencyHtml(FinanceView.status(rows.filter(r=>['usdCash','audCash','otherCash'].includes(FinanceView.category(r.product)))).knownCny)+'<button type="button" class="btn btn-primary btn-sm" onclick="LedgerUI.open(\'transfer\')">转入 / 转出</button></div><p class="privacy-note">按现金的实际币种分别统计；股票市值不再计入现金。</p>'+section('usdCash','美元现金 · USD','USD',addCash('USD'))+section('audCash','澳元现金 · AUD','AUD',addCash('AUD'))+'</section>';
 for(const [key,label] of [['otherCash','其他币种现金'],['transit','在途资金'],['other','其他金融资产']])if(rows.some(r=>FinanceView.category(r.product)===key&&!financeEmbeddedInterest(r,rows)))html+=section(key,label,'CNY','');
 document.getElementById('us-blocks').innerHTML=html;document.getElementById('us-stock-panel').hidden=true;renderStockLibrary();
}

// Move each holding once into balanced presentation columns; totals stay shared.
function layoutOverviewFinanceColumns(root){
 const panel=root.querySelector('.ov-region-panel[data-region="us"]');if(!panel)return;
 const table=panel.querySelector('table'),body=table.querySelector('tbody'),heading=body.querySelector('.ov-region-heading');
 const rows=[...body.children].filter(row=>row!==heading),count=rows.filter(row=>row.dataset.holdingKey).length;
 if(count<2)return;
 const head=document.createElement('thead');head.append(heading);table.insertBefore(head,body);
 const right=document.createElement('tbody');right.className='finance-holdings-column';body.className='finance-holdings-column';table.append(right);panel.classList.add('finance-two-columns');
 body.replaceChildren();const midpoint=Math.ceil(count/2);let placed=0,account=null,continued=false;
 for(const row of rows){
   if(row.classList.contains('ov-account-heading')){account=row;if(placed>=midpoint){right.append(row);continued=true;}continue;}
   if(!row.dataset.holdingKey)continue;
   const target=placed<midpoint?body:right;
   if(target===right&&!continued&&account){const label=account.cloneNode(true);label.classList.add('finance-account-continuation');right.append(label);continued=true;}
   if(target===body&&account&&!account.isConnected)target.append(account);
   else if(target===body&&account.parentElement!==body)target.append(account);
   target.append(row);placed++;
 }
}

function financeEmbeddedInterest(row,rows){
 const p=row.product;if(row.region!=='us'||p.type!=='other'||!/应计利息|应收利息|未到账.*利息|accrued.*interest/i.test(p.name||''))return false;
 return rows.some(c=>c.product.type==='cash'&&c.account===row.account&&c.product.region===p.region&&c.valuation.currency===row.valuation.currency);
}
function financeAccountInterest(cashRow){return financeDisplayRows().filter(r=>financeEmbeddedInterest(r,[cashRow])&&r.account===cashRow.account);}
