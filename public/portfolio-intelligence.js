/* Portfolio relevance and evidence computed locally; no account data leaves this module. */
(function(root){
  'use strict';
  const aliases={NVDA:['Nvidia','英伟达'],TSLA:['Tesla','特斯拉'],PLTR:['Palantir','帕兰提尔'],AAPL:['Apple','苹果公司'],MSFT:['Microsoft','微软'],GOOG:['Alphabet','Google','谷歌'],GOOGL:['Alphabet','Google','谷歌'],AMZN:['Amazon','亚马逊'],META:['Meta Platforms','Facebook'],CRCL:['Circle Internet','Circle stablecoin','USDC'],VOO:['S&P 500','标普500'],VTI:['US total stock market','美国全市场'],QQQ:['Nasdaq 100','纳斯达克100'],SPY:['S&P 500','标普500']};
  const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
  function active(p){const field={stock_us:'shares',fund_cn:'fundShares',gold:'grams',term_deposit:'principal',cash:'amount'}[p.type];return !field||Number(p[field])>0;}
  function profile(rows){
    const held=rows.filter(row=>active(row.product)),tickers=[...new Set(held.filter(row=>row.product.type==='stock_us').map(row=>String(row.product.ticker||'').toUpperCase()).filter(Boolean))];
    const currencies=[...new Set(held.map(row=>row.valuation.currency||row.product.currency||row.product.tdCur||row.product.fundCurrency).filter(Boolean))];
    return{tickers,currencies,hasStocks:held.some(row=>row.product.type==='stock_us'),hasGold:held.some(row=>row.product.type==='gold'),hasFunds:held.some(row=>row.product.type==='fund_cn'),hasDeposits:held.some(row=>row.product.type==='term_deposit'),hasCnyInvestments:held.some(row=>row.product.type==='fund_cn'&&row.valuation.currency==='CNY'),aliases};
  }
  function contains(text,term){
    if(/[\u4e00-\u9fff]/.test(term))return text.includes(term.toLowerCase());
    const escaped=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp('(^|[^a-z0-9])'+escaped+'(?=$|[^a-z0-9])','i').test(text);
  }
  function relevance(item,p){
    const title=String(item.title||'')+' '+String(item.titleZh||''),body=title+' '+String(item.desc||'')+' '+String(item.descZh||'');
    let score=0;const reasons=[];const hit=terms=>terms.some(t=>contains(body,t));const add=(points,reason)=>{score+=points;reasons.push(reason);};
    for(const ticker of p.tickers){
      // Very short symbols need financial context to avoid matching ordinary words.
      const symbolHit=contains(body,ticker)&&(ticker.length>2||hit(['stock','shares','earnings','股票','财报'])||contains(body,'$'+ticker));
      if(symbolHit||(aliases[ticker]||[]).some(t=>contains(body,t)))add(30,'持仓标的 '+ticker);
    }
    const rates=hit(['interest rate','interest rates','rate decision','monetary policy','inflation','CPI','利率','议息','通胀','货币政策']);
    if((p.currencies.includes('USD')||p.hasGold||p.hasStocks)&&((hit(['Federal Reserve','美联储'])&&rates||hit(['FOMC']))||rates&&hit(['U.S.','United States','美国'])))add(8,p.currencies.includes('USD')?'美元敞口 / 美国利率':p.hasGold?'黄金的利率环境':'美股估值环境');
    if(p.currencies.includes('AUD')&&(hit(['RBA','Reserve Bank of Australia','澳洲联储','澳储行'])&&rates||hit(['Australian dollar','AUD/USD','澳元'])||rates&&hit(['Australia','Australian','澳大利亚','澳洲'])))add(8,'澳元敞口 / 澳洲利率');
    if(p.currencies.includes('CNY')&&hit(['PBOC','人民银行','人民币','renminbi','yuan'])&&hit(['exchange rate','interest rate','利率','汇率','货币政策','贬值','升值','央行','renminbi falls','yuan weakens','人民币走弱','人民币走强']))add(6,'人民币 / 利率与汇率');
    if(p.hasGold&&hit(['gold price','gold prices','bullion','gold futures','黄金','金价']))add(9,'黄金持仓');
    if(p.hasStocks&&hit(['Nasdaq','S&P 500','US stocks','U.S. stocks','Wall Street stocks','美股','纳斯达克','标普500']))add(6,'美股整体市场');
    if(p.hasCnyInvestments&&hit(['A-shares','CSI 300','Chinese stocks','公募基金','A股','沪深300']))add(6,'人民币基金持仓');
    if(p.hasDeposits&&hit(['deposit rate','term deposit','定存利率','存款利率']))add(7,'定存再投资利率');
    return{score,reasons:[...new Set(reasons)],direct:reasons.some(r=>r.startsWith('持仓标的'))};
  }
  function rankNews(items,p,asOf,maxDays=7){
    const now=Date.parse(asOf+'T23:59:59Z'),seen=new Set(),ranked=[];
    for(const item of items||[]){
      const at=Date.parse(item.pub||'');if(!Number.isFinite(at)||at>now||now-at>(maxDays+1)*86400000)continue;
      if(!/^https?:\/\//i.test(item.link||''))continue;
      const key=String(item.title||'').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g,'')||item.link;
      if(seen.has(key))continue;seen.add(key);
      ranked.push({...item,...relevance(item,p),date:new Date(at).toISOString().slice(0,10)});
    }
    return ranked.sort((a,b)=>b.score-a.score||Date.parse(b.pub)-Date.parse(a.pub));
  }
  function eventRelevance(event,p){
    if(event.personal)return{score:100,reasons:['你的定存到期 / 需核对到账']};
    if(event.region==='us'&&(p.currencies.includes('USD')||p.hasStocks||p.hasGold))return{score:8,reasons:[p.currencies.includes('USD')?'影响美元计价资产与换汇成本':p.hasGold?'影响黄金的利率环境':'影响美股估值环境']};
    if(event.region==='au'&&p.currencies.includes('AUD'))return{score:8,reasons:['影响澳元汇率及定存续存利率']};
    if(event.region==='cn'&&p.hasCnyInvestments)return{score:6,reasons:['影响人民币基金的政策环境']};
    return{score:0,reasons:[]};
  }
  function riskReport(rows,asOf,extras={}){
    const valid=rows.filter(row=>row.valuation.complete),known=valid.reduce((sum,row)=>sum+row.valuation.cny,0),missing=rows.filter(row=>!row.valuation.complete).length;
    const currencies={},stocks=new Map();let cash=0,locked=0,due7=0,due30=0,overdue=0,reviews=0,cached=0,stops=0;
    for(const row of rows){const p=row.product,v=row.valuation;if(p.tdNeedsReview)reviews++;if(v.estimated&&p.type!=='term_deposit')cached++;if(!active(p))continue;
      if(p.type==='term_deposit'&&(p.tdContractEnd||p.tdEnd)){const days=Math.round((Date.parse((p.tdContractEnd||p.tdEnd)+'T00:00:00Z')-Date.parse(asOf+'T00:00:00Z'))/86400000);if(days<0)overdue++;else if(days<=7)due7++;else if(days<=30)due30++;}
      if(p.type==='stock_us'&&Number(p.stopLoss)>0&&Number(p.currentPrice)>0&&Number(p.currentPrice)<=Number(p.stopLoss))stops++;
      if(!v.complete)continue;currencies[v.currency]=(currencies[v.currency]||0)+v.cny;if(p.type==='cash')cash+=v.cny;if(p.type==='term_deposit')locked+=v.cny;
      if(p.type==='stock_us'){const key=String(p.ticker||p.id);stocks.set(key,(stocks.get(key)||0)+v.cny);}
    }
    const pct=v=>known>0?Math.round(v/known*100):0,items=[];
    const add=(id,level,title,evidence,action)=>items.push({id,level,title,evidence,action});
    if(missing)add('missing','high','先补齐估值',missing+' 项资产缺少有效价格、汇率或合同参数；以下比例仅对应已知部分。','补齐资料后再判断配置和收益。');
    if(extras.pendingChanges)add('ledger','high','有变动待核对',extras.pendingChanges+' 条资料更正或持仓调整尚未完成核算确认。','先核对配套现金、持仓和收益起点。');
    if(stops)add('stop','high','已触及你设置的止损线',stops+' 项持仓现价不高于已设置的止损价。','核对报价时间及自己的交易计划；系统不会执行交易。');
    if(overdue)add('overdue','high','定存到期后尚未更新',overdue+' 笔定存合同日期已过，账本仍列作定存。','核实本息到账或续存情况，避免现金和定存重复登记。');
    if(due7)add('due7','high','未来 7 天有定存到期',due7+' 笔定存即将到期。','确认到账账户、续存安排及是否需要转入券商。');
    if(reviews)add('contracts','medium','定存计息参数待确认',reviews+' 笔旧记录仍按保留参数估算。','按合同核对本金、起息日及计息方式。');
    if(cached||extras.cacheCount)add('quotes','medium','部分报价不是实时行情',Math.max(cached,extras.cacheCount||0)+' 项资产使用缓存价格或估算值。','更新报价后再核对盈亏，不把旧价当实时价格。');
    if(due30)add('due30','medium','未来 8–30 天有定存到期',due30+' 笔定存到期事项。','核对到期日和后续资金用途。');
    const biggest=Math.max(0,...stocks.values());if(pct(biggest)>=20)add('concentration','medium','单一股票占比较高','最大单一股票约占'+(missing?'已知估值':'总估值')+'的 '+pct(biggest)+'%（已合并不同账户）。','检查是否符合自己的仓位上限；占比本身不是买卖信号。');
    const foreign=Object.entries(currencies).filter(([currency])=>currency!=='CNY'),foreignPct=pct(foreign.reduce((sum,[,value])=>sum+value,0));
    if(foreignPct>=20)add('fx','info','按币种查看汇率影响',foreign.map(([currency,value])=>currency+' '+pct(value)+'%').join(' · ')+'。假设外币对人民币同向变动 1%、原币价格不变，人民币估值约变动 '+(foreignPct/100).toFixed(2)+'%。','账户在中国也可能持有美元资产；以上按计价币种统计，未穿透基金底层。');
    if(known>0)add('liquidity','info','活期现金与定存分开看','现金约 '+pct(cash)+'%，定存约 '+pct(locked)+'%；定存不作为随时可用现金。','未登记日常开支，暂不判断现金能覆盖几个月生活费。');
    return{items,known,missing,currencies,cashPct:pct(cash),lockedPct:pct(locked),foreignPct,due7,due30,overdue,cacheCount:Math.max(cached,extras.cacheCount||0)};
  }
  root.PortfolioIntelligence={profile,relevance,rankNews,eventRelevance,riskReport};
})(typeof globalThis!=='undefined'?globalThis:this);
