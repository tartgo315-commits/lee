(function(root){
  'use strict';const META='wo_cloud_sync_v1',BACKUP='wo_cloud_sync_recovery_v1';let controller,last={kind:'checking',message:'正在检查线上账本…'};
  const el=id=>document.getElementById(id);
  function update(value=last){last=value;for(const id of ['cloud-sync-status','cloud-sync-settings-status'])if(el(id))el(id).textContent=value.message;
    if(el('cloud-sync-local'))el('cloud-sync-local').hidden=!['initialize','conflict'].includes(value.kind);
    if(el('cloud-sync-local'))el('cloud-sync-local').textContent=value.kind==='initialize'?'用本机账本开启同步':'保留本机这份并更新线上';
    if(el('cloud-sync-cloud'))el('cloud-sync-cloud').hidden=value.kind!=='conflict';
    if(el('cloud-sync-banner'))el('cloud-sync-banner').style.borderColor=value.kind==='conflict'?'#f59e0b':'var(--border)';
  }
  function readMeta(){try{return JSON.parse(localStorage.getItem(META)||'null');}catch{return null;}}
  async function choose(which){if(which==='local'&&last.kind==='conflict'&&!confirm('确定保留本机这份账本并替换线上当前版本？两份都会先留在本机恢复备份。'))return;await controller.resolve(which);}
  function recovery(which='local'){const raw=localStorage.getItem(BACKUP),data=raw?JSON.parse(raw)[which]:null;if(!data){showToast({message:'暂无这份同步恢复备份',type:'info'});return;}const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));link.download='wealth-sync-recovery-'+which+'-'+today()+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
  async function start(){
    if(!/^https?:$/.test(location.protocol)){update({kind:'offline',message:'本地文件模式：请打开线上网站使用跨设备同步。'});return;}
    controller=WealthCloudSync.create({get:()=>D,readMeta,writeMeta:value=>localStorage.setItem(META,JSON.stringify(value)),fetch:(url,options)=>{const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),15000);return fetch(url,{...options,signal:abort.signal}).finally(()=>clearTimeout(timeout));},onState:update,
      isEditing:()=>!!document.querySelector('[id^="modal"].open'),
      backup:value=>{try{localStorage.setItem(BACKUP,JSON.stringify(value));}catch{throw Error('本机恢复备份空间不足，已暂停读取或覆盖，请先导出JSON备份。');}},
      replace:async data=>{if(!data||!Array.isArray(data.products))throw Error('线上账本格式无效');const next=WealthMath.migrate(Object.assign(blank(),data));localStorage.setItem(SK,JSON.stringify(next));D=next;calculationStorageReadFailed=false;refreshAfterMovement();maybeShowHttpDataTip();setTimeout(()=>{void pollFinnhubQuotesOnce();void autoRefreshQuotesSilent();},0);},
    });
    if(calculationStorageReadFailed){update({kind:'offline',message:'本机账本读取失败，请先导出或恢复本机数据；线上未被覆盖。'});return;}
    await controller.start();setInterval(()=>{if(document.visibilityState==='visible')void controller.tick();},30000);
    window.addEventListener('focus',()=>void controller.tick());window.addEventListener('online',()=>void controller.tick());document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void controller.tick();});
    window.addEventListener('storage',event=>{if(event.key===SK){try{if(event.newValue&&WealthCloudSync.signature(JSON.parse(event.newValue))===WealthCloudSync.signature(D))return;}catch{}controller.externalChange();}});
  }
  root.CloudSyncUI={changed:()=>controller?.notify(),choose,recovery,refresh:()=>controller?.tick(),isConnected:()=>!!readMeta()?.revision,update};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void start(),{once:true});else void start();
})(typeof globalThis!=='undefined'?globalThis:this);
