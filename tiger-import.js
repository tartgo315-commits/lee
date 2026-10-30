/* Screenshot import plans are pure; no ledger writes before review and confirmation. */
(function(root){
 'use strict';
 const copy=x=>JSON.parse(JSON.stringify(x));
 const number=x=>x===null||x===undefined||typeof x==='boolean'||String(x).trim()===''?null:Number.isFinite(Number(x))?Number(x):null;
 function compare(data,row,account){
  const ticker=String(row.ticker||'').trim().toUpperCase(),matches=data.products.filter(p=>p.type==='stock_us'&&p.region==='us'&&p.account===account&&String(p.ticker||'').trim().toUpperCase()===ticker),before=matches[0]||null;
  const shares=number(row.shares),cost=number(row.costPrice),differences=[];
  if(before&&Math.abs(Number(before.shares)-shares)>1e-8)differences.push('shares');
  if(before&&Math.round(Number(before.costPrice)*100)!==Math.round(cost*100))differences.push('costPrice');
  if(before&&(before.currency||'USD')!==row.currency)differences.push('currency');
  const invalid=matches.length>1||!/^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker)||!(shares>0&&shares<=1e10)||!(cost!==null&&cost>=0&&cost<=1e8)||row.currency!=='USD';
  return{ticker,before,matches,differences,kind:invalid?'review':!before?'new':differences.length?'changed':'unchanged'};
 }
 // Only target-account position facts can invalidate confirmation; quotes and cash are independent.
 function signature(data,account){return JSON.stringify(data.products.filter(p=>p.type==='stock_us'&&p.region==='us'&&p.account===account).map(p=>({id:p.id,ticker:p.ticker,shares:p.shares,costPrice:p.costPrice,currency:p.currency||'USD'})));}
 function cashInfo(data,account){
  const key='us::'+account,meta=data.usAccountMeta?.[key]||null,manual=number(meta?.idleUsd),rows=data.products.filter(p=>p.region==='us'&&p.account===account&&p.type==='cash'&&p.currency==='USD');
  const amount=manual!==null?manual:rows.length&&rows.every(p=>number(p.amount)!==null)?rows.reduce((s,p)=>s+number(p.amount),0):null;
  return{key,meta,rows,amount};
 }
 function cashSignature(data,account){const c=cashInfo(data,account);return JSON.stringify({idle: number(c.meta?.idleUsd),rows:c.rows.map(p=>({id:p.id,amount:p.amount}))});}
 function cashPlan(data,draft,account){
  const source=draft.cash||{},old=cashInfo(data,account),amount=number(source.amount),fx=number(source.usdAud),errors=[];
  if(amount===null||amount<0||amount>1e12)errors.push('闲置资金：请输入有效的非负截图余额，空白不能当作零');
  if(!['USD','AUD'].includes(source.currency))errors.push('闲置资金：请明确选择截图余额的 USD 或 AUD 币种');
  if(source.currency==='AUD'&&!(fx>0&&fx<=10000))errors.push('闲置资金：请核对 1 USD 对应多少 AUD，不能缺少换算汇率');
  const raw=source.currency==='USD'?amount:source.currency==='AUD'&&fx>0&&amount!==null?amount/fx:null;
  const afterUsd=raw!==null&&Number.isFinite(raw)?Math.round((raw+Number.EPSILON)*100)/100:null;
  if(afterUsd!==null&&afterUsd>1e12)errors.push('闲置资金：换算后的 USD 余额过大，请核对金额与汇率');
  return{selected:source.selected===true,errors,sourceAmount:amount,sourceCurrency:source.currency,usdAud:source.currency==='AUD'?fx:null,beforeUsd:old.amount,afterUsd,changed:!errors.length&&(old.amount===null||Math.round(old.amount*100)!==Math.round(afterUsd*100)),key:old.key,before:copy(old.meta)};
 }
 function plan(data,draft,account){
  const errors=[],warnings=[],changes=[];account=String(account||'').trim();
  if(!account)errors.push('请选择目标 Tiger 账户');
  const rate=number(data.fx?.USD)/number(data.fx?.AUD);
  // FX and snapshot totals are informational; they do not alter quantities or cost.
  if(!/^\d{4}-\d{2}-\d{2}$/.test(draft.date||'')||!Number.isFinite(Date.parse(draft.date)))errors.push('截图日期无效');
  const rows=(draft.rows||[]).filter(r=>r.selected!==false),seen=new Set();
  if(!rows.length&&!draft.cash?.selected)errors.push('至少选择一条持仓或闲置资金变更');
  if(rows.length>100)errors.push('单次最多导入 100 条');
  let nextId=Math.max(Number(data.nextId)||1,1,...data.products.map(p=>(Number(p.id)||0)+1));
  let usd=0;
  for(const row of rows){
   const ticker=String(row.ticker||'').trim().toUpperCase(),shares=number(row.shares),price=number(row.currentPrice),cost=number(row.costPrice);
   if(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker))errors.push('股票代码无效：'+ticker);
   if(seen.has(ticker))errors.push('截图中代码重复：'+ticker);seen.add(ticker);
   if(row.currency!=='USD')errors.push(ticker+'：仅支持明确标为 USD 的美股，不能把 AUD 价格写入美股');
   if(!(shares>0&&shares<=1e10)||!(cost!==null&&cost>=0&&cost<=1e8))errors.push(ticker+'：数量须为正数，成本须为非负数；空值不能当作零');
   const existing=data.products.filter(p=>p.type==='stock_us'&&p.region==='us'&&p.account===account&&String(p.ticker||'').trim().toUpperCase()===ticker);
   if(existing.length>1)errors.push(ticker+'：目标账户有多笔同代码持仓，请先整理后导入');
   const before=existing[0]||null;
   if(before?.currency&&before.currency!=='USD')errors.push(ticker+'：现有持仓币种冲突');
   const current=compare(data,row,account);
   const value=shares*(number(before?.currentPrice)??price??0);usd+=value;
   if(current.kind==='unchanged')continue;
   if(before)warnings.push(ticker+'：仅校正持仓数量或成本，不结算现金；收益起点需核对');
   else warnings.push(ticker+'：新增已有持仓，不重复扣除现金');
   const after=before?{...before,shares:current.differences.includes('shares')?shares:before.shares,costPrice:current.differences.includes('costPrice')?cost:before.costPrice}:{id:nextId++,region:'us',type:'stock_us',account,name:ticker,ticker,shares,costPrice:cost,currentPrice:price>0&&price<=1e8?price:0,currency:'USD',createdAt:draft.date,updatedAt:draft.date};
   changes.push({ref:'p:'+after.id,before:copy(before),after});
  }
  const stockChangeCount=changes.length,cash=cashPlan(data,draft,account);
  if(cash.selected){
   errors.push(...cash.errors);
   if(cash.changed){
    const hasAccount=data.products.some(p=>p.region==='us'&&p.account===account)||changes.some(c=>c.after.region==='us'&&c.after.account===account);
    const after=hasAccount?{...(cash.before||{}),idleUsd:cash.afterUsd}:{id:nextId++,region:'us',type:'cash',account,name:'Tiger 闲置资金',currency:'USD',amount:cash.afterUsd,createdAt:draft.date,updatedAt:draft.date};
    const change={ref:hasAccount?'m:'+cash.key:'p:'+after.id,before:hasAccount?cash.before:null,after,cash:true};
    if(!hasAccount&&number(cash.before?.idleUsd)!==null)change.relatedChanges=[{ref:'m:'+cash.key,before:cash.before,after:{...cash.before,idleUsd:cash.afterUsd}}];
    changes.push(change);
    warnings.push('闲置资金单独校正为 USD '+cash.afterUsd.toFixed(2)+'；不再根据股票数量变化重复扣现金，不作为外部入出金。');
   }
  }
  const summary=draft.summary||{};
  // AUD summary is optional reference, never part of the position-change confirmation.

  const held=data.products.filter(p=>p.type==='stock_us'&&p.region==='us'&&p.account===account&&!seen.has(String(p.ticker||'').trim().toUpperCase()));
  if(held.length)warnings.push('未出现在本次截图中的 '+held.map(p=>p.ticker).join('、')+' 将保留');
  const aud=usd*rate,reported=number(summary.securitiesValue);

  return{errors,warnings,changes,stockChangeCount,cash,usd,aud,rate,account,summary:summary.currency==='AUD'?Object.fromEntries(Object.entries(summary).map(([k,v])=>[k,k==='currency'?v:number(v)])):null,nextId};
 }
 function apply(data,draft,account,options){
  const p=plan(data,draft,account);if(p.errors.length)throw Error(p.errors.join('；'));
  if(!p.changes.length)return copy(data);
  let next=copy(data);const group=options.id;
  for(const c of p.changes){
   const changed=!!c.cash||!c.before||c.before.shares!==c.after.shares||c.before.costPrice!==c.after.costPrice;
   const event={id:group+':'+(c.cash?'cash':c.after.id),timestamp:options.timestamp,date:draft.date,kind:changed?'correction':'valuation',reason:c.cash?'Tiger 截图闲置资金余额校正（含币种换算），不是外部入出金':'Tiger 截图校对导入；不是成交，不联动现金',currency:'USD',delta:c.cash&&p.cash.beforeUsd!==null?Math.round((p.cash.afterUsd-p.cash.beforeUsd)*100)/100:null,changes:[c,...c.relatedChanges||[]],flow:null,reviewRequired:changed,chainId:group};
   next=root.WealthMovements.apply(next,event);
  }
  next.tigerImports=next.tigerImports||[];
  next.tigerImports.push({id:group,at:options.timestamp,date:draft.date,account,summary:p.summary,usdAud:p.rate,tickers:p.changes.filter(c=>!c.cash).map(c=>c.after.ticker),...(p.cash.selected&&p.cash.changed?{cash:{sourceAmount:p.cash.sourceAmount,sourceCurrency:p.cash.sourceCurrency,usdAud:p.cash.usdAud,beforeUsd:p.cash.beforeUsd,afterUsd:p.cash.afterUsd}}:{})});
  next.nextId=p.nextId;return next;
 }
 root.TigerImport={number,compare,signature,cashInfo,cashSignature,cashPlan,plan,apply};
})(globalThis);
