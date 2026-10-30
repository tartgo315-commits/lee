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
 function plan(data,draft,account){
  const errors=[],warnings=[],changes=[];account=String(account||'').trim();
  if(!account)errors.push('请选择目标 Tiger 账户');
  const rate=number(data.fx?.USD)/number(data.fx?.AUD);
  // FX and snapshot totals are informational; they do not alter quantities or cost.
  if(!/^\d{4}-\d{2}-\d{2}$/.test(draft.date||'')||!Number.isFinite(Date.parse(draft.date)))errors.push('截图日期无效');
  const rows=(draft.rows||[]).filter(r=>r.selected!==false),seen=new Set();
  if(!rows.length)errors.push('至少选择一条持仓');
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
  const summary=draft.summary||{};
  // AUD summary is optional reference, never part of the position-change confirmation.

  const held=data.products.filter(p=>p.type==='stock_us'&&p.region==='us'&&p.account===account&&!seen.has(String(p.ticker||'').trim().toUpperCase()));
  if(held.length)warnings.push('未出现在本次截图中的 '+held.map(p=>p.ticker).join('、')+' 将保留');
  const aud=usd*rate,reported=number(summary.securitiesValue);

  return{errors,warnings,changes,usd,aud,rate,account,summary:summary.currency==='AUD'?Object.fromEntries(Object.entries(summary).map(([k,v])=>[k,k==='currency'?v:number(v)])):null,nextId};
 }
 function apply(data,draft,account,options){
  const p=plan(data,draft,account);if(p.errors.length)throw Error(p.errors.join('；'));
  if(!p.changes.length)return copy(data);
  let next=copy(data);const group=options.id;
  for(const c of p.changes){
   const changed=!c.before||c.before.shares!==c.after.shares||c.before.costPrice!==c.after.costPrice;
   const event={id:group+':'+c.after.id,timestamp:options.timestamp,date:draft.date,kind:changed?'correction':'valuation',reason:'Tiger 截图校对导入；不是成交，不联动现金',currency:'USD',delta:null,changes:[c],flow:null,reviewRequired:changed,chainId:group};
   next=root.WealthMovements.apply(next,event);
  }
  next.tigerImports=next.tigerImports||[];
  next.tigerImports.push({id:group,at:options.timestamp,date:draft.date,account,summary:p.summary,usdAud:p.rate,tickers:p.changes.map(c=>c.after.ticker)});
  next.nextId=p.nextId;return next;
 }
 root.TigerImport={number,compare,signature,plan,apply};
})(globalThis);
