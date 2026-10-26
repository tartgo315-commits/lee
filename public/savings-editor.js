(function(root){
  'use strict';const el=id=>document.getElementById(id);
  function load(p){
    const s=p?.savingsInterest;el('m-savings-enabled').checked=!!s;
    el('m-savings-rates').value=(s?.baseRates||[]).map(r=>r.from+' '+r.rate).join('\n');
    for(const [id,value] of [['m-savings-bonus',s?.bonus?.rate??''],['m-savings-from',s?.bonus?.from||''],['m-savings-expiry',s?.bonus?.expires||'']])el(id).value=value;
    el('m-savings-boundary').value=s?.bonus?.includesExpiryDay===true?'inclusive':'exclusive';
  }
  function read(){
    if(!el('m-savings-enabled').checked)return null;
    const baseRates=el('m-savings-rates').value.trim().split(/\n+/).map(line=>{const [from,rate,...extra]=line.trim().split(/\s+/);if(extra.length||!rate)throw Error('每行请填写：YYYY-MM-DD 利率百分数');return{from,rate};});
    const rate=el('m-savings-bonus').value,bonus=rate===''?null:{rate,from:el('m-savings-from').value,expires:el('m-savings-expiry').value,includesExpiryDay:el('m-savings-boundary').value==='inclusive'};
    return SavingsInterest.validate({baseRates,bonus});
  }
  function text(p){
    if(!p.savingsInterest)return'';
    try{const date=WealthMath.dateInZone(new Date(),'Australia/Sydney'),r=SavingsInterest.rateOn(p.savingsInterest,date),bonus=p.savingsInterest.bonus;
      return '利率 '+r.total.toFixed(2)+'% = 基础 '+r.base.toFixed(2)+'% + 优惠 '+r.bonus.toFixed(2)+'%'+(bonus?' · 优惠到期 '+bonus.expires+'（'+(bonus.includesExpiryDay?'含当日':'当日不含优惠')+'，请核对银行边界）':'')+' · 当前余额日息约 '+fc(Number(p.amount)*r.total/100/365,p.currency,4)+' · 每月1日付息；预测未计入资产';
    }catch(error){return '利息资料待核对：'+error.message;}
  }
  root.SavingsEditor={load,read,text};
})(typeof globalThis!=='undefined'?globalThis:this);
