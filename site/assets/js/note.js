/* One entry point for math, section navigation and reading controls. */
(function(){
  'use strict';
  const article=document.querySelector('main.article');
  if(!article)return;

  document.querySelectorAll('math').forEach(function(math){
    const display=math.getAttribute('display')==='block';
    const annotation=math.querySelector('annotation[encoding="application/x-tex"]');
    const tex=annotation?(annotation.textContent||'').trim():'';
    const parent=math.parentElement;
    const oldWrapper=parent && parent.matches('span.katex') &&
      Array.from(parent.childNodes).every(node=>node===math || (node.nodeType===3 && !node.textContent.trim()));
    const host=document.createElement('span');
    host.className='math-source'+(display?' math-display':'');
    if(math.id)host.id=math.id;
    else if(oldWrapper && parent.id)host.id=parent.id;
    let rendered=false;
    if(window.katex && tex){
      try{window.katex.render(tex,host,{displayMode:display,throwOnError:true,strict:false,trust:false});rendered=true;}
      catch(_){/* The original MathML remains the accessible fallback. */}
    }
    if(oldWrapper)parent.replaceWith(host);else math.replaceWith(host);
    if(!rendered){
      if(math.id && math.id===host.id)math.removeAttribute('id');
      if(display)host.classList.add('math-fallback');host.appendChild(math);
    }
  });

  const aside=document.querySelector('.notetoc');
  if(aside){
    const list=aside.querySelector('ul'),title=article.querySelector('h1');
    if(list && title && list.querySelector('a')){
      const toc=document.createElement('details');toc.className='mobile-toc';
      const summary=document.createElement('summary');summary.textContent='Contents';
      const clone=list.cloneNode(true);clone.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
      toc.append(summary,clone);title.insertAdjacentElement('afterend',toc);
      toc.addEventListener('click',event=>{if(event.target.closest('a'))toc.open=false;});
    }
    const pairs=Array.from(aside.querySelectorAll('a[href^="#"]')).map(link=>{
      let id;try{id=decodeURIComponent(link.hash.slice(1));}catch(_){return null;}
      const target=document.getElementById(id);return target?{link,target}:null;
    }).filter(Boolean);
    let pending=false;
    function updateOutline(){
      pending=false;if(!pairs.length)return;
      let current=pairs[0];pairs.forEach(pair=>{if(pair.target.getBoundingClientRect().top<=120)current=pair;});
      pairs.forEach(pair=>{if(pair===current)pair.link.setAttribute('aria-current','location');else pair.link.removeAttribute('aria-current');});
    }
    window.addEventListener('scroll',()=>{if(!pending){pending=true;requestAnimationFrame(updateOutline);}},{passive:true});
    updateOutline();
  }

  let queued=false;
  function fitMath(){
    queued=false;
    article.querySelectorAll('.math-display').forEach(host=>{
      if(host.scrollWidth>host.clientWidth+2){host.tabIndex=0;host.setAttribute('role','region');host.setAttribute('aria-label','Scrollable equation');}
      else{host.removeAttribute('tabindex');host.removeAttribute('role');host.removeAttribute('aria-label');}
    });
    article.querySelectorAll('.math-source:not(.math-display)').forEach(host=>{
      const math=host.querySelector('.katex')||host.querySelector('math');if(!math)return;
      const parent=host.closest('p,li,td,h1,h2,h3,h4,h5')||article;
      host.classList.toggle('math-inline-overflow',math.getBoundingClientRect().width>parent.clientWidth-2);
    });
  }
  function schedule(){if(!queued){queued=true;requestAnimationFrame(fitMath);}}
  schedule();if(document.fonts)document.fonts.ready.then(schedule);
  window.addEventListener('resize',schedule,{passive:true});document.addEventListener('toggle',schedule,true);
  window.addEventListener('load',schedule,{once:true});

  const button=document.querySelector('.back-to-top');
  if(button){
    let pending=false;
    function update(){button.hidden=window.scrollY<400;document.body.classList.toggle('back-to-top-active',!button.hidden);pending=false;}
    window.addEventListener('scroll',()=>{if(!pending){pending=true;requestAnimationFrame(update);}},{passive:true});
    window.addEventListener('pageshow',update);
    button.addEventListener('click',event=>{
      if(event.detail===0){
        const heading=article.querySelector('h1');
        if(heading){const old=heading.getAttribute('tabindex');heading.tabIndex=-1;heading.focus({preventScroll:true});
          heading.addEventListener('blur',()=>{if(old===null)heading.removeAttribute('tabindex');else heading.setAttribute('tabindex',old);},{once:true});}
      }
      const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({top:0,left:0,behavior:reduced?'instant':'smooth'});
    });
    update();
  }
})();
