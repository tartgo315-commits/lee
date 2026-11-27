/* Guard whole-ledger writes against stale tabs; imports are validated before mutation. */
(function(root){
 'use strict';
 const clone=v=>JSON.parse(JSON.stringify(v)),object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 function signature(data){const copy=clone(data);for(const k of ['fx','fxMeta','btcQuote','newsCache','aiDailyBrief','backupStatus'])delete copy[k];for(const p of copy.products||[]){for(const k of ['currentPrice','fundPrice','goldPrice','goldUpdated','goldQuote','goldQuoteFailedAt','lastValidPrice','quoteReference','quoteSessions','quoteSelection','marketState'])delete p[k];if(['stock_us','fund_cn','gold'].includes(p.type))delete p.updatedAt;}return JSON.stringify(copy);}
 function create(storage,key){
  let baseline,blocked=false;
  const facts=raw=>{if(raw===null)return null;try{return signature(JSON.parse(raw));}catch{return 'unreadable:'+raw;}};
  const conflict=()=>{blocked=true;const e=Error('另一标签页已修改账本，已阻止覆盖。请先导出本页备份，再刷新本页继续。');e.code='STALE_TAB';return e;};
  function observe(raw){baseline=facts(raw);blocked=false;}
  function assertWritable(){if(blocked||baseline===undefined||facts(storage.getItem(key))!==baseline)throw conflict();}
  function write(data){assertWritable();const raw=JSON.stringify(data);storage.setItem(key,raw);baseline=facts(raw);return raw;}
  function backup(){assertWritable();const raw=storage.getItem(key);if(raw!==null){if(storage.getItem(key+'_before_import_first')===null)storage.setItem(key+'_before_import_first',raw);storage.setItem(key+'_before_import_latest',raw);}return raw;}
  return{observe,assertWritable,write,backup,isBlocked:()=>blocked};
 }
 function validateImport(raw){
  if(Array.isArray(raw)||object(raw)&&Object.hasOwn(raw,'assets')){
   const list=Array.isArray(raw)?raw:raw.assets;
   if(!Array.isArray(list)||!list.length)throw Error('资产导入列表为空或格式无效');
   for(const p of list){if(!object(p)||!['US','CN','AU'].includes(p.market)||!['Cash','Lock','Investment'].includes(p.asset_type))throw Error('统一资产格式的市场或类型无效');for(const k of ['holding_qty','amount','principal','cost_price','current_price'])if(p[k]!=null&&(root.WealthMath.number(p[k])===null||Number(p[k])<0))throw Error('资产数量或价格无效');}
   return 'v2';
  }
  if(!object(raw)||!Array.isArray(raw.products)||!Array.isArray(raw.navHistory))throw Error('这不是有效账本备份：必须包含资产和NAV历史列表');
  for(const k of ['products','navHistory','movementLog','cashFlows'])if(raw[k]!==undefined&&(!Array.isArray(raw[k])||raw[k].some(x=>!object(x))))throw Error(k+' 列表格式无效');
  const ids=new Set();for(const p of raw.products){if(p.id==null||String(p.id)===''||ids.has(String(p.id))||!['cash','stock_us','fund_cn','gold','term_deposit','in_transit','other'].includes(p.type))throw Error('资产类型或编号无效 / 重复');ids.add(String(p.id));}
  for(const k of ['settings','goal','fx','usAccountMeta'])if(raw[k]!=null&&!object(raw[k]))throw Error(k+' 格式无效');
  return 'ledger';
 }
 function snapshotQuality(products,now=Date.now()){
  const quotes=products.filter(p=>p.type==='gold'&&Number(p.grams)>0).map(p=>{const q=p.goldQuote,verified=q?.source==='ccb_redemption'&&q.price===p.goldPrice,at=verified?Date.parse(q.quoteAt):NaN,known=Number.isFinite(at)&&at<=now+60000;return{productId:p.id,type:'gold',price:p.goldPrice,source:known?q.source:'unverified',sourceName:known?'建设银行黄金积存赎回价':'历史 / 手动估值，来源未核实',quoteAt:known?q.quoteAt:null,fetchedAt:known?q.fetchedAt||null:null,failedAt:p.goldQuoteFailedAt||null,status:!known?'unverified':p.goldQuoteFailedAt||now-at>180000?'stale':'fresh'};});
  return{version:1,coverage:'gold',estimated:quotes.some(q=>q.status!=='fresh'),staleCount:quotes.filter(q=>q.status==='stale').length,unverifiedCount:quotes.filter(q=>q.status==='unverified').length,quotes};
 }
 function snapshotLabel(snap){const q=snap.quoteQuality;if(!q)return Number(snap.byType?.gold)>0?'黄金行情时点未记录':'';return q.staleCount?'含过期金价':q.unverifiedCount?'含未核实金价':q.quotes.length?'建行金价时点已记录':'';}
 function snapshotDetail(snap){return(snap.quoteQuality?.quotes||[]).map(q=>q.sourceName+' · ¥'+q.price+'/克 · '+(q.quoteAt?'报价 '+q.quoteAt.replace('T',' ').replace('+08:00','')+'（北京时间）':'报价时间未核实')+' · '+({fresh:'保存时最新可用',stale:'保存时已过期',unverified:'来源未核实'}[q.status])).join('；');}
 root.LedgerSafety={signature,create,validateImport,snapshotQuality,snapshotLabel,snapshotDetail};
})(typeof globalThis!=='undefined'?globalThis:this);
