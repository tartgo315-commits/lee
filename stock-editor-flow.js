/* Quantity changes settle against the selected broker cash in one atomic record. */
function syncStockFunding(reset=false){
 const field=id=>document.getElementById(id),edit=field('m-editid').value,old=D.products.find(p=>String(p.id)===edit),action=field('m-stock-action'),select=field('m-stock-cash');if(!action||!select)return;
 if(reset){action.dataset.ledgerSignature=LedgerWorkflows.fingerprint(D);field('m-stock-fx').value='';action.value='trade';field('m-stock-execution').value='';field('m-stock-fee').value='0';field('m-stock-date').value=today();field('m-stock-reason').value='';}
 const opening=action.querySelector('option[value="opening"]');opening.disabled=!!old;
 const account=field('m-account').value.trim(),cash=WealthMovements.cashAccounts(D).filter(a=>a.region==='us'&&a.currency==='USD'&&(!account||a.account===account));
 const signature=JSON.stringify(cash.map(a=>[a.ref,a.account,a.amount]));
 if(select.dataset.accounts!==signature){const previous=select.value;select.replaceChildren();for(const a of cash){const option=document.createElement('option');option.value=a.ref;option.textContent=a.account+' · '+a.name+' · '+fc(a.amount,'USD',2);select.append(option);}if(cash.some(a=>a.ref===previous))select.value=previous;select.dataset.accounts=signature;}
 const qty=Number(field('m-shares').value),delta=Number((qty-Number(old?.shares||0)).toFixed(10)),trading=action.value==='trade'&&Number.isFinite(delta)&&delta!==0;
 field('m-stock-settlement').hidden=!trading;
 const preview=field('m-stock-flow-preview');
 if(!trading){preview.textContent=action.value==='opening'?'登记已有持仓，不重复扣现金。以后增减持股数量时可自动联动现金。':action.value==='correction'?'只更正已有资料，不结算现金；这次更正会留在记录中。':'数量未变化，保存资料更新即可。';return;}
 try{const cashRow=cash.find(a=>a.ref===select.value);if(!cashRow)throw Error('该券商尚无美元现金项目，请先登记当前闲置现金余额。');const price=WealthMath.number(field('m-stock-execution').value);if(!(price>0))throw Error((delta>0?'买入 ':'卖出 ')+Math.abs(delta)+' 股：填一次实际成交价，即可计算现金与平均成本。');
  const event=WealthMath.number(field('m-stock-fee').value);if(event===null||event<0)throw Error('手续费须为非负数');const gross=WealthMath.multiply(Math.abs(delta),price),amount=delta>0?WealthMath.sum([gross,event]):WealthMath.sum([gross,-event]);
  preview.textContent=(delta>0?'买入 ':'卖出 ')+Math.abs(delta)+' 股 · '+(delta>0?'自动扣除':'自动增加')+' '+fc(amount,'USD',2)+'（已含手续费） · '+cashRow.account+' 闲置现金 '+fc(cashRow.amount,'USD',2)+' → '+fc(WealthMath.sum([cashRow.amount,delta>0?-amount:amount]),'USD',2)+'。平均成本由系统计算，不用再改。';
 }catch(e){preview.textContent=e.message;}
}
function saveStockFunding(original,product){
 const field=id=>document.getElementById(id),mode=field('m-stock-action').value,delta=Number((Number(product.shares)-Number(original?.shares||0)).toFixed(10));
 if(mode!=='trade'||delta===0)return false;
 if(field('m-stock-action').dataset?.ledgerSignature&&field('m-stock-action').dataset.ledgerSignature!==LedgerWorkflows.fingerprint(D))throw Error('账本有新变动，请重新打开资产后操作');
 if(product.region!=='us')throw Error('美股交易请选择美国地区和对应券商账户');
 if(original&&(product.region!==original.region||product.account!==original.account||product.ticker!==original.ticker))throw Error('交易时请保持原账户和股票代码；更正身份资料请另选资料更正');
 const cash=WealthMovements.cashAccounts(D).find(a=>a.ref===field('m-stock-cash').value);if(!cash)throw Error('请选择该券商的美元闲置现金');if(product.account!==cash.account)throw Error('股票账户与资金来源必须为同一券商账户');
 const side=delta>0?'buy':'sell',date=field('m-stock-date').value,reason=field('m-stock-reason').value.trim()||((side==='buy'?'买入 ':'卖出 ')+product.ticker+' '+Math.abs(delta)+' 股，联动闲置现金');
 const event=LedgerWorkflows.stockTrade(D,{id:crypto.randomUUID(),timestamp:new Date().toISOString(),today:today(),date,reason,productId:original?.id,ticker:product.ticker,cashRef:cash.ref,side,quantity:Math.abs(delta),price:field('m-stock-execution').value,fee:field('m-stock-fee').value,fxToCny:field('m-stock-fx').value});
 const change=event.changes.find(c=>c.after?.type==='stock_us');for(const key of ['name','note','stopLoss','risk_profile']){if(product[key]!==undefined)change.after[key]=product[key];else delete change.after[key];}
 persistMovementLedger(WealthMovements.apply(D,event));closeModal('modal');refreshAfterMovement();showToast({message:'已自动联动现金、更新持仓并记录',type:'success'});return true;
}
document.addEventListener('DOMContentLoaded',()=>{
 for(const id of ['m-shares','m-stock-action','m-stock-cash','m-stock-execution','m-stock-fee','m-account']){const input=document.getElementById(id);input?.addEventListener(id==='m-account'||id==='m-shares'||id==='m-stock-execution'||id==='m-stock-fee'?'input':'change',()=>syncStockFunding());}
});
