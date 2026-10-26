(function(root){
 'use strict';let previousFocus=null;
 const el=id=>document.getElementById(id),mobile=()=>matchMedia('(max-width:1000px)').matches;
 const actions=[
  ['刷新全部行情',()=>el('refresh-all-btn').click(),'行情与分析'],
  ['AI 今日解读',()=>el('topbar-ai').click()],['AI 账本问答',()=>el('assistant-launcher').click()],
  ['记录今日快照',()=>el('snap-btn').click(),'账本与备份'],['导出账本备份',()=>{document.querySelector('.topbar-right [title="导出 JSON"]').click();showToast({message:'已发起导出，请在浏览器下载或文件中确认保存',type:'info'});}],
  ['导入账本 / 同步设置',()=>showPage('settings')],['资金工作台',()=>LedgerUI.showWorkspace('records')],['批量导入美股',()=>openBatchModal()],
  ['切换深浅色主题',()=>toggleNight(),'显示与安全'],['锁屏',()=>showPinOverlay()],
 ];
 function close(restore=true){const sheet=el('mobile-action-sheet');sheet.classList.remove('open');el('mobile-more-btn').setAttribute('aria-expanded','false');document.body.classList.remove('mobile-actions-open');if(restore)previousFocus?.focus();}
 function open(){closeMobileSidebar();previousFocus=document.activeElement;el('mobile-action-sheet').classList.add('open');el('mobile-more-btn').setAttribute('aria-expanded','true');document.body.classList.add('mobile-actions-open');el('mobile-actions-close').focus();}
 function dimensions(){const vv=window.visualViewport,style=document.documentElement.style;style.setProperty('--mobile-visual-height',(vv?.height||innerHeight)+'px');style.setProperty('--mobile-visual-top',(vv?.offsetTop||0)+'px');const bar=document.querySelector('.topbar');if(bar)style.setProperty('--mobile-topbar-height',bar.getBoundingClientRect().height+'px');if(!mobile())close(false);}
 function init(){
  const quick=document.createElement('nav');quick.id='mobile-quick-actions';quick.setAttribute('aria-label','常用账本操作');for(const [label,mode] of [['买卖股票','trade'],['转账','transfer'],['现金变动','cash'],['到期处理','maturity']]){const b=document.createElement('button');b.type='button';b.className='btn btn-ghost';b.textContent=label;b.addEventListener('click',()=>mode==='cash'?openCashMovement():LedgerUI.open(mode));quick.append(b);}el('cloud-sync-banner').after(quick);
  const button=document.createElement('button');button.type='button';button.id='mobile-more-btn';button.className='btn btn-ghost btn-sm';button.textContent='更多';button.setAttribute('aria-label','更多操作');button.setAttribute('aria-controls','mobile-action-sheet');button.setAttribute('aria-expanded','false');button.addEventListener('click',open);document.querySelector('.topbar-right').append(button);
  const sheet=document.createElement('div');sheet.id='mobile-action-sheet';sheet.className='overlay';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-labelledby','mobile-actions-title');
  const panel=document.createElement('div');panel.className='modal mobile-actions-panel';const header=document.createElement('div');header.className='movement-header';const title=document.createElement('h2');title.id='mobile-actions-title';title.textContent='更多操作';const cancel=document.createElement('button');cancel.type='button';cancel.id='mobile-actions-close';cancel.className='btn btn-ghost';cancel.textContent='关闭';cancel.addEventListener('click',()=>close());header.append(title,cancel);panel.append(header);
  for(const [label,run,group] of actions){if(group){const h=document.createElement('h3');h.textContent=group;panel.append(h);}const b=document.createElement('button');b.type='button';b.className='btn btn-ghost mobile-action';b.textContent=label;b.addEventListener('click',()=>{close(false);run();});panel.append(b);}
  sheet.append(panel);sheet.addEventListener('click',event=>{if(event.target===sheet)close();});document.body.append(sheet);
  for(const table of document.querySelectorAll('.hist-table')){const wrap=table.parentElement;wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','快照列表，可左右滑动查看全部金额与操作');const hint=document.createElement('p');hint.className='mobile-table-hint';hint.textContent='左右滑动表格，可查看全部金额与操作。';wrap.before(hint);}
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&sheet.classList.contains('open')){event.preventDefault();event.stopImmediatePropagation();close();}},true);
  dimensions();if(typeof ResizeObserver!=='undefined')new ResizeObserver(dimensions).observe(document.querySelector('.topbar'));window.addEventListener('resize',dimensions);window.visualViewport?.addEventListener('resize',dimensions);window.visualViewport?.addEventListener('scroll',dimensions);
 }
 root.MobileUI={open,close};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof globalThis!=='undefined'?globalThis:this);
