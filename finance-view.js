/* Presentation categories. Stored account regions and historical NAV stay intact. */
(function(root){
 'use strict';
 const accountKey=p=>JSON.stringify([p.region,p.account||'未分类']);
 function broker(p,products){return /tiger|券商|证券|broker|ibkr|interactive brokers|富途|moomoo|webull/i.test(p.account||'')||products.some(s=>s.type==='stock_us'&&accountKey(s)===accountKey(p));}
 function financial(p,products=[]){
  if(p.type==='stock_us'||p.region==='us')return true;
  if(p.type==='cash'||p.type==='other')return broker(p,products);
  if(p.type==='in_transit'){const target=products.find(t=>'p:'+t.id===p.transfer?.targetRef);return broker(p,products)||!!target&&broker(target,products);}
  return false;
 }
 function view(p,products=[]){return financial(p,products)?'us':['cn','au'].includes(p.region)?p.region:'other';}
 function category(p){if(p.type==='stock_us')return root.WealthMath.stockIdentity(p).market==='ASX'?'asx':'usStocks';if(p.type==='cash')return p.currency==='AUD'?'audCash':p.currency==='USD'?'usdCash':'otherCash';return p.type==='in_transit'?'transit':'other';}
 function displayRows(rows,products){return rows.map(row=>({...row,region:view(row.product,products)}));}
 function accountLabel(account,products=[]){
  if(!/^tiger(?:\s*(?:澳洲|澳币|澳元|美金|美元|australia|au|us|aud|usd))?$/i.test(String(account).trim()))return account;
  const currencies=[...new Set(products.map(p=>p.type==='stock_us'?root.WealthMath.stockIdentity(p).currency:p.currency).filter(Boolean))].sort();
  if(currencies.length===1&&currencies[0]==='AUD')return 'Tiger 澳币（AUD）';
  if(currencies.length===1&&currencies[0]==='USD')return 'Tiger 美金（USD）';
  return currencies.length>1?'Tiger 多币种（'+currencies.join(' / ')+'）':account;
 }
 function status(rows,viewId){const list=viewId?rows.filter(r=>r.region===viewId):rows;return{knownCny:root.WealthMath.sum(list.filter(r=>r.valuation.complete).map(r=>r.valuation.cny)),complete:list.every(r=>r.valuation.complete),count:list.length};}
 // AUD is the user's contribution currency. Never convert historical funding at today's FX.
 function capital(data){
  const M=root.WealthMath,base=M.number(data.settings?.usPrincipalAUD),included=new Set(data.settings?.financePrincipalIncludedIds||[]),events=data.movementLog||[],products=data.products||[],known=new Map();
  for(const e of events)for(const c of e.changes||[])if(c.ref.startsWith('p:')&&(c.after||c.before))known.set(c.ref,c.after||c.before);for(const p of products)known.set('p:'+p.id,p);
  const product=(ref,fallback)=>ref?.startsWith('m:')?{region:'us',account:ref.slice(6),type:'cash',currency:'USD'}:fallback||known.get(ref),isFinance=(ref,p)=>financial(product(ref,p)||{},products),amount=p=>M.number(p?.idleUsd??p?.amount),currency=(ref,p)=>ref?.startsWith('m:')?'USD':p?.currency;
  const parts=[],missing=[],seen=new Map();
  for(const e of events){if(seen.has(e.id)){if(seen.get(e.id)!==JSON.stringify(e))missing.push(e.id);continue;}seen.set(e.id,JSON.stringify(e));if(e.reversedAt&&included.has(e.id)){missing.push(e.id);continue;}if(e.reversedAt||included.has(e.id))continue;try{const changes=e.changes||[],transit=changes.find(c=>c.before?.type==='in_transit'&&!c.after),t=transit?.before?.transfer,sourceRef=e.transfer?.sourceRef||t?.sourceRef||e.maturity?.settlementRef||changes[0]?.ref,targetRef=e.transfer?.targetRef||t?.targetRef||e.maturity?.targetRef||(e.kind==='transfer'?changes[1]?.ref:null),source=changes.find(c=>c.ref===sourceRef),target=changes.find(c=>c.ref===targetRef),s=isFinance(sourceRef,source?.before||source?.after),d=targetRef?isFinance(targetRef,target?.after||target?.before):false;
   let value=0,cur='AUD',relevant=false;
   if(['transfer','transfer_pending','transfer_received','transfer_refund'].includes(e.kind)){
    if(s===d)continue;
    if(transit){if(e.kind==='transfer_refund'){if(s)continue;relevant=true;value=-amount(changes.find(c=>c.ref===t.sourceRef)?.after)+amount(changes.find(c=>c.ref===t.sourceRef)?.before);cur=t.sourceCurrency||transit.before.currency;}
     else{if(d)continue;relevant=true;value=-(e.receipt?.amount??0);cur=e.receipt?.currency;}}
    else{if(s&&e.kind==='transfer_pending')continue;relevant=true;if(d&&currency(sourceRef,source?.before)==='AUD'){value=M.sum([amount(source.before),-(amount(source.after)||0)]);cur='AUD';}else{value=(d?1:-1)*(e.receipt?.amount??(target?M.sum([amount(target.after)||0,-(amount(target.before)||0)]):0));cur=e.receipt?.currency||currency(targetRef,target?.after);}}
   }else if(e.kind==='deposit_maturity'&&e.maturity?.targetRef&&d&&!s){relevant=true;value=e.maturity.sendAmount;cur=e.maturity.currency;}
   else if(e.kind==='correction_resolution'&&e.flow){const original=events.find(x=>x.id===e.relatedEventId),c=original?.changes?.[0];if(c&&isFinance(c.ref,c.after||c.before)){relevant=true;value=(e.flow.type==='deposit'?1:-1)*e.flow.amount;cur=e.flow.currency;}}
   else if(['deposit','withdrawal','expense'].includes(e.kind)&&s&&e.flow){relevant=true;value=(e.flow.type==='deposit'?1:-1)*e.flow.amount;cur=e.flow.currency;}
   if(!relevant)continue;if(cur!=='AUD'||!Number.isFinite(value)){missing.push(e.id);continue;}parts.push({id:e.id,date:e.date,amount:value});}catch{missing.push(e.id);}
  }
  const added=M.sum(parts.filter(p=>p.amount>0).map(p=>p.amount)),withdrawn=M.sum(parts.filter(p=>p.amount<0).map(p=>-p.amount));
  return{available:base!==null&&base>0&&!missing.length,baseAud:base,addedAud:added,withdrawnAud:withdrawn,netAud:base!==null?M.sum([base,added,-withdrawn]):null,parts,missing,reason:base===null||base<=0?'请设置股票 / 金融累计净投入':missing.length?'有资金记录缺少历史澳币金额，或已计入本金的记录被撤销，请核实累计净投入':''};
 }
 function profit(data,rows,context){const M=root.WealthMath,basis=capital(data),state=status(rows,'us'),fx=M.number(context.fx?.AUD);if(!basis.available||!state.complete||!(fx>0))return{...basis,available:false,reason:basis.reason||'估值或澳币汇率不完整，暂不计算累计盈亏'};const currentAud=M.round(state.knownCny/fx),profitAud=M.sum([currentAud,-basis.netAud]);return{...basis,currentAud,profitAud,percent:basis.netAud>0?profitAud/basis.netAud*100:null};}
 root.FinanceView={financial,view,category,displayRows,accountLabel,status,capital,profit};
})(typeof globalThis!=='undefined'?globalThis:this);
