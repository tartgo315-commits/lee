(function(){
 'use strict';
 const states=new WeakMap();let serial=0;
 const selectValue=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');
 const selectIndex=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'selectedIndex');
 function refresh(select){
  const state=states.get(select);if(!state||!select.isConnected)return;
  const {group}=state;group.hidden=select.hidden||select.style.display==='none';
  const options=Array.from(select.options),disabled=select.matches(':disabled');
  const signature=JSON.stringify(options.map(o=>[o.value,o.textContent,o.disabled,o.hidden,o.selected,o.parentElement?.disabled]));
  if(state.signature!==signature||state.disabled!==disabled){
   state.signature=signature;state.disabled=disabled;
   const focused=group.contains(document.activeElement)?document.activeElement.dataset.optionIndex:null;
   group.replaceChildren();
   options.forEach((option,index)=>{if(option.hidden)return;const b=document.createElement('button');b.type='button';b.className='flat-option';b.textContent=option.textContent;b.dataset.optionIndex=String(index);b.disabled=disabled||option.disabled||!!option.parentElement?.disabled;b.setAttribute('role',select.multiple?'checkbox':'radio');b.setAttribute('aria-checked',String(option.selected));b.tabIndex=option.selected||select.multiple?0:-1;
    b.addEventListener('click',()=>{if(select.multiple)option.selected=!option.selected;else select.selectedIndex=index;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));refresh(select);});group.append(b);
   });
   if(!group.querySelector('[tabindex="0"]')){const first=Array.from(group.children).find(b=>!b.disabled);if(first)first.tabIndex=0;}
   if(focused!==null)group.querySelector('[data-option-index="'+focused+'"]')?.focus({preventScroll:true});
  }
 }
 function enhance(select){
  if(states.has(select)){refresh(select);return;}
  const group=document.createElement('div');group.className='flat-options';group.setAttribute('role',select.multiple?'group':'radiogroup');
  const label=select.labels?.[0];if(label){if(!label.id)label.id='flat-label-'+(++serial);group.setAttribute('aria-labelledby',label.id);label.addEventListener('click',e=>{e.preventDefault();group.querySelector('[tabindex="0"]')?.focus();});}else group.setAttribute('aria-label',select.getAttribute('aria-label')||'选项');
  select.classList.add('flat-native-select');select.tabIndex=-1;select.setAttribute('aria-hidden','true');select.after(group);states.set(select,{group});
  select.focus=options=>group.querySelector('[tabindex="0"]')?.focus(options);
  for(const [key,descriptor] of [['value',selectValue],['selectedIndex',selectIndex]])Object.defineProperty(select,key,{configurable:true,get(){return descriptor.get.call(this);},set(value){descriptor.set.call(this,value);refresh(this);}});
  select.addEventListener('change',()=>refresh(select));
  group.addEventListener('keydown',event=>{if(select.multiple||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;const buttons=Array.from(group.children).filter(b=>!b.disabled),index=buttons.indexOf(document.activeElement);if(index<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(['ArrowRight','ArrowDown'].includes(event.key)?1:-1)+buttons.length)%buttons.length;buttons[next].click();group.querySelector('[aria-checked="true"]')?.focus();});
  refresh(select);
 }
 function flatten(details){
  if(!details.isConnected)return;const section=document.createElement('section');for(const a of details.attributes)if(a.name!=='open')section.setAttribute(a.name,a.value);section.dataset.flatSection='';
  for(const child of Array.from(details.childNodes)){if(child.nodeType===1&&child.tagName==='SUMMARY'){const heading=document.createElement('h3');for(const a of child.attributes)heading.setAttribute(a.name,a.value);heading.dataset.flatHeading='';heading.append(...child.childNodes);section.append(heading);}else section.append(child);}
  details.replaceWith(section);
 }
 function scan(root){if(root.nodeType!==1&&root!==document)return;if(root.matches?.('details')){flatten(root);return;}root.querySelectorAll('details').forEach(flatten);if(root.matches?.('select'))enhance(root);root.querySelectorAll('select').forEach(enhance);}
 function init(){scan(document);new MutationObserver(records=>{for(const record of records){if(record.type==='childList'){for(const n of record.addedNodes)scan(n);}const target=record.target.nodeType===1?record.target:record.target.parentElement;const select=target?.closest('select');if(select)refresh(select);if(target?.tagName==='FIELDSET')target.querySelectorAll('select').forEach(refresh);}}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','hidden','selected','label','value','style']});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
