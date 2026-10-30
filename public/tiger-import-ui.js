(function(){
 'use strict';let draft=null,signature='',imageUrl='',requestId=0,opener;
 const $=id=>document.getElementById(id),text=(tag,value,parent)=>{const e=document.createElement(tag);e.textContent=value;parent?.append(e);return e;};
 function download(value,name){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function resetConfirm(){$('ti-confirm').checked=false;}
 function open(){
  opener=document.activeElement;draft=null;signature=JSON.stringify(D);requestId++;$('ti-rows').replaceChildren();$('ti-review').hidden=true;$('ti-file').value='';$('ti-status').textContent='上传后只生成预览，不会立即修改资产。';$('ti-image').removeAttribute('src');$('ti-image').parentElement.hidden=true;if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl='';
  const select=$('ti-account');select.replaceChildren();const accounts=[...new Set(['Tiger',...D.products.filter(p=>p.region==='us'&&/tiger|老虎/i.test(p.account||'')).map(p=>p.account)])];for(const a of accounts){const option=text('option',a,select);option.value=a;}
  $('ti-date').value=today();$('modal-tiger').classList.add('open');$('ti-file').focus();
 }
 function close(){requestId++;$('modal-tiger').classList.remove('open');draft=null;if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl='';$('ti-image').removeAttribute('src');opener?.focus();}
 function input(parent,label,value,type,change){const e=document.createElement('input');e.type=type;e.setAttribute('aria-label',label);if(type==='checkbox')e.checked=value;else e.value=value??'';if(type==='number')e.step='any';e.addEventListener(type==='checkbox'?'change':'input',()=>{change(type==='checkbox'?e.checked:e.value);resetConfirm();preview();});parent.append(e);return e;}
 function render(){
  $('ti-rows').replaceChildren();draft.rows.forEach((r,i)=>{const tr=document.createElement('tr');$('ti-rows').append(tr);const cell=()=>{const td=document.createElement('td');tr.append(td);return td;};input(cell(),'选择第 '+(i+1)+' 行',r.selected!==false,'checkbox',v=>r.selected=v);
   for(const [key,label,type]of [['ticker','代码','text'],['shares','数量','number'],['currentPrice','USD 股价','number'],['costPrice','USD 成本','number'],['marketValue','截图 USD 市值','number']])input(cell(),label+' 第 '+(i+1)+' 行',r[key],type,v=>r[key]=v);
   const cur=document.createElement('select');cur.setAttribute('aria-label','币种 第 '+(i+1)+' 行');for(const c of ['UNKNOWN','USD','AUD']){const o=text('option',c,cur);o.value=c;}cur.value=r.currency;cur.onchange=()=>{r.currency=cur.value;resetConfirm();preview();};cell().append(cur);cell().className='ti-diff';
  });
  $('ti-summary').replaceChildren();
  const currency=document.createElement('select');currency.setAttribute('aria-label','账户汇总币种');for(const c of ['UNKNOWN','AUD','USD']){const o=text('option',c,currency);o.value=c;}currency.value=draft.summary.currency;currency.onchange=()=>{draft.summary.currency=currency.value;resetConfirm();preview();};const label=text('label','账户汇总币种 ', $('ti-summary'));label.append(currency);
  for(const [key,label]of [['totalAssets','总资产'],['securitiesValue','证券总值'],['cash','预估现金'],['dailyPnl','今日盈亏'],['holdingPnl','持仓盈亏']]){const l=text('label',label+'（AUD）', $('ti-summary'));input(l,label+' AUD',draft.summary[key],'number',v=>draft.summary[key]=v);}
  $('ti-review').hidden=false;resetConfirm();preview();
 }
 function preview(){
  if(!draft)return;draft.date=$('ti-date').value;const p=TigerImport.plan(D,draft,$('ti-account').value);if(!draft.date||draft.date>today())p.errors.push('截图日期须有效且不晚于今天');
  $('ti-diagnostics').replaceChildren();for(const e of p.errors)text('p','错误：'+e,$('ti-diagnostics'));for(const w of [...(draft.warnings||[]),...p.warnings])text('p','请核对：'+w,$('ti-diagnostics'));
  const fixed=n=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:2}):'—';
  $('ti-totals').textContent='本次选中市值 USD '+fixed(p.usd)+' ≈ AUD '+fixed(p.aud)+'；1 USD = '+(Number.isFinite(p.rate)?p.rate.toFixed(6):'—')+' AUD（主页汇率 USD/CNY ÷ AUD/CNY）。账户 AUD 汇总仅作对账，不重复计入资产。';
  for(const [i,r]of draft.rows.entries()){const target=$('ti-rows').children[i]?.querySelector('.ti-diff');if(!target)continue;const old=D.products.find(x=>x.region==='us'&&x.type==='stock_us'&&x.account===$('ti-account').value&&String(x.ticker||'').toUpperCase()===String(r.ticker||'').toUpperCase());target.textContent=old?'数量 '+old.shares+' → '+r.shares+'；USD 成本 '+old.costPrice+' → '+r.costPrice+'；USD 股价 '+old.currentPrice+' → '+r.currentPrice:'新增已有持仓';}
  $('ti-save').disabled=p.errors.length>0||!$('ti-confirm').checked;
 }
 async function upload(file){
  const id=++requestId;draft=null;$('ti-review').hidden=true;$('ti-status').textContent='';
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>6*1024*1024){$('ti-status').textContent='请选择不超过 6 MB 的 PNG、JPEG 或 WebP 截图';return;}
  if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=URL.createObjectURL(file);$('ti-image').src=imageUrl;$('ti-image').parentElement.hidden=false;$('ti-status').textContent='正在识别持仓表与账户汇总…';
  try{const image=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});if(id!==requestId)return;
   const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),75000);let response;try{response=await fetch('/api/tiger-import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image}),signal:abort.signal});}finally{clearTimeout(timer);}
   const value=await response.json();if(id!==requestId)return;if(!response.ok)throw Error(value.error||'识别失败');draft={...value.result,date:$('ti-date').value};signature=JSON.stringify(D);render();$('ti-status').textContent='识别完成。请对照原图逐项核对；你可以修改数字、币种或取消某一行。';
  }catch(e){if(id===requestId)$('ti-status').textContent=e.message||'识别失败，请重试';}
 }
 function commit(){
  try{if(!draft||!$('ti-confirm').checked)throw Error('请先核对并勾选确认');if(JSON.stringify(D)!==signature)throw Error('账本或行情已变化，请点击“重新比较最新账本”后再次校对确认');
   const next=TigerImport.apply(D,draft,$('ti-account').value,{id:crypto.randomUUID(),timestamp:new Date().toISOString()});
   // Backup failure aborts the operation; the main ledger is written exactly once.
   const key=SK+'_tiger_backup_'+Date.now();localStorage.setItem(key,JSON.stringify(D));localStorage.setItem(SK+'_tiger_last_backup',key);persistMovementLedger(next);close();refreshAfterMovement();showToast({message:'已更新选中持仓并保存备份；现金未改动，账户 AUD 汇总已留作对账',type:'success'});
  }catch(e){$('ti-status').textContent=e.message;resetConfirm();preview();}
 }
 function setup(){
  const dialog=document.createElement('div');dialog.id='modal-tiger';dialog.className='overlay';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','ti-title');
  dialog.innerHTML=`<div class="modal ti-modal"><div class="modal-hd"><h2 id="ti-title">Tiger 截图导入</h2><button id="ti-close" class="modal-x" aria-label="关闭截图导入">×</button></div><p>上传 → 自动识别 → 预览校对 → 确认保存</p><p>截图将发送至本站 OpenAI 识别服务。请遮盖姓名和账号，保留持仓表、币种与需要的账户汇总。图片不写入账本；只保存校对后的数字。</p><div class="ti-tools"><label>目标账户 <select id="ti-account"></select></label><label>截图日期 <input id="ti-date" type="date"></label><label>上传截图 <input id="ti-file" type="file" accept="image/png,image/jpeg,image/webp"></label></div><div id="ti-drop" tabindex="0">也可以将截图拖到这里</div><p id="ti-status" role="status" aria-live="polite"></p><details hidden><summary>查看原图</summary><img id="ti-image" alt="待校对的 Tiger 截图"></details><section id="ti-review" hidden><div class="ti-scroll"><table><thead><tr><th>导入</th><th>代码</th><th>数量</th><th>股价 USD</th><th>成本 USD</th><th>截图市值 USD</th><th>币种</th><th>原持仓 → 更新后</th></tr></thead><tbody id="ti-rows"></tbody></table></div><button id="ti-add" class="btn btn-outline btn-sm">补充漏识别持仓</button><h3>账户汇总（只作对账）</h3><div id="ti-summary" class="ti-tools"></div><p id="ti-totals"></p><div id="ti-diagnostics" aria-live="polite"></div><button id="ti-rebase" class="btn btn-outline btn-sm">重新比较最新账本</button><p><label><input id="ti-confirm" type="checkbox"> 我已逐项核对代码、数量、USD 价格与成本、AUD 汇总及差异。只更新勾选持仓，保留未出现的持仓和其他资产；现金不结算，数量或成本校正需核对收益起点。</label></p><button id="ti-save" class="btn btn-primary" disabled>确认并更新主页持仓</button></section><button id="ti-backup" class="btn btn-outline btn-sm">下载最近一次导入前备份</button></div>`;
  document.body.append(dialog);$('ti-close').onclick=close;$('ti-file').onchange=e=>void upload(e.target.files[0]);$('ti-account').onchange=()=>{resetConfirm();preview();};$('ti-date').onchange=()=>{resetConfirm();preview();};$('ti-confirm').onchange=preview;$('ti-save').onclick=commit;
  $('ti-add').onclick=()=>{draft.rows.push({ticker:'',shares:null,currentPrice:null,costPrice:null,marketValue:null,currency:'UNKNOWN'});render();};
  $('ti-rebase').onclick=()=>{signature=JSON.stringify(D);resetConfirm();preview();$('ti-status').textContent='已按最新账本重算差异，请再次核对。';};
  $('ti-backup').onclick=()=>{try{const key=localStorage.getItem(SK+'_tiger_last_backup'),raw=key&&localStorage.getItem(key);if(!raw)throw Error('暂无截图导入备份');download(JSON.parse(raw),'wealth-before-tiger-'+today()+'.json');}catch(e){$('ti-status').textContent=e.message;}};
  $('ti-drop').ondragover=e=>e.preventDefault();$('ti-drop').ondrop=e=>{e.preventDefault();void upload(e.dataTransfer.files[0]);};
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}if(e.key==='Tab'){const items=[...dialog.querySelectorAll('button,input,select,summary,[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  for(const region of ['au','us']){const button=text('button','Tiger 截图导入');button.className='btn btn-outline btn-sm';button.onclick=open;document.querySelector('#page-'+region+' .ph-actions').prepend(button);}
 }
 window.TigerImportUI={open,close};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
