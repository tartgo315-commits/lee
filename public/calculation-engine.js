/* Pure calculation functions. No storage, network requests or position edits. */
(function(root){
  'use strict';
  const DAY=86400000;
  const number=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))?Number(v):null;
  function decimal(v){
    if(number(v)===null)throw Error('无效金额');
    if(number(v)===0)return{n:0n,scale:0};
    const parts=String(v).toLowerCase().split('e'),exp=Number(parts[1]||0);
    const negative=parts[0].startsWith('-'),text=parts[0].replace(/^[+-]/,'');
    const [whole,fraction='']=text.split('.');
    const power=fraction.length-exp;
    return{n:BigInt((whole||'0')+fraction)*(negative?-1n:1n)*(power<0?10n**BigInt(-power):1n),scale:Math.max(0,power)};
  }
  function roundRatio(n,d){const sign=n<0n?-1n:1n;n=n<0n?-n:n;return sign*((n*2n+d)/(d*2n));}
  function multiply(...values){
    let n=1n,scale=0;
    for(const value of values){const part=decimal(value);n*=part.n;scale+=part.scale;}
    return Number(roundRatio(n*100n,10n**BigInt(scale)))/100;
  }
  function sum(values){return Number(values.reduce((n,v)=>{const d=decimal(v);return n+roundRatio(d.n*100n,10n**BigInt(d.scale));},0n))/100;}
  const round=v=>multiply(v,1);
  function dayIndex(date){
    if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
    const ms=Date.parse(date+'T00:00:00Z');
    return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===date?ms/DAY:null;
  }
  function dateInZone(instant=new Date(),zone='Asia/Shanghai'){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
    const get=type=>parts.find(p=>p.type===type).value;
    return get('year')+'-'+get('month')+'-'+get('day');
  }
  const iso=day=>new Date(day*DAY).toISOString().slice(0,10);
  function addMonths(date,count){
    const d=new Date(dayIndex(date)*DAY),y=d.getUTCFullYear(),m=d.getUTCMonth(),day=d.getUTCDate();
    const last=new Date(Date.UTC(y,m+count+1,0)).getUTCDate();
    return new Date(Date.UTC(y,m+count,Math.min(day,last))).toISOString().slice(0,10);
  }
  function yearFraction(start,end,basis='ACT/365F'){
    const a=dayIndex(start),b=dayIndex(end);if(a===null||b===null||b<a)return null;
    if(!['ACT/365F','ACT/360','ACT/ACT'].includes(basis))return null;
    if(basis==='ACT/360')return(b-a)/360;
    if(basis==='ACT/ACT'){
      let fraction=0,cursor=a;
      while(cursor<b){const year=new Date(cursor*DAY).getUTCFullYear(),next=Date.UTC(year+1,0,1)/DAY,first=Date.UTC(year,0,1)/DAY;const stop=Math.min(next,b);fraction+=(stop-cursor)/(next-first);cursor=stop;}
      return fraction;
    }
    return(b-a)/365;
  }
  const depositZone=p=>p.tdTimeZone||({cn:'Asia/Shanghai',au:'Australia/Sydney',us:'America/New_York'}[p.region])||'Asia/Shanghai';
  function depositTerms(p){
    return{principal:number(p.tdBasisPrincipal??((p.tdOrigPrincipal!=null&&p.tdContractStart)?p.tdOrigPrincipal:p.principal)),start:p.tdBasisStart||p.tdContractStart||p.tdStart,end:p.tdContractEnd||p.tdEnd||'',method:p.tdMethod||(p.tdCompoundWeekly?'weekly':'simple'),basis:p.tdDayCount||'ACT/365F',roundInterest:p.tdRoundInterest!==false};
  }
  function depositValue(p,asOf){
    if(asOf===undefined){try{asOf=dateInZone(new Date(),depositZone(p));}catch(e){return{complete:false,value:null,reason:'合同日期时区无效'};}}
    const terms=depositTerms(p),a=dayIndex(terms.start),requested=dayIndex(asOf),end=terms.end?dayIndex(terms.end):null,rate=number(p.rate);
    if(a===null||requested===null||terms.principal===null||terms.principal<0||rate===null||rate<0||(terms.end&&end===null)||(end!==null&&end<a)||!['simple','weekly','monthly','annual'].includes(terms.method)||!['ACT/365F','ACT/360','ACT/ACT'].includes(terms.basis))return{complete:false,value:null,reason:'定存合同参数不完整'};
    const stop=Math.max(a,Math.min(requested,end??requested));
    let value=terms.principal,cursor=a,period=1;
    if(terms.method!=='simple'){
      while(period<=6000){
        const next=terms.method==='weekly'?a+7*period:dayIndex(addMonths(terms.start,period*(terms.method==='annual'?12:1)));
        if(next>stop)break;
        const interest=value*rate/100*yearFraction(iso(cursor),iso(next),terms.basis);
        value=terms.roundInterest?sum([value,round(interest)]):value+interest;cursor=next;period++;
      }
      if(period>6000)return{complete:false,value:null,reason:'定存期限超出支持范围'};
    }
    value+=value*rate/100*yearFraction(iso(cursor),iso(stop),terms.basis);
    value=round(value);
    const totalInterest=sum([value,-terms.principal]),paid=number(p.tdPaidInterest??0),paidDate=p.tdPaidInterestDate;
    if(paid===null||paid<0||paid>0&&dayIndex(paidDate)===null)return{complete:false,value:null,reason:'已付息金额或日期无效'};
    const paidToDate=paid>0&&paidDate<=iso(stop)?paid:0;
    if(paidToDate>totalInterest+0.01)return{complete:false,value:null,reason:'已付息超过估算利息，请核对合同参数'};
    if(paidToDate>0&&terms.method!=='simple')return{complete:false,value:null,reason:'复投与利息转出不能同时套用，请核对合同'};
    value=sum([value,-paidToDate]);
    return{complete:true,value,interest:sum([totalInterest,-paidToDate]),totalInterest,paidInterest:paidToDate,principal:terms.principal,days:stop-a,asOf:iso(stop),method:terms.method,basis:terms.basis,review:!!p.tdNeedsReview};
  }
  function migrate(data){
    if(!data||typeof data!=='object')throw Error('无效账本');
    data.settings=data.settings&&typeof data.settings==='object'?data.settings:{};
    data.products=Array.isArray(data.products)?data.products:[];
    data.cashFlows=Array.isArray(data.cashFlows)?data.cashFlows:[];
    data.settings.accountingTimeZone=data.settings.accountingTimeZone||'Asia/Shanghai';
    for(const p of data.products){
      if(p.type!=='term_deposit'||p.tdCalcVersion===3)continue;
      p.tdLegacyState={principal:p.principal,tdStart:p.tdStart,tdOrigPrincipal:p.tdOrigPrincipal,tdCompoundWeekly:p.tdCompoundWeekly};
      const original=number(p.tdOrigPrincipal);
      p.tdBasisPrincipal=original!==null&&p.tdContractStart?original:number(p.principal);
      p.tdBasisStart=p.tdContractStart||p.tdStart;
      p.tdMethod=p.tdMethod||(p.tdCompoundWeekly?'weekly':'simple');
      p.tdDayCount=p.tdDayCount||'ACT/365F';p.tdTimeZone=depositZone(p);
      p.tdNeedsReview=true;p.tdCalcVersion=3;
    }
    data.calculationVersion=3;return data;
  }
  function fxRate(currency,fx){const code=String(currency||'').toUpperCase();if(code==='CNY')return 1;const rate=number(fx?.[code]);return rate!==null&&rate>0?rate:null;}
  function productValue(p,context){
    if(!p||typeof p!=='object')return{complete:false,cny:null,reason:'资产记录无效'};
    const fx=context.fx||{},type=p.type;
    let amount,currency,price=null,quantity=null,estimated=false;
    if(type==='term_deposit'){
      let date;try{date=context.depositDates?.[depositZone(p)]||dateInZone(context.now||new Date(),depositZone(p));}catch(e){return{complete:false,cny:null,reason:'合同日期时区无效',id:p.id};}
      const result=depositValue(p,date);
      if(!result.complete)return{complete:false,cny:null,reason:result.reason,id:p.id};
      amount=result.value;currency=p.tdCur||p.currency||'AUD';estimated=result.review;
    }else if(type==='stock_us'||type==='fund_cn'||type==='gold'){
      quantity=number(type==='stock_us'?p.shares:type==='fund_cn'?p.fundShares:p.grams);
      price=number(type==='stock_us'?p.currentPrice:type==='fund_cn'?p.fundPrice:p.goldPrice);
      currency=type==='stock_us'?'USD':type==='gold'?'CNY':p.fundCurrency||'CNY';
      if(quantity===null||quantity<0)return{complete:false,cny:null,reason:'持有数量无效',id:p.id};
      if(quantity===0)return{complete:true,cny:0,amount:0,currency,id:p.id};
      if(!(price>0)){
        const previous=number(type==='stock_us'?context.quoteCache?.[String(p.ticker||'').toUpperCase()]?.price:p.lastValidPrice);
        if(previous>0){price=previous;estimated=true;}else return{complete:false,cny:null,reason:'缺少有效价格',id:p.id};
      }
      amount=quantity*price;
      if(type==='stock_us'&&context.quoteMeta?.get(String(p.ticker||'').toUpperCase())?.source==='cache')estimated=true;
    }else{amount=number(p.amount);currency=p.currency||'CNY';}
    const rate=fxRate(currency,fx);
    if(amount===null||!Number.isFinite(amount))return{complete:false,cny:null,reason:'金额无效',id:p.id};
    if(rate===null)return{complete:false,cny:null,reason:'缺少 '+currency+' 汇率',id:p.id};
    return{complete:true,cny:quantity!==null?multiply(quantity,price,rate):multiply(amount,rate),amount,currency,rate,price,quantity,estimated,id:p.id};
  }
  function summary(products,context){
    const rows=products.map(p=>productValue(p,context)),missing=rows.filter(r=>!r.complete);
    return{knownCny:sum(rows.filter(r=>r.complete).map(r=>r.cny)),complete:missing.length===0,missing,estimated:rows.filter(r=>r.estimated),rows};
  }
  function gainSplit(p,context){
    const valuation=productValue(p,context);if(!valuation.complete)return{complete:false,reason:valuation.reason};
    const baseRate=valuation.currency==='CNY'?1:number(p.costFxToCny);
    if(!(baseRate>0))return{complete:false,reason:'缺少投入日汇率'};
    let cost;
    if(p.type==='stock_us')cost=number(p.costPrice)===null?null:p.shares*Number(p.costPrice);
    else if(p.type==='fund_cn')cost=number(p.fundCost)===null?null:p.fundShares*Number(p.fundCost);
    else if(p.type==='gold')cost=number(p.goldCost)===null?null:p.grams*Number(p.goldCost);
    else if(p.type==='term_deposit')cost=depositTerms(p).principal;
    else cost=number(p.amount);
    if(cost===null)return{complete:false,reason:'缺少原始成本'};
    const total=sum([valuation.cny,-multiply(cost,baseRate)]);
    const asset=multiply(valuation.amount-cost,baseRate);
    return{complete:true,total,asset,fx:sum([total,-asset])};
  }
  function xirr(entries){
    const byDay=new Map();
    for(const item of entries){const day=dayIndex(item.date),amount=number(item.amount);if(day===null||amount===null)return{rate:null,reason:'现金流日期或金额无效'};byDay.set(day,(byDay.get(day)||0)+amount);}
    const flows=[...byDay].filter(([,amount])=>Math.abs(amount)>1e-8).sort((a,b)=>a[0]-b[0]);
    if(flows.length<2||!flows.some(([,a])=>a>0)||!flows.some(([,a])=>a<0))return{rate:null,reason:'需有跨日期的投入和回收'};
    let signs=0,previous=0;
    for(const [,amount] of flows){const sign=Math.sign(amount);if(previous&&sign!==previous)signs++;previous=sign;}
    // Non-conventional cashflows can have several IRRs. Do not pick one silently.
    if(signs>1)return{rate:null,reason:'现金流多次反向，年化收益可能存在多解'};
    const start=flows[0][0],scale=Math.max(...flows.map(([,a])=>Math.abs(a)));
    const f=x=>{const exponents=flows.map(([day])=>-x*(day-start)/365),shift=Math.max(...exponents);return flows.reduce((sum,[,a],i)=>sum+a/scale*Math.exp(exponents[i]-shift),0);};
    let low=-20,high=20,fl=f(low),fh=f(high);
    if(!Number.isFinite(fl)||!Number.isFinite(fh)||fl*fh>0)return{rate:null,reason:'年化收益超出可靠求解范围'};
    for(let i=0;i<200;i++){const mid=(low+high)/2,fm=f(mid);if(Math.abs(fm)<1e-12||high-low<1e-12)return{rate:Math.expm1(mid),reason:null};if(fl*fm<=0){high=mid;fh=fm;}else{low=mid;fl=fm;}}
    return{rate:null,reason:'年化收益未收敛'};
  }
  function performance(tracking,flows,currentCny,asOf,complete=true,movements=[]){
    if(!tracking?.confirmed||dayIndex(tracking.startDate)===null||number(tracking.openingCny)===null||tracking.openingCny<0)return{available:false,reason:'请先设置收益核算起点并补齐区间内入出金'};
    if(!complete||number(currentCny)===null)return{available:false,reason:'当前估值不完整，暂停计算收益'};
    if(asOf<tracking.startDate)return{available:false,reason:'核算起点晚于估值日'};
    if(!Array.isArray(flows)||flows.some(f=>!f||dayIndex(f.date)===null))return{available:false,reason:'流水日期无效，请核对导入记录'};
    if(tracking.needsReview||!Array.isArray(movements)||movements.some(event=>!event||event.reviewRequired&&!event.reversedAt&&!(event.kind==='trade'&&event.reviewedAt)&&!(tracking.movementBaselineIds||[]).includes(event.id)))return{available:false,reason:'有资产更正、初始登记或持仓调整需要核对；可撤销相关变动，或在确认当前余额后以当前资产重新开始核算'};
    const selected=flows.filter(f=>f.date>=tracking.startDate&&f.date<=asOf&&!(tracking.includedFlowIds||[]).includes(f.id));
    if(selected.some(f=>dayIndex(f.date)===null||!(number(f.amount)>0)||!['deposit','withdrawal'].includes(f.type)||!(fxRate(f.currency,{[f.currency]:f.fxToCny})>0)))return{available:false,reason:'区间内流水缺少有效金额或历史汇率'};
    const deposits=sum(selected.filter(f=>f.type==='deposit').map(f=>multiply(f.amount,fxRate(f.currency,{[f.currency]:f.fxToCny}))));
    const withdrawals=sum(selected.filter(f=>f.type==='withdrawal').map(f=>multiply(f.amount,fxRate(f.currency,{[f.currency]:f.fxToCny}))));
    const netInvested=sum([tracking.openingCny,deposits,-withdrawals]);
    const profit=sum([currentCny,-netInvested]);
    const cash=[{date:tracking.startDate,amount:-tracking.openingCny},...selected.map(f=>({date:f.date,amount:multiply(f.amount,fxRate(f.currency,{[f.currency]:f.fxToCny}))*(f.type==='deposit'?-1:1)})),{date:asOf,amount:currentCny}];
    return{available:true,netInvested,profit,deposits,withdrawals,annualized:xirr(cash),days:dayIndex(asOf)-dayIndex(tracking.startDate)};
  }
  function forecast(current,target,plan,asOf){
    if(dayIndex(asOf)===null||number(current)===null||!(number(current)>=0)||!(number(target)>0)||!plan?.confirmed||number(plan.monthlyContribution)===null||!(number(plan.monthlyContribution)>=0)||!Array.isArray(plan.rates)||plan.rates.length!==3||plan.rates.some(r=>number(r)===null||r<=-100||r>100)||plan.rates[0]>plan.rates[1]||plan.rates[1]>plan.rates[2])return{available:false,reason:'请设置每月净投入与三种情景假设'};
    const scenarios=plan.rates.map(rate=>{
      let value=Number(current),months=0;
      while(value<target&&months<1200){value=value*Math.pow(1+Number(rate)/100,1/12)+Number(plan.monthlyContribution);months++;}
      return{rate,months:value>=target?months:null,date:value>=target?addMonths(asOf,months):null};
    });
    return{available:true,scenarios};
  }
  root.WealthMath={number,round,sum,multiply,dayIndex,dateInZone,addMonths,yearFraction,depositZone,depositTerms,depositValue,migrate,fxRate,productValue,summary,gainSplit,xirr,performance,forecast};
})(typeof globalThis!=='undefined'?globalThis:this);
