/* Reuse the existing section-only table of contents on small screens. */
(function(){
  'use strict';
  const aside=document.querySelector('.notetoc'),article=document.querySelector('main.article');
  if(!aside || !article)return;
  const list=aside.querySelector('ul'),title=article.querySelector('h1');
  if(!list || !title || !list.querySelector('a'))return;
  const toc=document.createElement('details');toc.className='mobile-toc';
  const summary=document.createElement('summary');summary.textContent='Contents';
  const clone=list.cloneNode(true);clone.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
  toc.append(summary,clone);title.insertAdjacentElement('afterend',toc);
  toc.addEventListener('click',event=>{if(event.target.closest('a'))toc.open=false;});
  const pairs=Array.from(aside.querySelectorAll('a[href^="#"]')).map(link=>{
    let id;try{id=decodeURIComponent(link.hash.slice(1));}catch(_){return null;}
    const target=document.getElementById(id);return target?{link,target}:null;
  }).filter(Boolean);
  let queued=false;
  function update(){
    queued=false;if(!pairs.length)return;
    let current=pairs[0];pairs.forEach(pair=>{if(pair.target.getBoundingClientRect().top<=120)current=pair;});
    pairs.forEach(pair=>{if(pair===current)pair.link.setAttribute('aria-current','location');else pair.link.removeAttribute('aria-current');});
  }
  window.addEventListener('scroll',()=>{if(!queued){queued=true;requestAnimationFrame(update);}},{passive:true});update();
})();
