/* Attribution compares the same asset facts before/after a refresh; never writes balances. */
function valuationFactSignature(data){
 const products=(data.products||[]).map(p=>{const x={...p};for(const k of ['currentPrice','fundPrice','goldPrice','goldUpdated','lastValidPrice','quoteReference','quoteSessions','quoteSelection','marketState','updatedAt'])delete x[k];return x;});
 return JSON.stringify({products,manual:data.usAccountMeta||{},flows:data.cashFlows||[],movements:data.movementLog||[]});
}
function valuationRefreshCapture(data=D,context=valuationContext()){
 return{data:JSON.parse(JSON.stringify(data)),context:{fx:{...context.fx},quoteCache:JSON.parse(JSON.stringify(context.quoteCache||{})),now:context.now||new Date()},facts:valuationFactSignature(data)};
}
function valuationRefreshAmount(data,context){
 const rows=buildOverviewHoldingRows(data.products,context,account=>{const v=data.usAccountMeta?.['us::'+account]?.idleUsd,n=WealthMath.number(v);return v!==''&&n!==null&&n>=0?n:null;});
 return{complete:rows.every(r=>r.valuation.complete),amount:WealthMath.sum(rows.filter(r=>r.valuation.complete).map(r=>r.valuation.cny))};
}
function explainValuationRefresh(before,data=D,context=valuationContext()){
 const at=new Date().toISOString(),base=valuationRefreshAmount(before.data,before.context),after=valuationRefreshAmount(data,context),totalCny=WealthMath.sum([after.amount,-base.amount]);
 if(!base.complete||!after.complete)return{at,available:false,totalCny,reason:'存在不完整估值，暂不拆分'};
 if(before.facts!==valuationFactSignature(data))return{at,available:false,totalCny,reason:'刷新期间有资金或资料变动，暂不拆分；请核对资金流水'};
 const elapsed=valuationRefreshAmount(before.data,{...before.context,now:context.now}),refx=valuationRefreshAmount(before.data,{...before.context,now:context.now,fx:context.fx});
 if(!elapsed.complete||!refx.complete)return{at,available:false,totalCny,reason:'缺少可比较价格或汇率，暂不拆分'};
 return{at,available:true,totalCny,marketCny:WealthMath.sum([after.amount,-refx.amount]),fxCny:WealthMath.sum([refx.amount,-elapsed.amount]),accrualCny:WealthMath.sum([elapsed.amount,-base.amount]),flowsCny:0,oldFx:before.context.fx,newFx:{...context.fx}};
}
function valuationSigned(value,currency='CNY'){return(value>0?'+':'')+fc(value,currency,2);}
function valuationTime(value){const at=new Date(value);return Number.isFinite(at.getTime())?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at):'时间未知';}
function valuationRefreshSummary(report){
 if(!report)return '';if(!report.available)return report.reason;
 return '行情 '+valuationSigned(report.marketCny)+' · 汇率重估 '+valuationSigned(report.fxCny)+' · 应计利息 '+valuationSigned(report.accrualCny)+' · 资金进出 '+valuationSigned(report.flowsCny)+'（本次刷新期间）';
}
function renderValuationExplanation(){
 const root=document.getElementById('valuation-explanation');if(!root)return;
 if(!root.querySelector('button')){const button=document.createElement('button');button.type='button';button.className='valuation-details-btn';button.textContent='详情';button.title='查看估值、汇率和刷新变化详情';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','modal-valuation-details');button.onclick=openValuationDetails;root.replaceChildren(button);}
 const open=document.getElementById('modal-valuation-details');if(open?.classList.contains('open'))renderValuationDetailContent(open.querySelector('.valuation-details-body'));
}
function openValuationDetails(){
 let overlay=document.getElementById('modal-valuation-details');
 if(!overlay){overlay=document.createElement('div');overlay.id='modal-valuation-details';overlay.className='overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','valuation-details-title');overlay.innerHTML='<div class="modal valuation-details-modal"><div class="modal-hd"><h2 id="valuation-details-title">资产估值详情</h2><button type="button" class="btn btn-ghost valuation-details-close">关闭</button></div><div class="valuation-details-body"></div></div>';document.body.append(overlay);overlay.querySelector('button').onclick=()=>closeModal('modal-valuation-details');overlay.addEventListener('click',e=>{if(e.target===overlay)closeModal('modal-valuation-details');});overlay.addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();overlay.querySelector('button').focus();}});}
 modalReturnFocus=document.activeElement;renderValuationDetailContent(overlay.querySelector('.valuation-details-body'));overlay.classList.add('open');overlay.querySelector('button').focus();
}
function renderValuationDetailContent(root){
 root.replaceChildren();
 const note=document.createElement('p');note.className='valuation-basis-note';note.textContent='人民币折算估值 · 期间资产变化含资金进出、行情及汇率，不等于投资收益';root.append(note);
 const meta=D.fxMeta,fx=document.createElement('p');fx.className='valuation-fx-note';
 fx.textContent='汇率：'+(meta?.source||'预设 / 导入，来源待核对')+' · '+(meta?.quoteAt?'行情 '+valuationTime(meta.quoteAt):meta?.updatedAt?'获取 '+valuationTime(meta.updatedAt):'时间未知')+'（北京时间）';fx.title='USD/CNY '+Number(D.fx?.USD).toFixed(5)+' · AUD/CNY '+Number(D.fx?.AUD).toFixed(5)+'；外币原币余额不随汇率重估改变';root.append(fx);
 const report=D.lastValuationRefresh;if(!report)return;const details=document.createElement('section'),summary=document.createElement('h3');summary.textContent='最近刷新 '+valuationTime(report.at)+' · 估值变化 '+valuationSigned(report.totalCny);details.append(summary);
 const text=document.createElement('p');text.textContent=valuationRefreshSummary(report);details.append(text);
 if(report.available&&Math.abs(report.fxCny)>0){const n=document.createElement('p');n.textContent='AUD/CNY '+Number(report.oldFx?.AUD).toFixed(5)+' → '+Number(report.newFx?.AUD).toFixed(5)+'；汇率重估包含旧汇率校正，原币余额保持不变。';details.append(n);}root.append(details);
}
function financeStatementComparison(statement,rows,fx){
 const source=String(statement?.source||'').trim(),list=rows.filter(r=>/^tiger$/i.test(source)?/tiger|老虎/i.test(r.account||''):String(r.account||'').toLowerCase()===source.toLowerCase());
 if(!list.length)return{available:false,reason:'对账账户范围待确认'};
 const rate=WealthMath.number(fx?.AUD);if(!(rate>0)||list.some(r=>!r.valuation.complete))return{available:false,reason:'账户估值未完整，暂不比较'};
 const currentAud=WealthMath.round(WealthMath.sum(list.map(r=>r.valuation.cny))/rate);return{available:true,currentAud,deltaAud:WealthMath.sum([currentAud,-statement.totalAud]),estimated:list.some(r=>r.valuation.estimated),count:list.length};
}
