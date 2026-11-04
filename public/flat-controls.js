(function(){
 'use strict';
 function flatten(details){
  if(!details.isConnected||details.closest('#modal'))return;const section=document.createElement('section');for(const a of details.attributes)if(a.name!=='open')section.setAttribute(a.name,a.value);section.dataset.flatSection='';
  for(const child of Array.from(details.childNodes)){if(child.nodeType===1&&child.tagName==='SUMMARY'){const heading=document.createElement('h3');for(const a of child.attributes)heading.setAttribute(a.name,a.value);heading.dataset.flatHeading='';heading.append(...child.childNodes);section.append(heading);}else section.append(child);}
  details.replaceWith(section);
 }
 function scan(root){if(root.nodeType!==1&&root!==document)return;if(root.matches?.('details')){flatten(root);return;}root.querySelectorAll('details').forEach(flatten);}
 function init(){scan(document);new MutationObserver(records=>{for(const record of records)for(const n of record.addedNodes)scan(n);}).observe(document.body,{subtree:true,childList:true});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
