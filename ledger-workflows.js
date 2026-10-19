/* Transaction plans only. Ledger writes remain atomic through WealthMovements.apply. */
(function(root){
  'use strict';const W=root.WealthMovements,M=root.WealthMath,clone=v=>v==null?null:JSON.parse(JSON.stringify(v));
  const n=v=>M.number(v),money=v=>{const x=n(v);if(x===null||x<0||x!==M.round(x))throw Error('金额须为非负数，最多两位小数');return x;};
  function base(o,kind){if(!o.id||!o.timestamp||M.dayIndex(o.date)===null||o.date>o.today||!String(o.reason||'').trim())throw Error('请填写有效发生日期与原因');return{id:o.id,timestamp:o.timestamp,date:o.date,kind,reason:String(o.reason).trim(),chainId:String(o.chainId||'').trim(),channel:String(o.channel||'').trim(),changes:[],flow:null,reviewRequired:false};}
  function cash(data,ref){const account=W.cashAccounts(data).find(a=>a.ref===ref);if(!account||!(account.amount>=0))throw Error('请选择有效的实际现金账户');return account;}
  function cashChange(data,account,delta){const before=clone(W.read(data,account.ref)),after=clone(before),amount=M.sum([account.amount,delta]);if(amount<0)throw Error('现金余额不足，不能透支');if(account.ref.startsWith('m:'))after.idleUsd=amount;else after.amount=amount;return{ref:account.ref,before,after};}
  function stockTrade(data,o){
    const event=base(o,'stock_trade'),account=cash(data,o.cashRef);if(account.currency!=='USD'||account.region!=='us')throw Error('美股交易请选择同一券商账户的美元现金');
    const qty=n(o.quantity),price=n(o.price),fee=money(o.fee||0);if(!(qty>0)||qty!==Number(qty.toFixed(10))||!(price>0)||!['buy','sell'].includes(o.side))throw Error('请填写成交数量（最多十位小数）、成交价与买卖方向');
    const gross=M.multiply(qty,price);if(gross<=0)throw Error('成交金额不足一分，请核对数量与价格');
    const before=o.productId?clone(data.products.find(p=>String(p.id)===String(o.productId))):null;
    const ticker=String(before?.ticker||o.ticker||'').trim().toUpperCase();if(!/^[A-Z][A-Z0-9.\-]{0,14}$/.test(ticker))throw Error('请填写有效美股代码');
    if(before&&(before.type!=='stock_us'||before.region!=='us'||(before.account||'未分类')!==account.account))throw Error('股票与现金必须属于同一券商账户');
    if(!before&&data.products.some(p=>p.type==='stock_us'&&(p.account||'未分类')===account.account&&String(p.ticker||'').toUpperCase()===ticker))throw Error('该账户已有此股票，请选择现有持仓');
    event.trade={side:o.side,ticker,quantity:qty,price,gross,fee,currency:'USD',cashRef:account.ref};event.feeAmount=fee;event.feeCurrency='USD';event.recordOnly=!!o.recordOnly;
    if(o.recordOnly)return event;
    const previousTrades=(data.movementLog||[]).filter(e=>!e.reversedAt&&!e.recordOnly&&e.kind==='stock_trade'&&e.trade?.ticker===ticker&&e.trade?.cashRef===account.ref);
    if(previousTrades.some(e=>e.date>o.date))throw Error('该持仓已有更晚交易，请按发生顺序录入，或选择仅补历史记录');
    const held=before?n(before.shares):0,cost=before?n(before.costPrice):0;if(held===null||held<0||cost===null||cost<0)throw Error('原持股数或成本无效，请先更正');
    if(o.side==='sell'&&(!before||qty>held))throw Error('卖出数量不能超过现有持仓');
    const id=before?.id||Math.max(Number(data.nextId)||1,...data.products.map(p=>(Number(p.id)||0)+1)),after=before?clone(before):{id,type:'stock_us',region:'us',account:account.account,ticker,name:ticker,createdAt:o.date};
    const oldBasis=M.multiply(held,cost),quantity=Number((held+(o.side==='buy'?qty:-qty)).toFixed(10));
    if(o.side==='buy'){
      const spent=M.sum([gross,fee]),basis=M.sum([oldBasis,spent]);event.changes.push(cashChange(data,account,-spent));after.costBasisUsd=basis;after.costPrice=basis/quantity;
      const fx=n(o.fxToCny),oldFx=n(before?.costFxToCny);if(fx!==null&&!(fx>0))throw Error('投入日汇率须大于零');
      after.costFxToCny=fx>0&&(held===0||oldFx>0)?(M.multiply(oldBasis,oldFx||1)+M.multiply(spent,fx))/basis:null;
    }else{
      const soldBasis=M.multiply(oldBasis,qty/held),received=M.sum([gross,-fee]);if(received<0)throw Error('卖出手续费不能超过成交金额');event.changes.push(cashChange(data,account,received));after.costBasisUsd=M.sum([oldBasis,-soldBasis]);after.costPrice=quantity>0?after.costBasisUsd/quantity:0;event.trade.realizedPnl=M.sum([received,-soldBasis]);
    }
    after.shares=quantity;delete after.stockList;if(!(n(before?.currentPrice)>0))after.currentPrice=price;after.updatedAt=o.date;event.changes.push({ref:'p:'+id,before,after});return event;
  }
  function matureDeposit(data,o){
    const event=base({...o,reason:o.reason||'定存到期分配'},'deposit_maturity');
    const old=clone(data.products.find(p=>String(p.id)===String(o.depositId)&&p.type==='term_deposit'));if(!old)throw Error('这笔定存已处理或不存在');
    const terms=M.depositTerms(old),value=M.depositValue(old,o.date),currency=old.tdCur||old.currency||'AUD';
    if(!terms.end||M.dayIndex(terms.end)===null)throw Error('请先补充原定存的到期日');
    if(o.date<terms.end)throw Error('尚未到期，请在实际到期结算后保存');
    const supplied=o.proceeds!==''&&o.proceeds!==undefined&&o.proceeds!==null;
    if(!supplied&&!value.complete)throw Error('原合同无法估算本息，请填写银行实际结算本息');
    const proceeds=supplied?money(o.proceeds):value.value,renew=money(o.renewAmount||0),fee=money(o.fee||0);
    if(!(proceeds>0)||renew>proceeds)throw Error('结算本息须大于零，续存不能超过本息');
    const moving=o.sendAmount===''||o.sendAmount===undefined?M.sum([proceeds,-renew]):money(o.sendAmount);
    if(M.sum([renew,moving])>proceeds||fee>moving||moving>0&&fee===moving)throw Error('续存与转出合计不能超过本息，手续费须小于转出总额');
    if(!moving&&fee)throw Error('没有转出资金时不能填写汇款手续费');
    if(!['pending','arrived'].includes(o.transferState||'pending'))throw Error('请选择到账状态');
    let id=Math.max(Number(data.nextId)||1,...data.products.map(p=>(Number(p.id)||0)+1));
    const nextId=()=>id++,account=old.account||'未分类';
    const existing=W.cashAccounts(data).find(a=>a.region===old.region&&a.account===account&&a.currency===currency);
    const remainder=M.sum([proceeds,-renew,-moving]);
    const source=existing||{ref:'p:'+nextId(),region:old.region,account,currency,amount:0};
    const sourceBefore=existing?clone(W.read(data,source.ref)):null,sourceAfter=sourceBefore?clone(sourceBefore):{id:Number(source.ref.slice(2)),type:'cash',region:old.region,account,name:'到期结算现金',currency,amount:0,createdAt:o.date};
    if(source.ref.startsWith('m:'))sourceAfter.idleUsd=M.sum([source.amount,remainder]);else sourceAfter.amount=M.sum([source.amount,remainder]);
    event.chainId=String(o.chainId||'').trim()||'定存到期 '+o.date+' · '+(old.name||'定存')+' · '+event.id.slice(0,6);event.changes=[{ref:'p:'+old.id,before:old,after:null},{ref:source.ref,before:sourceBefore,after:sourceAfter}];
    if(renew>0){
      const rate=n(o.renewRate),end=o.renewEnd,method=o.renewMethod||'simple';
      if(rate===null||rate<0||M.dayIndex(end)===null||end<=o.date)throw Error('请填写新定存年利率与晚于结算日的到期日');
      const renewed={id:nextId(),type:'term_deposit',region:old.region,account,name:String(o.renewName||'续存定存').trim(),principal:renew,rate,currency,tdCur:currency,tdStart:o.date,tdEnd:end,tdContractStart:o.date,tdContractEnd:end,tdBasisPrincipal:renew,tdBasisStart:o.date,tdOrigPrincipal:renew,tdMethod:method,tdDayCount:o.renewBasis||'ACT/365F',tdTimeZone:M.depositZone(old),tdRoundInterest:true,tdPaidInterest:0,tdPaidInterestDate:'',tdCalcVersion:3,tdNeedsReview:false,createdAt:o.date};
      const check=M.depositValue(renewed,o.date);if(!check.complete)throw Error(check.reason);
      event.changes.push({ref:'p:'+renewed.id,before:null,after:renewed});
    }
    if(moving>0){
      const target=cash(data,o.targetRef);if(target.ref===source.ref)throw Error('转出部分请选择另一个账户');
      const net=M.sum([moving,-fee]),arrived=o.transferState==='arrived';
      if(arrived){const received=target.currency===currency?net:(n(o.received)>0?money(o.received):0);if(!(received>0))throw Error('跨币种已到账时，请填写实际到账金额');event.changes.push(cashChange(data,target,received));event.receipt={currency:target.currency,amount:received,sourceAmount:net,sourceCurrency:currency};}
      else{const transit={id:nextId(),type:'in_transit',region:old.region,account,name:'在途 → '+target.account,currency,amount:net,createdAt:o.date,transfer:{status:'pending',sourceRef:source.ref,targetRef:target.ref,total:moving,fee,sourceCurrency:currency,targetCurrency:target.currency,startDate:o.date,chainId:event.chainId,channel:event.channel,sourceAccount:account,targetAccount:target.account}};event.transferId=transit.id;event.changes.push({ref:'p:'+transit.id,before:null,after:transit});}
    }
    event.feeAmount=fee;event.feeCurrency=currency;event.maturity={depositId:old.id,principal:terms.principal,proceeds,estimated:!supplied,renewAmount:renew,sendAmount:moving,cashRemainder:remainder,currency,targetRef:moving?o.targetRef:null,transferState:moving?(o.transferState||'pending'):null};
    return event;
  }

  function startTransfer(data,o){
    const event=base(o,'transfer_pending'),source=cash(data,o.sourceRef),target=cash(data,o.targetRef),total=money(o.amount),fee=money(o.fee||0);
    if(source.ref===target.ref||!(total>fee))throw Error('请选择不同的转入账户，扣款总额须大于手续费');
    const id=Math.max(Number(data.nextId)||1,...data.products.map(p=>(Number(p.id)||0)+1)),transit={id,type:'in_transit',region:source.region,account:source.account,name:'在途 → '+target.account,currency:source.currency,amount:M.sum([total,-fee]),transfer:{status:'pending',sourceRef:source.ref,targetRef:target.ref,total,fee,sourceCurrency:source.currency,targetCurrency:target.currency,startDate:o.date,chainId:event.chainId,channel:event.channel,sourceAccount:source.account,targetAccount:target.account},createdAt:o.date};
    event.transferId=id;event.feeAmount=fee;event.feeCurrency=source.currency;event.changes=[cashChange(data,source,-total),{ref:'p:'+id,before:null,after:transit}];return event;
  }
  function transit(data,id){const p=data.products.find(p=>String(p.id)===String(id)&&p.type==='in_transit');if(!p)throw Error('该笔在途资金已处理或不存在');return p;}
  function processTransfer(data,o){const event=base(o,'transfer_processing'),p=transit(data,o.transferId);if(p.transfer.status==='processing')throw Error('该笔已标记处理中');if(o.date<p.transfer.startDate)throw Error('处理日期不能早于扣款日期');event.transferId=p.id;event.chainId=p.transfer.chainId;event.changes=[{ref:'p:'+p.id,before:clone(p),after:{...clone(p),transfer:{...p.transfer,status:'processing'}}}];return event;}
  function settleTransfer(data,o){
    const event=base(o,o.cancel?'transfer_refund':'transfer_received'),p=transit(data,o.transferId),amount=money(o.received);if(!(amount>0)||o.date<p.transfer.startDate)throw Error('请核对实际到账金额及日期');
    const target=cash(data,o.cancel?p.transfer.sourceRef:p.transfer.targetRef);
    if(target.currency!==(o.cancel?p.currency:p.transfer.targetCurrency))throw Error('账户币种已变化，请先核对');
    if(o.cancel&&amount>p.transfer.total)throw Error('退款不可超过原扣款总额，额外利息请另记');
    if(o.cancel){event.feeAmount=M.sum([p.amount,-amount]);event.feeCurrency=p.currency;}
    event.transferId=p.id;event.chainId=p.transfer.chainId;event.channel=p.transfer.channel;event.receipt={currency:target.currency,amount,sourceAmount:p.amount,sourceCurrency:p.currency};
    event.changes=[{ref:'p:'+p.id,before:clone(p),after:null},cashChange(data,target,amount)];return event;
  }
  function resolveCorrection(data,o){
    const event=base(o,'correction_resolution'),original=(data.movementLog||[]).find(e=>e.id===o.eventId);
    if(!original||original.reversedAt||!original.reviewRequired||!['correction','opening'].includes(original.kind))throw Error('这条更正已处理或不需要核对');
    const after={...clone(original),reviewRequired:false,resolvedBy:event.id,resolvedAt:o.timestamp};event.relatedEventId=original.id;
    if(o.method==='baseline'){
      const tracking=data.performanceTracking;if(!tracking?.confirmed||M.dayIndex(tracking.startDate)===null)throw Error('请先设置收益核算起点');
      const opening=money(o.openingCny);event.changes.push({ref:'s:performanceTracking',before:clone(tracking),after:{...clone(tracking),openingCny:opening,needsReview:false}});
      event.resolution={method:'baseline',openingBefore:tracking.openingCny,openingAfter:opening,startDate:tracking.startDate};
    }else if(o.method==='cashflow'){
      if(original.changes.length!==1)throw Error('多账户变动须先逐项核对，不能整体改作入出金');
      const change=original.changes[0],left=W.info(change.ref,change.before),right=W.info(change.ref,change.after);
      if(!left.cash||!right.cash||left.currency!==right.currency||left.account!==right.account||left.region!==right.region)throw Error('只有同一现金项目的金额更正可改作外部入出金');
      const delta=M.sum([right.amount,-left.amount]),fx=left.currency==='CNY'?1:n(o.fxToCny);if(!delta||!(fx>0))throw Error('请填写实际历史汇率，并核对变动金额');
      event.flow={id:'movement:'+event.id,movementId:event.id,date:original.date,type:delta>0?'deposit':'withdrawal',currency:left.currency,amount:Math.abs(delta),fxToCny:fx,note:event.reason,account:left.account};event.resolution={method:'cashflow'};
    }else throw Error('请选择核对方式');
    event.changes.push({ref:'e:'+original.id,before:clone(original),after});return event;
  }
  function accountSignature(data,region,account){return JSON.stringify({products:data.products.filter(p=>p.region===region&&(p.account||'未分类')===account&&p.type!=='in_transit').map(p=>{const out={};for(const key of ['id','type','currency','tdCur','fundCurrency','amount','shares','costPrice','fundShares','fundCost','grams','goldCost','principal','rate','costFxToCny','costDate','tdPaidInterest','tdPaidInterestDate','tdContractStart','tdStart','tdMethod','tdDayCount','tdTimeZone','tdRoundInterest','tdContractEnd','tdEnd'])if(p[key]!==undefined)out[key]=p[key];return out;}).sort((a,b)=>String(a.id).localeCompare(String(b.id))),meta:region==='us'?data.usAccountMeta?.['us::'+account]||null:null});}
  function accounts(data){const found=new Map();for(const p of data.products){if(p.type==='in_transit')continue;const account=p.account||'未分类',key=JSON.stringify([p.region,account]);if(!found.has(key))found.set(key,{key,region:p.region,account,signature:accountSignature(data,p.region,account)});}return [...found.values()];}
  function reconcile(data,o){const event=base(o,'reconciliation'),account=accounts(data).find(a=>a.key===o.accountKey);if(!account)throw Error('账户不存在');const ref='r:'+account.key;event.changes=[{ref,before:clone(W.read(data,ref)),after:{signature:account.signature,date:o.date,verifiedAt:o.timestamp,note:event.reason}}];return event;}
  function accountStatus(data,asOf){return accounts(data).map(a=>{const checked=data.reconciliations?.[a.key],days=checked?M.dayIndex(asOf)-M.dayIndex(checked.date):null;return{...a,checked,status:!checked?'未核对':checked.signature!==a.signature?'有新变动':days>30?'超过30天':'已核对'};});}
  function batches(data){const map=new Map();for(const event of data.movementLog||[]){if(event.reversedAt||!event.chainId)continue;if(!map.has(event.chainId))map.set(event.chainId,{id:event.chainId,events:[],fees:{}});const group=map.get(event.chainId);group.events.push(event);if(event.feeAmount)group.fees[event.feeCurrency]=M.sum([group.fees[event.feeCurrency]||0,event.feeAmount]);}return [...map.values()].map(g=>({...g,events:g.events.sort((a,b)=>a.date.localeCompare(b.date)||a.timestamp.localeCompare(b.timestamp))}));}
  function fingerprint(data){const text=JSON.stringify({accounts:accounts(data).map(a=>[a.key,a.signature]),transit:data.products.filter(p=>p.type==='in_transit'),flows:data.cashFlows||[],snapshots:data.navHistory||[],log:data.movementLog||[],tracking:data.performanceTracking||null,goal:data.goal,plan:data.goalPlan,settings:data.settings,checks:data.reconciliations});let a=2166136261,b=5381;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}return(a>>>0).toString(16)+'-'+(b>>>0).toString(16)+'-'+text.length;}
  root.LedgerWorkflows={stockTrade,matureDeposit,startTransfer,processTransfer,settleTransfer,resolveCorrection,reconcile,accountStatus,batches,fingerprint};
})(typeof globalThis!=='undefined'?globalThis:this);
