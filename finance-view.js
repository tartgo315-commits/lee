/* Presentation categories. Stored account regions and historical NAV stay intact. */
(function(root){
 'use strict';
 const accountKey=p=>JSON.stringify([p.region,p.account||'未分类']);
 function broker(p,products){return /tiger|券商|证券|broker|ibkr|interactive brokers|富途|moomoo|webull/i.test(p.account||'')||products.some(s=>s.type==='stock_us'&&accountKey(s)===accountKey(p));}
 function financial(p,products=[]){
  if(p.type==='stock_us'||p.region==='us')return true;
  if(p.type==='cash'||p.type==='other')return broker(p,products);
  if(p.type==='in_transit'){const target=products.find(t=>'p:'+t.id===p.transfer?.targetRef);return broker(p,products)||!!target&&broker(target,products);}
  return false;
 }
 function view(p,products=[]){return financial(p,products)?'us':['cn','au'].includes(p.region)?p.region:'other';}
 function category(p){if(p.type==='stock_us')return root.WealthMath.stockIdentity(p).market==='ASX'?'asx':'usStocks';if(p.type==='cash')return p.currency==='AUD'?'audCash':p.currency==='USD'?'usdCash':'otherCash';return p.type==='in_transit'?'transit':'other';}
 function displayRows(rows,products){return rows.map(row=>({...row,region:view(row.product,products)}));}
 function status(rows,viewId){const list=viewId?rows.filter(r=>r.region===viewId):rows;return{knownCny:root.WealthMath.sum(list.filter(r=>r.valuation.complete).map(r=>r.valuation.cny)),complete:list.every(r=>r.valuation.complete),count:list.length};}
 root.FinanceView={financial,view,category,displayRows,status};
})(typeof globalThis!=='undefined'?globalThis:this);
