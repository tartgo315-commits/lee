/* One private site ledger, optimistic revision checks, no silent conflict merging. */
(function(root){
  'use strict';
  function signature(data){const copy=JSON.parse(JSON.stringify(data));delete copy.fx;delete copy.backupStatus;for(const p of copy.products||[]){for(const key of ['currentPrice','fundPrice','goldPrice','goldUpdated','lastValidPrice','quoteReference'])delete p[key];if(['stock_us','fund_cn','gold'].includes(p.type))delete p.updatedAt;}return JSON.stringify(copy);}
  const empty=d=>!(d.products?.length||d.navHistory?.length||d.movementLog?.length||d.cashFlows?.length||Number(d.goal?.amount)>0||d.performanceTracking||Object.keys(d.usAccountMeta||{}).length);
  function create(a){
    let meta=a.readMeta()||null,busy=false,paused=false,state='checking',timer,remote=null,started=false;
    const status=(kind,message)=>{state=kind;a.onState({kind,message,revision:meta?.revision||0});};
    const mark=(revision,data)=>{meta={revision,signature:signature(data)};a.writeMeta(meta);};
    async function request(method,body){const response=await a.fetch('/api/ledger-sync'+(method==='GET'&&meta?'?since='+meta.revision:''),{method,credentials:'same-origin',cache:'no-store',headers:{'X-Wealth-Sync':'1',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});let value;try{value=await response.json();}catch{throw Error('线上同步接口暂不可用，本机账本已保留');}if(!response.ok){const e=Error(value.error||'线上同步失败');e.status=response.status;throw e;}return value;}
    async function fullRemote(){const saved=meta;meta=null;try{return await request('GET');}finally{meta=saved;}}
    function conflict(value){remote=value;paused=true;status('conflict','两端账本不同，已暂停自动覆盖，请在设置中选择保留哪一份。');}
    async function adopt(value){if(a.isEditing()){status('waiting','线上有更新，关闭当前编辑窗口后自动读取。');return;}a.backup({local:a.get(),cloud:value.ledger,at:new Date().toISOString()});await a.replace(value.ledger);mark(value.revision,a.get());remote=null;status('synced','已同步 · 版本 '+value.revision);}
    async function pull(){if(busy||paused)return;busy=true;try{const value=await request('GET');if(value.unchanged){status(signature(a.get())===meta?.signature?'synced':'pending',signature(a.get())===meta?.signature?'已同步 · 版本 '+value.revision:'本机修改待上传');return;}
      if(!value.revision){if(meta?.revision)conflict(value);else status('initialize',empty(a.get())?'线上还没有账本，请先在有数据的电脑开启同步。':'线上还没有账本，点击“用本机账本开启同步”。');return;}
      const local=a.get(),sig=signature(local);if(sig===signature(value.ledger)){mark(value.revision,local);status('synced','已同步 · 版本 '+value.revision);}
      else if(empty(local)&&!meta||meta&&sig===meta.signature)await adopt(value);else conflict(value);
    }catch(error){status(error.status===401?'login':'offline',error.message);}finally{busy=false;}}
    async function flush(){if(!started||busy||paused||!meta){if(started&&!paused&&!meta)void pull();return;}if(signature(a.get())===meta.signature)return;busy=true;try{const snapshot=JSON.parse(JSON.stringify(a.get())),value=await request('PUT',{baseRevision:meta.revision,ledger:snapshot});mark(value.revision,snapshot);status('synced','已同步 · 版本 '+value.revision);if(signature(a.get())!==meta.signature)notify();}
    catch(error){if(error.status===409){try{conflict(await fullRemote());}catch(e){status('offline',e.message);}}else status(error.status===401?'login':'offline',error.message);}finally{busy=false;}}
    function notify(){if(!started)return;if(paused)return;clearTimeout(timer);status(meta?'pending':state,meta?'本机已保存，等待上传…':'等待线上账本检查');timer=setTimeout(()=>void flush(),1000);}
    async function resolve(choice){if(busy)return;busy=true;try{const latest=await fullRemote();if(choice==='cloud'){if(!latest.ledger)throw Error('线上没有可读取的账本');paused=false;await adopt(latest);return;}
      if(empty(a.get())&&!latest.revision)throw Error('本机没有账本，请先在有数据的电脑开启同步');
      a.backup({local:a.get(),cloud:latest.ledger,at:new Date().toISOString()});const snapshot=JSON.parse(JSON.stringify(a.get())),value=await request('PUT',{baseRevision:latest.revision,ledger:snapshot});mark(value.revision,snapshot);paused=false;remote=null;status('synced','已同步 · 版本 '+value.revision);
    }catch(error){if(error.status===409)conflict(remote);else status(error.status===401?'login':'offline',error.message);}finally{busy=false;}}
    async function tick(){if(busy||paused)return;if(meta&&signature(a.get())!==meta.signature)await flush();else await pull();}
    return{start:async()=>{started=true;await pull();},notify,pull,tick,resolve,externalChange:()=>{paused=true;status('conflict','另一个标签页修改了本机账本，请先刷新本页再继续。');},getState:()=>({state,meta,paused})};
  }
  root.WealthCloudSync={create,signature,empty};
})(typeof globalThis!=='undefined'?globalThis:this);
