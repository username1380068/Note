/* Keep original MathML as fallback; add a real scroll container for display equations. */
(function(){
  'use strict';
  const nodes=document.querySelectorAll('math');
  nodes.forEach(function(math){
    const display=math.getAttribute('display')==='block';
    const annotation=math.querySelector('annotation[encoding="application/x-tex"]');
    const tex=annotation?(annotation.textContent||'').trim():'';
    const host=document.createElement('span');host.className='math-source'+(display?' math-display':'');
    if(window.katex && tex){
      try{
        window.katex.render(tex,host,{displayMode:display,throwOnError:true,strict:false,trust:false});
        math.replaceWith(host);return;
      }catch(_){}
    }
    if(display)host.classList.add('math-fallback');
    math.replaceWith(host);host.appendChild(math);
  });
  let queued=false;
  function fitInline(){
    queued=false;
    document.querySelectorAll('.article .math-display').forEach(function(host){
      if(host.scrollWidth>host.clientWidth+2){host.tabIndex=0;host.setAttribute('role','region');host.setAttribute('aria-label','Scrollable equation');}
      else{host.removeAttribute('tabindex');host.removeAttribute('role');host.removeAttribute('aria-label');}
    });
    document.querySelectorAll('.article .math-source:not(.math-display)').forEach(function(host){
      const math=host.querySelector('.katex')||host.querySelector('math');if(!math)return;
      const parent=host.closest('p,li,td,h1,h2,h3,h4,h5')||host.closest('main.article');
      host.classList.toggle('math-inline-overflow',math.getBoundingClientRect().width>parent.clientWidth-2);
    });
  }
  function schedule(){if(!queued){queued=true;requestAnimationFrame(fitInline);}}
  schedule();if(document.fonts)document.fonts.ready.then(schedule);
  window.addEventListener('resize',schedule,{passive:true});
})();


