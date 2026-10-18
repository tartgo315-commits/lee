/* Local ledger changes. Preparing a change never mutates the supplied ledger. */
(function(root){
  'use strict';
  const M=root.WealthMath,clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const KINDS={stock_trade:'股票成交（现金已联动）',transfer_pending:'汇款已扣款 / 在途',transfer_processing:'汇款处理中',transfer_received:'汇款已到账',transfer_refund:'汇款已退款',correction_resolution:'更正核对完成',reconciliation:'账户对账',deposit:'外部入金',expense:'生活消费 / 支出',withdrawal:'对外转出 / 赠与',transfer:'自己账户间转账 / 换汇',interest:'利息 / 分红到账',valuation:'手动更新行情',trade:'买卖 / 存取定期（需核对配套余额）',correction:'数据更正',opening:'登记已有资产',metadata:'资料更新'};
  function read(data,ref){if(ref.startsWith('p:'))return data.products.find(p=>String(p.id)===ref.slice(2))||null;if(ref.startsWith('m:'))return data.usAccountMeta?.[ref.slice(2)]||null;if(ref.startsWith('e:'))return (data.movementLog||[]).find(e=>e.id===ref.slice(2))||null;if(ref.startsWith('s:'))return data[ref.slice(2)]||null;if(ref.startsWith('r:'))return data.reconciliations?.[ref.slice(2)]||null;throw Error('账户引用无效');}
  function info(ref,value){
    if(ref.startsWith('m:'))return{cash:M.number(value?.idleUsd)!==null,account:ref.slice(6),region:'us',currency:'USD',amount:M.number(value?.idleUsd)};
    return{cash:value?.type==='cash',account:value?.account||'未分类',region:value?.region,currency:value?.currency||'CNY',amount:M.number(value?.amount)};
  }
  function cashAccounts(data){
    const rows=[];
    for(const p of data.products||[]){
      if(p.type!=='cash')continue;
      if(p.region==='us'&&p.currency==='USD'&&M.number(data.usAccountMeta?.['us::'+(p.account||'未分类')]?.idleUsd)!==null)continue;
      rows.push({ref:'p:'+p.id,...info('p:'+p.id,p),name:p.name||'现金余额'});
    }
    for(const account of new Set((data.products||[]).filter(p=>p.region==='us').map(p=>p.account||'未分类'))){
      const key='us::'+account,value=data.usAccountMeta?.[key];
      if(M.number(value?.idleUsd)!==null)rows.push({ref:'m:'+key,...info('m:'+key,value),name:'手填闲置资金'});
    }
    return rows;
  }
  const financialKeys=['type','currency','region','account','amount','shares','costPrice','currentPrice','fundShares','fundCost','fundPrice','fundCurrency','grams','goldCost','goldPrice','principal','rate','tdPaidInterest','tdPaidInterestDate','tdContractStart','tdContractEnd','tdMethod','tdDayCount','tdTimeZone','tdRoundInterest','costFxToCny','costDate','idleUsd'];
  const priceKeys=['currentPrice','fundPrice','goldPrice'];
  function prepare(data,ref,after,options){
    const before=clone(read(data,ref)),next=clone(after),o=options||{};
    if(ref.startsWith('p:')&&next&&String(next.id)!==ref.slice(2))throw Error('资产编号不一致');
    if(!Object.hasOwn(KINDS,o.kind)||!String(o.reason||'').trim())throw Error('请选择变动类型并填写原因');
    if(M.dayIndex(o.date)===null||o.date>o.today)throw Error('发生日期无效或晚于今天');
    if(!o.id||!o.timestamp)throw Error('记录编号或时间缺失');
    if(!before&&!next)throw Error('资产不存在');
    if(ref.startsWith('p:')&&before?.region==='us'&&M.number(data.usAccountMeta?.['us::'+(before.account||'未分类')]?.idleUsd)>0&&(!next||next.region!=='us'||next.account!==before.account)&&!data.products.some(p=>p.id!==before.id&&p.region==='us'&&(p.account||'未分类')===(before.account||'未分类')))throw Error('该账户仍有手填闲置资金，请先处理闲置余额，再移走最后一项资产');
    if((data.products||[]).some(p=>p.type==='in_transit'&&[p.transfer?.sourceRef,p.transfer?.targetRef].includes(ref))&&(!next||!before||info(ref,before).currency!==info(ref,next).currency||info(ref,before).account!==info(ref,next).account||info(ref,before).region!==info(ref,next).region||info(ref,before).cash!==info(ref,next).cash))throw Error('此账户仍关联在途汇款，请先完成到账或退款，再更改账户身份或删除');
    const left=info(ref,before),right=info(ref,next),cash=(before?left.cash:right.cash)&&(!next||right.cash);
    const sameIdentity=!before||!next||left.currency===right.currency&&left.account===right.account&&left.region===right.region;
    if(cash&&next&&(!(right.amount>=0)||right.amount!==M.round(right.amount)))throw Error('现金余额须为非负金额，最多保留两位小数');
    if(cash&&before&&!(left.amount>=0))throw Error('原余额无效，请先核对资料');
    if(ref.startsWith('m:')&&(!before||M.number(before.idleUsd)===null||!next||M.number(next.idleUsd)===null)&&!['correction','opening'].includes(o.kind))throw Error('启用或停用手填闲置余额会替代现金项目，请选择数据更正并核对收益起点');
    const delta=cash&&sameIdentity?M.sum([next?right.amount:0,-(before?left.amount:0)]):null;
    const changed=financialKeys.filter(k=>JSON.stringify(before?.[k]??null)!==JSON.stringify(next?.[k]??null));
    if(o.kind==='metadata'&&changed.length)throw Error('金额、持仓或计息参数改变时，不能选择资料更新');
    if(o.kind==='valuation'&&(!before||!next||changed.some(k=>!priceKeys.includes(k))))throw Error('行情更新只能修改价格，不能同时修改数量、成本或账户');
    if(o.kind==='opening'&&before)throw Error('登记已有资产仅用于新增资产');
    if(['deposit','expense','withdrawal','transfer','interest'].includes(o.kind)&&(!cash||!sameIdentity))throw Error('资金变动须操作同币种的现金余额；持仓调整请选择买卖或数据更正');
    if(['expense','withdrawal','transfer'].includes(o.kind)&&!(delta<0))throw Error('该类型要求现金余额减少');
    if(['deposit','interest'].includes(o.kind)&&!(delta>0))throw Error('该类型要求现金余额增加');
    if(o.kind==='transfer'&&(!before||!next))throw Error('转账请保留转出余额项目，余额可以为零');
    if(ref.startsWith('p:')&&left.region==='us'&&left.currency==='USD'&&left.cash&&M.number(data.usAccountMeta?.['us::'+left.account]?.idleUsd)!==null&&changed.length)throw Error('该账户采用手填闲置资金，请从资金变动入口修改实际闲置余额');
    const changes=[{ref,before,after:next}],currency=before?left.currency:right.currency;
    let flow=null;
    if(['deposit','expense','withdrawal'].includes(o.kind)){
      const rate=currency==='CNY'?1:M.number(o.fxToCny);
      if(!(rate>0))throw Error('请填写发生日汇率（每 1 外币折合人民币）');
      flow={id:'movement:'+o.id,movementId:o.id,date:o.date,type:delta>0?'deposit':'withdrawal',currency,amount:Math.abs(delta),fxToCny:rate,note:String(o.reason).trim(),account:before?left.account:right.account};
    }
    if(o.kind==='transfer'){
      const target=cashAccounts(data).find(a=>a.ref===o.targetRef);
      if(!target||target.ref===ref)throw Error('请选择不同的转入现金账户');
      if(!(target.amount>=0))throw Error('转入账户原余额无效，请先核对');
      const received=M.number(o.received);
      if(!(received>0)||received!==M.round(received))throw Error('请填写实际到账金额（最多两位小数）');
      if(target.currency===currency&&received>Math.abs(delta))throw Error('同币种到账不能超过转出金额；利息请另记');
      const targetBefore=clone(read(data,target.ref)),targetAfter=clone(targetBefore);
      if(target.ref.startsWith('m:'))targetAfter.idleUsd=M.sum([target.amount,received]);else targetAfter.amount=M.sum([target.amount,received]);
      changes.push({ref:target.ref,before:targetBefore,after:targetAfter});
    }
    return{id:o.id,timestamp:o.timestamp,date:o.date,kind:o.kind,reason:String(o.reason).trim(),channel:String(o.channel||'').trim(),chainId:String(o.chainId||'').trim(),currency,delta,changes,flow,reviewRequired:['correction','opening','trade'].includes(o.kind)&&changed.length>0&&!(o.kind==='opening'&&cash&&delta===0)};
  }
  function write(data,ref,value){
    if(ref.startsWith('e:')){const index=(data.movementLog||[]).findIndex(e=>e.id===ref.slice(2));if(index<0)throw Error('原变动记录不存在');data.movementLog[index]=clone(value);return;}
    if(ref.startsWith('s:')){if(value===null)delete data[ref.slice(2)];else data[ref.slice(2)]=clone(value);return;}
    if(ref.startsWith('r:')){data.reconciliations=data.reconciliations||{};if(value===null)delete data.reconciliations[ref.slice(2)];else data.reconciliations[ref.slice(2)]=clone(value);return;}
    if(ref.startsWith('m:')){data.usAccountMeta=data.usAccountMeta||{};if(value===null)delete data.usAccountMeta[ref.slice(2)];else data.usAccountMeta[ref.slice(2)]=clone(value);return;}
    const index=data.products.findIndex(p=>String(p.id)===ref.slice(2));
    if(value===null){if(index>=0)data.products.splice(index,1);}else if(index>=0)data.products[index]=clone(value);else data.products.push(clone(value));
  }
  function apply(data,event){
    if((data.movementLog||[]).some(e=>e.id===event.id))throw Error('这条变动已保存，请勿重复提交');
    for(const c of event.changes)if(JSON.stringify(read(data,c.ref))!==JSON.stringify(c.before))throw Error('账户资料已变化，请重新打开后记录');
    const next=clone(data);for(const c of event.changes)write(next,c.ref,c.after);
    if(event.flow){next.cashFlows=next.cashFlows||[];next.cashFlows.push(clone(event.flow));}
    next.movementLog=next.movementLog||[];next.movementLog.push(clone(event));
    next.nextId=Math.max(Number(next.nextId)||1,...next.products.map(p=>(Number(p.id)||0)+1));return next;
  }
  const quoteKeys=['currentPrice','updatedAt'];
  function withoutQuote(value){const p=clone(value);if(p)for(const key of quoteKeys)delete p[key];return JSON.stringify(p);}
  function reverse(data,id,timestamp){
    const event=(data.movementLog||[]).find(e=>e.id===id);if(!event||event.reversedAt)throw Error('这条记录不存在或已撤销');
    const later=data.movementLog.slice(data.movementLog.indexOf(event)+1).filter(e=>!e.reversedAt);
    if(later.some(e=>e.relatedEventId===event.id||e.changes.some(c=>event.changes.some(original=>original.ref===c.ref))))throw Error('相关账户有后续变动，请先按相反顺序撤销');
    for(const c of event.changes){const current=read(data,c.ref),stock=event.kind==='stock_trade'&&c.after?.type==='stock_us';if(stock?withoutQuote(current)!==withoutQuote(c.after):JSON.stringify(current)!==JSON.stringify(c.after))throw Error('当前余额或持仓与记录不一致，不能直接撤销');}
    if(event.flow&&JSON.stringify((data.cashFlows||[]).find(f=>f.id===event.flow.id))!==JSON.stringify(event.flow))throw Error('关联流水已改变，请先核对，不能直接撤销');
    const next=clone(data);for(const c of event.changes){let restored=clone(c.before);if(event.kind==='stock_trade'&&restored?.type==='stock_us'){const current=read(data,c.ref);for(const key of quoteKeys)if(current?.[key]!==undefined)restored[key]=current[key];}write(next,c.ref,restored);}
    next.cashFlows=(next.cashFlows||[]).filter(f=>f.movementId!==id);next.movementLog.find(e=>e.id===id).reversedAt=timestamp;if(next.performanceTracking?.movementBaselineIds?.includes(id))next.performanceTracking.needsReview=true;return next;
  }
  root.WealthMovements={KINDS,read,info,cashAccounts,prepare,apply,reverse};
})(typeof globalThis!=='undefined'?globalThis:this);
