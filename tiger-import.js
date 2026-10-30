/* Screenshot import plans are pure; no ledger writes before review and confirmation. */
(function(root){
 'use strict';
 const copy=x=>JSON.parse(JSON.stringify(x));
 const number=x=>x===null||x===undefined||typeof x==='boolean'||String(x).trim()===''?null:Number.isFinite(Number(x))?Number(x):null;
 function plan(data,draft,account){
  const errors=[],warnings=[],changes=[];account=String(account||'').trim();
  if(!account)errors.push('请选择目标 Tiger 账户');
  const rate=number(data.fx?.USD)/number(data.fx?.AUD);
  if(!(number(data.fx?.USD)>0&&number(data.fx?.AUD)>0&&Number.isFinite(rate)))errors.push('主页缺少有效的 USD/CNY 或 AUD/CNY 汇率');
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
   if(!(shares>0&&shares<=1e10)||!(price>0&&price<=1e8)||!(cost!==null&&cost>=0&&cost<=1e8))errors.push(ticker+'：数量和价格须为正数，成本须为非负数；空值不能当作零');
   const existing=data.products.filter(p=>p.type==='stock_us'&&p.region==='us'&&p.account===account&&String(p.ticker||'').toUpperCase()===ticker);
   if(existing.length>1)errors.push(ticker+'：目标账户有多笔同代码持仓，请先整理后导入');
   const before=existing[0]||null;
   if(before?.currency&&before.currency!=='USD')errors.push(ticker+'：现有持仓币种冲突');
   if(before&&(number(before.shares)!==shares||number(before.costPrice)!==cost))warnings.push(ticker+' 数量或成本变化：按持仓校正记录，现金不会自动结算，收益起点需核对');
   if(!before)warnings.push(ticker+' 为新增已有持仓，现金不会重复扣除');
   const value=shares*price;usd+=value;
   const market=number(row.marketValue);
   if(market!==null&&Math.abs(market-value)>Math.max(0.05,Math.abs(value)*0.002))warnings.push(ticker+'：数量 × USD 股价与截图市值不符，请核对');
   const after={...(before||{id:nextId++,region:'us',type:'stock_us',account,name:ticker,createdAt:draft.date}),ticker,shares,costPrice:cost,currentPrice:price,currency:'USD',updatedAt:draft.date};
   // Stale provider session data must not override the reviewed screenshot price.
   for(const k of ['quoteSessions','quoteSelection','quoteReference','marketState'])delete after[k];
   after.priceSource='Tiger截图（手动校对）';
   changes.push({ref:'p:'+after.id,before:copy(before),after});
  }
  const summary=draft.summary||{};
  if(summary.currency!=='AUD')errors.push('账户汇总币种须明确为 AUD；无法确认时请手动选择 AUD 并核对');
  for(const k of ['totalAssets','securitiesValue','cash','dailyPnl','holdingPnl'])if(summary[k]!==null&&summary[k]!==undefined&&summary[k]!==''&&number(summary[k])===null)errors.push('账户汇总数字无效：'+k);
  const held=data.products.filter(p=>p.type==='stock_us'&&p.region==='us'&&p.account===account&&!seen.has(String(p.ticker||'').toUpperCase()));
  if(held.length)warnings.push('未出现在本次截图中的 '+held.map(p=>p.ticker).join('、')+' 将保留');
  const aud=usd*rate,reported=number(summary.securitiesValue);
  if(reported!==null&&Math.abs(aud-reported)>Math.max(1,Math.abs(reported)*0.01))warnings.push('本次选中股票按主页汇率换算的 AUD 市值与截图证券总值不同：可能有未显示持仓、汇率或行情时点差异，请核对');
  return{errors,warnings,changes,usd,aud,rate,account,summary:copy(summary),nextId};
 }
 function apply(data,draft,account,options){
  const p=plan(data,draft,account);if(p.errors.length)throw Error(p.errors.join('；'));
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
 root.TigerImport={number,plan,apply};
})(globalThis);
