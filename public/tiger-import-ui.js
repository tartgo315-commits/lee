(function(){
 'use strict';let draft=null,signature='',imageUrl='',requestId=0,opener,ocrAbort;
 const $=id=>document.getElementById(id),text=(tag,value,parent)=>{const e=document.createElement(tag);e.textContent=value;parent?.append(e);return e;};
 function download(value,name){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function resetConfirm(){$('ti-confirm').checked=false;}
 function open(){
  opener=document.activeElement;draft=null;signature=TigerImport.signature(D,$('ti-account').value);requestId++;$('ti-rows').replaceChildren();$('ti-review').hidden=true;$('ti-file').value='';$('ti-status').textContent='上传后只生成预览，不会立即修改资产。';$('ti-image').removeAttribute('src');$('ti-image').hidden=true;$('ti-image').parentElement.hidden=true;$('ti-image-toggle').textContent='展开原图';if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl='';
  const select=$('ti-account');select.replaceChildren();const accounts=[...new Set(['Tiger',...D.products.filter(p=>p.region==='us'&&/tiger|老虎/i.test(p.account||'')).map(p=>p.account)])];for(const a of accounts){const option=text('option',a,select);option.value=a;}
  $('ti-date').value=today();signature=TigerImport.signature(D,select.value);$('ti-show-all').checked=false;$('ti-summary-wrap').hidden=true;$('ti-summary-toggle').textContent='查看截图账户汇总（仅供参考）';$('modal-tiger').classList.add('open');$('ti-file').focus();
 }
 function close(){ocrAbort?.abort();requestId++;$('modal-tiger').classList.remove('open');draft=null;if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl='';$('ti-image').removeAttribute('src');opener?.focus();}
 function input(parent,label,value,type,change){const e=document.createElement('input');e.type=type;e.setAttribute('aria-label',label);if(type==='checkbox')e.checked=value;else e.value=value??'';if(type==='number')e.step='any';e.addEventListener(type==='checkbox'?'change':'input',()=>{change(type==='checkbox'?e.checked:e.value);resetConfirm();preview();});parent.append(e);return e;}
 function render(){
  $('ti-rows').replaceChildren();draft.rows.forEach((r,i)=>{const tr=document.createElement('tr');$('ti-rows').append(tr);const cell=()=>{const td=document.createElement('td');tr.append(td);return td;};input(cell(),'选择第 '+(i+1)+' 行',r.selected!==false,'checkbox',v=>r.selected=v);
   for(const [key,label,type]of [['ticker','代码','text'],['shares','数量','number'],['costPrice','USD 成本','number']])input(cell(),label+' 第 '+(i+1)+' 行',r[key],type,v=>r[key]=v);
   const cur=document.createElement('select');cur.setAttribute('aria-label','币种 第 '+(i+1)+' 行');for(const c of ['UNKNOWN','USD','AUD']){const o=text('option',c,cur);o.value=c;}cur.value=r.currency;cur.onchange=()=>{r.currency=cur.value;resetConfirm();preview();};cell().append(cur);cell().className='ti-diff';for(const [j,td]of [...tr.children].entries())td.dataset.label=['导入','代码','数量','成本 USD','币种','持仓变更'][j];
  });
  $('ti-summary').replaceChildren();
  const currency=document.createElement('select');currency.setAttribute('aria-label','账户汇总币种');for(const c of ['UNKNOWN','AUD','USD']){const o=text('option',c,currency);o.value=c;}currency.value=draft.summary.currency;currency.onchange=()=>{draft.summary.currency=currency.value;resetConfirm();preview();};const label=text('label','账户汇总币种 ', $('ti-summary'));label.append(currency);
  for(const [key,label]of [['totalAssets','总资产'],['securitiesValue','证券总值'],['cash','预估现金'],['dailyPnl','今日盈亏'],['holdingPnl','持仓盈亏']]){const l=text('label',label+'（AUD）', $('ti-summary'));input(l,label+' AUD',draft.summary[key],'number',v=>draft.summary[key]=v);}
  $('ti-review').hidden=false;resetConfirm();preview();
 }
 function preview(){
  if(!draft)return;draft.date=$('ti-date').value;const p=TigerImport.plan(D,draft,$('ti-account').value);if(!draft.date||draft.date>today())p.errors.push('截图日期须有效且不晚于今天');
  $('ti-diagnostics').replaceChildren();for(const e of p.errors)text('p','错误：'+e,$('ti-diagnostics'));for(const w of [...(draft.warnings||[]).filter(w=>!w.includes('数量 × 股价')).map(w=>w.startsWith('免费文字识别')?'文字识别可能有误，只需核对下列持仓变更。':w),...p.warnings])text('p','请核对：'+w,$('ti-diagnostics'));
  let changed=0,unchanged=0;const counts=new Map();for(const r of draft.rows){const t=String(r.ticker||'').trim().toUpperCase();counts.set(t,(counts.get(t)||0)+1);}
  for(const [i,r]of draft.rows.entries()){
   const tr=$('ti-rows').children[i],target=tr?.querySelector('.ti-diff');if(!target)continue;const c=TigerImport.compare(D,r,$('ti-account').value),same=c.kind==='unchanged'&&counts.get(c.ticker)===1;
   tr.hidden=same&&!$('ti-show-all').checked;if(same)unchanged++;else changed++;
   if(!c.before)target.textContent='新增持仓';else if(same)target.textContent='持仓未变；股价自动更新';else{const parts=[];if(c.differences.includes('shares'))parts.push('数量 '+c.before.shares+' → '+r.shares);if(c.differences.includes('costPrice'))parts.push('USD 成本 '+c.before.costPrice+' → '+r.costPrice);if(c.differences.includes('currency'))parts.push('币种 '+(c.before.currency||'USD')+' → '+r.currency);target.textContent=parts.join('；')||'请补全数量、成本及 USD 币种';}
  }
  $('ti-totals').textContent=changed+' 条新增或持仓变更，'+unchanged+' 条持仓未变。只需确认数量、成本和币种；股价与市值波动由现有行情来源定期更新。';
  $('ti-save').disabled=p.errors.length>0||!p.changes.length||!$('ti-confirm').checked;
  $('ti-save').textContent=p.changes.length?'确认更新 '+p.changes.length+' 条持仓变更':'没有持仓变更，无需保存';

 }
 async function upload(file){
  ocrAbort?.abort();const id=++requestId;ocrAbort=new AbortController();draft=null;$('ti-review').hidden=true;$('ti-status').textContent='';
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>6*1024*1024){$('ti-status').textContent='请选择不超过 6 MB 的 PNG、JPEG 或 WebP 截图';return;}
  if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=URL.createObjectURL(file);$('ti-image').src=imageUrl;$('ti-image').parentElement.hidden=false;$('ti-status').textContent='正在识别持仓表与账户汇总…';
  try{const result=await TigerOCR.recognize(file,{signal:ocrAbort.signal,onProgress:message=>{if(id===requestId)$('ti-status').textContent=message;}});if(id!==requestId)return;draft={...result,date:$('ti-date').value};signature=TigerImport.signature(D,$('ti-account').value);render();$('ti-status').textContent='识别完成：仅显示新增或持仓变更，未变化的持仓已折叠。';
  }catch(e){if(id===requestId){$('ti-status').textContent=(e.message||'识别失败')+'；可以点击“手动填写持仓”继续。';}}
 }

 function commit(){
  try{if(!draft||!$('ti-confirm').checked)throw Error('请先核对并勾选确认');if(TigerImport.signature(D,$('ti-account').value)!==signature)throw Error('该账户持仓已变化，请点击“重新比较最新账本”后再次校对确认');
   const check=TigerImport.plan(D,draft,$('ti-account').value);if(!check.changes.length)throw Error('没有持仓变更，无需保存');
   const next=TigerImport.apply(D,draft,$('ti-account').value,{id:crypto.randomUUID(),timestamp:new Date().toISOString()});
   // Backup failure aborts the operation; the main ledger is written exactly once.
   const key=SK+'_tiger_backup_'+Date.now();localStorage.setItem(key,JSON.stringify(D));localStorage.setItem(SK+'_tiger_last_backup',key);persistMovementLedger(next);close();refreshAfterMovement();setTimeout(()=>{if(typeof autoRefreshQuotesSilent==='function')void autoRefreshQuotesSilent();},0);showToast({message:'已保存持仓变更及备份；股价继续由行情来源更新',type:'success'});
  }catch(e){$('ti-status').textContent=e.message;resetConfirm();preview();}
 }
 function setup(){
  const dialog=document.createElement('div');dialog.id='modal-tiger';dialog.className='overlay';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','ti-title');
  dialog.innerHTML=`<div class="modal ti-modal"><div class="modal-hd"><h2 id="ti-title">Tiger 截图导入</h2><button id="ti-close" class="modal-x" aria-label="关闭截图导入">×</button></div><p>上传 → 自动识别 → 预览校对 → 确认保存</p><p>免费识别 · 无需 AI 额度。图片在当前手机或电脑浏览器内处理，不上传识别服务器。首次使用需下载识别组件。当前适配 Tiger 电脑端完整持仓表；手机可从相册选取该截图，其他版式可手动填写。</p><div class="ti-tools"><label>目标账户 <select id="ti-account"></select></label><label>截图日期 <input id="ti-date" type="date"></label><label>上传截图 <input id="ti-file" type="file" accept="image/png,image/jpeg,image/webp"></label></div><button id="ti-manual" class="btn btn-outline btn-sm" type="button">手动填写持仓（无需识别）</button><div id="ti-drop" tabindex="0">也可以将截图拖到这里</div><p id="ti-status" role="status" aria-live="polite"></p><section id="ti-image-panel" hidden><button id="ti-image-toggle" type="button" class="btn btn-outline btn-sm">展开原图</button><img id="ti-image" alt="待校对的 Tiger 截图" hidden></section><section id="ti-review" hidden><p><label><input id="ti-show-all" type="checkbox"> 显示全部识别持仓（含未变化）</label></p><div class="ti-scroll"><table><thead><tr><th>导入</th><th>代码</th><th>数量</th><th>成本 USD</th><th>币种</th><th>持仓变更</th></tr></thead><tbody id="ti-rows"></tbody></table></div><button id="ti-add" class="btn btn-outline btn-sm">补充漏识别持仓</button><button id="ti-summary-toggle" type="button" class="btn btn-outline btn-sm">查看截图账户汇总（仅供参考）</button><div id="ti-summary-wrap" hidden><p>账户汇总仅供参考，不参与本次持仓变更确认，也不会覆盖现金或其他资产。</p><div id="ti-summary" class="ti-tools"></div></div><p id="ti-totals"></p><div id="ti-diagnostics" aria-live="polite"></div><button id="ti-rebase" class="btn btn-outline btn-sm">重新比较最新账本</button><div class="ti-confirm-actions"><p><label><input id="ti-confirm" type="checkbox"> 我已核对勾选的新增持仓及数量、成本、币种变更。未变化持仓和其他资产保留；不结算现金，股价由行情来源更新。</label></p><button id="ti-save" class="btn btn-primary" disabled>确认并更新主页持仓</button></div></section><button id="ti-backup" class="btn btn-outline btn-sm">下载最近一次导入前备份</button></div>`;
  document.body.append(dialog);$('ti-show-all').onchange=preview;$('ti-summary-toggle').onclick=()=>{$('ti-summary-wrap').hidden=!$('ti-summary-wrap').hidden;$('ti-summary-toggle').textContent=$('ti-summary-wrap').hidden?'查看截图账户汇总（仅供参考）':'收起截图账户汇总';};$('ti-image-toggle').onclick=()=>{$('ti-image').hidden=!$('ti-image').hidden;$('ti-image-toggle').textContent=$('ti-image').hidden?'展开原图':'收起原图';};$('ti-close').onclick=close;$('ti-file').onchange=e=>void upload(e.target.files[0]);$('ti-account').onchange=()=>{signature=TigerImport.signature(D,$('ti-account').value);resetConfirm();preview();};$('ti-date').onchange=()=>{resetConfirm();preview();};$('ti-manual').onclick=()=>{ocrAbort?.abort();requestId++;draft={rows:[{ticker:'',shares:null,currentPrice:null,costPrice:null,marketValue:null,currency:'UNKNOWN'}],summary:{currency:'UNKNOWN',totalAssets:null,securitiesValue:null,cash:null,dailyPnl:null,holdingPnl:null},warnings:[],date:$('ti-date').value};signature=TigerImport.signature(D,$('ti-account').value);render();$('ti-status').textContent='手动填写：只需填写代码、数量、USD 成本并选择 USD 币种。';};$('ti-confirm').onchange=preview;$('ti-save').onclick=commit;
  $('ti-add').onclick=()=>{draft.rows.push({ticker:'',shares:null,currentPrice:null,costPrice:null,marketValue:null,currency:'UNKNOWN'});render();};
  $('ti-rebase').onclick=()=>{signature=TigerImport.signature(D,$('ti-account').value);resetConfirm();preview();$('ti-status').textContent='已按最新账本重算差异，请再次核对。';};
  $('ti-backup').onclick=()=>{try{const key=localStorage.getItem(SK+'_tiger_last_backup'),raw=key&&localStorage.getItem(key);if(!raw)throw Error('暂无截图导入备份');download(JSON.parse(raw),'wealth-before-tiger-'+today()+'.json');}catch(e){$('ti-status').textContent=e.message;}};
  $('ti-drop').ondragover=e=>e.preventDefault();$('ti-drop').ondrop=e=>{e.preventDefault();void upload(e.dataTransfer.files[0]);};
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}if(e.key==='Tab'){const items=[...dialog.querySelectorAll('button,input,select,summary,[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  for(const region of ['au','us']){const button=text('button','Tiger 截图导入');button.className='btn btn-outline btn-sm';button.onclick=open;document.querySelector('#page-'+region+' .ph-actions').prepend(button);}
 }
 window.TigerImportUI={open,close};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
