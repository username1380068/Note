/* One prerendered clip contains the completed effect and its transparency mask. */
(function () {
  'use strict';
  const button = document.getElementById('tiger-egg');
  if (!button) return;
  const source = document.currentScript.src;
  const media = name => new URL('../media/' + name, source).href;
  const canvas = document.createElement('canvas');
  canvas.id = 'tiger-fx'; canvas.setAttribute('aria-hidden','true');
  canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9998';
  document.body.appendChild(canvas);
  const ctx=canvas.getContext('2d');
  if (!ctx) return;
  const video=document.createElement('video');
  video.id='tiger-effect-video'; video.playsInline=true; video.preload='auto';
  video.volume=.7; video.tabIndex=-1; video.setAttribute('aria-hidden','true');
  video.style.cssText='position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(video);
  const packed=document.createElement('canvas'), image=document.createElement('canvas');
  const packedCtx=packed.getContext('2d',{willReadFrequently:true});
  const imageCtx=image.getContext('2d');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let generation=0,active=false,starting=false,callback=0,raf=0,timer=0,lastTime=-1;
  let asset='',ready=false,hasImage=false;
  function resize() {
    const ratio=Math.min(1.5,devicePixelRatio||1,Math.sqrt(1500000/(innerWidth*innerHeight)));
    canvas.width=Math.round(innerWidth*ratio);canvas.height=Math.round(innerHeight*ratio);
    if(active && hasImage)draw();
  }
  function draw() {
    const w=canvas.width,h=canvas.height,scale=Math.max(w/image.width,h/image.height);
    ctx.clearRect(0,0,w,h);
    ctx.drawImage(image,(w-image.width*scale)/2,(h-image.height*scale)/2,image.width*scale,image.height*scale);
  }
  function render(time) {
    if(video.readyState<2)return;
    if(time===lastTime && hasImage){draw();return;}
    lastTime=time;
    // Read one decoded frame once. Both the finished picture and its matte share it.
    packedCtx.drawImage(video,0,0,packed.width,packed.height);
    const pixels=packedCtx.getImageData(0,0,packed.width,packed.height).data;
    const result=imageCtx.createImageData(image.width,image.height),out=result.data;
    const w=image.width,h=image.height,stride=packed.width*4;
    for(let y=0;y<h;y++) {
      const row=y*stride,dst=y*w*4;
      for(let x=0;x<w;x++) {
        const i=row+x*4,j=dst+x*4,mask=i+w*4;
        const a=Math.round((pixels[mask]+pixels[mask+1]+pixels[mask+2])/3);
        out[j]=pixels[i];out[j+1]=pixels[i+1];out[j+2]=pixels[i+2];
        out[j+3]=a<=4?0:a>=250?255:a;
      }
    }
    imageCtx.putImageData(result,0,0);hasImage=true;draw();
  }
  function stop() {
    generation++;active=false;video.pause();
    if(callback && video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(callback);
    callback=0;cancelAnimationFrame(raf);raf=0;clearTimeout(timer);
    ctx.clearRect(0,0,canvas.width,canvas.height);button.removeAttribute('aria-busy');
  }
  function schedule(id) {
    if(!active || id!==generation)return;
    if(video.requestVideoFrameCallback) {
      callback=video.requestVideoFrameCallback((_,metadata)=>{
        callback=0;if(!active || id!==generation)return;
        render(metadata.mediaTime);schedule(id);
      });
    } else {
      raf=requestAnimationFrame(()=>{
        raf=0;if(!active || id!==generation)return;
        if(video.currentTime!==lastTime)render(video.currentTime);
        schedule(id);
      });
    }
  }
  function waitFor(event,action) {
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>finish(new Error('Animation load timeout')),20000);
      function finish(error) {
        clearTimeout(timeout);video.removeEventListener(event,done);video.removeEventListener('error',fail);
        error?reject(error):resolve();
      }
      function done(){finish();}function fail(){finish(new Error('Animation failed to load'));}
      video.addEventListener(event,done,{once:true});video.addEventListener('error',fail,{once:true});
      try{action();}catch(error){finish(error);}
    });
  }
  async function prepare(name) {
    if(asset!==name || !ready || video.readyState<2) {
      ready=false;asset=name;
      await waitFor('loadeddata',()=>{video.src=media(name);video.load();});
      ready=true;
      packed.width=video.videoWidth;packed.height=video.videoHeight;
      image.width=video.videoWidth/2;image.height=video.videoHeight;
    }
    if(video.currentTime>.001 || video.seeking)await waitFor('seeked',()=>{video.currentTime=0;});
    lastTime=-1;hasImage=false;
  }
  async function show() {
    // Coalesce taps during loading/seeking; never overlap restarts on one decoder.
    if(starting)return;
    stop();starting=true;const id=generation;
    button.setAttribute('aria-busy','true');
    try {
      const name=innerWidth/innerHeight<.85?'tiger-effect-mobile-v1.mp4':'tiger-effect-desktop-v1.mp4';
      await prepare(name);
      if(id!==generation || document.hidden)return;
      resize();button.removeAttribute('aria-busy');
      if(reduced.matches) {
        render(0);timer=setTimeout(()=>{if(id===generation)stop();},1200);return;
      }
      video.muted=false;
      try{await video.play();}catch(error){
        if(error.name!=='NotAllowedError')throw error;
        video.muted=true;await video.play();
      }
      if(id!==generation || document.hidden){video.pause();return;}
      active=true;render(video.currentTime);schedule(id);
    } catch(error) {
      if(id===generation){ready=false;stop();console.warn('Tiger effect unavailable:',error.message);}
    } finally{starting=false;}
  }
  const touchStyle=document.createElement('style');
  touchStyle.textContent='@media(max-width:640px){#tiger-egg{min-width:44px;min-height:44px;margin-block:-10px}}';
  document.head.appendChild(touchStyle);button.style.touchAction='manipulation';
  button.addEventListener('click',event=>{event.preventDefault();show();});
  video.addEventListener('ended',stop);
  window.addEventListener('keydown',event=>{if(event.key==='Escape')stop();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('pagehide',stop);window.addEventListener('resize',resize);resize();
})();
