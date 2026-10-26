/* Savings forecasts are informational; posted cash is never increased by a forecast. */
(function(root){
  'use strict';const M=root.WealthMath;
  function validate(config){
    if(!config||!Array.isArray(config.baseRates)||!config.baseRates.length)throw Error('请填写基础利率及生效日');
    const seen=new Set();
    for(const row of config.baseRates){if(M.dayIndex(row.from)===null||M.number(row.rate)===null||Number(row.rate)<0||seen.has(row.from))throw Error('基础利率日期或数值无效，生效日不能重复');seen.add(row.from);}
    if(config.bonus){const b=config.bonus;if(M.dayIndex(b.from)===null||M.dayIndex(b.expires)===null||b.expires<b.from||M.number(b.rate)===null||Number(b.rate)<0||typeof b.includesExpiryDay!=='boolean')throw Error('请核对优惠起止日、利率及到期日是否计息');}
    return config;
  }
  function rateOn(config,date){
    validate(config);if(M.dayIndex(date)===null)throw Error('利息日期无效');
    const base=config.baseRates.filter(r=>r.from<=date).sort((a,b)=>b.from.localeCompare(a.from))[0];
    if(!base)throw Error('该日期没有已登记基础利率，不能倒推历史利息');
    const b=config.bonus,active=!!b&&date>=b.from&&(date<b.expires||b.includesExpiryDay&&date===b.expires);
    return{base:Number(base.rate),bonus:active?Number(b.rate):0,total:Number((Number(base.rate)+(active?Number(b.rate):0)).toFixed(10))};
  }
  function forecast(config,closingBalances){
    validate(config);if(!Array.isArray(closingBalances)||!closingBalances.length)throw Error('需要逐日日终余额，不能用当前余额倒推整月');
    let raw=0,last=null;const months={},days=[];
    for(const row of closingBalances){const day=M.dayIndex(row.date),balance=M.number(row.balance);if(day===null||balance===null||balance<0||last!==null&&day!==last+1)throw Error('日终余额须按日期连续且不重复');last=day;
      const rate=rateOn(config,row.date),interest=balance*rate.total/100/365,month=row.date.slice(0,7);raw+=interest;months[month]=(months[month]||0)+interest;days.push({date:row.date,balance,...rate,interest});
    }
    const monthly=Object.fromEntries(Object.entries(months).map(([key,value])=>[key,M.round(value)]));
    return{days,interest:M.sum(Object.values(monthly)),unroundedInterest:raw,monthly,includedInAssets:false};
  }
  root.SavingsInterest={validate,rateOn,forecast};
})(typeof globalThis!=='undefined'?globalThis:this);
