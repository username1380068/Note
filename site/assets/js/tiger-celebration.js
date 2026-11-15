/* A single completed movie supplies picture, transparency and sound. */
(function () {
  'use strict';
  const button=document.getElementById('tiger-egg');
  if(!button)return;
  const media=name=>new URL('../media/'+name,document.currentScript.src).href;
  const assets={desktop:media('tiger-effect-desktop-v2.mp4'),mobile:media('tiger-effect-mobile-v2.mp4')};
  let canvas=document.createElement('canvas');
  canvas.id='tiger-fx';canvas.setAttribute('aria-hidden','true');
  canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9998';
  document.body.appendChild(canvas);
  const video=document.createElement('video');
  video.id='tiger-effect-video';video.playsInline=true;video.setAttribute('playsinline','');
  video.setAttribute('webkit-playsinline','');video.preload='auto';video.volume=.7;video.tabIndex=-1;
  video.setAttribute('aria-hidden','true');
  // Keep a nonzero on-screen presentation; opacity:0 can suppress video presentation on iOS.
  video.style.cssText='position:fixed;bottom:0;right:0;width:2px;height:2px;opacity:.001;pointer-events:none;z-index:9997';
  document.body.appendChild(video);
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let generation=0,active=false,starting=false,raf=0,timer=0,lastTime=-1,lastPaint=0;
  let asset='',ready=false,hasImage=false,frames=0;
  const downloads=new Map();
  function gpuRenderer() {
    const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,powerPreference:'low-power'});
    if(!gl)return null;
    function shader(type,text){
      const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('Effect shader compilation failed');return s;
    }
    const program=gl.createProgram();
    gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}'));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 uv;uniform sampler2D movie;uniform vec4 crop;uniform vec2 pixel;void main(){vec2 q=clamp(uv*crop.xy+crop.zw,pixel,vec2(1.)-pixel);vec3 rgb=texture2D(movie,vec2(q.x*.5,q.y)).rgb;vec3 matte=texture2D(movie,vec2(.5+q.x*.5,q.y)).rgb;float a=dot(matte,vec3(.333333));a=a<.016?0.:(a>.98?1.:a);gl_FragColor=vec4(rgb*a,a);}'));
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Effect shader link failed');
    gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.uniform1i(gl.getUniformLocation(program,'movie'),0);
    const crop=gl.getUniformLocation(program,'crop'),pixel=gl.getUniformLocation(program,'pixel');
    gl.clearColor(0,0,0,0);canvas.dataset.renderer='webgl';
    return {
      resize(){gl.viewport(0,0,canvas.width,canvas.height);},
      clear(){gl.clear(gl.COLOR_BUFFER_BIT);},
      paint(){
        const picture=(video.videoWidth/2)/video.videoHeight,view=canvas.width/canvas.height;
        const x=Math.min(1,view/picture),y=Math.min(1,picture/view);
        gl.uniform4f(crop,x,y,(1-x)/2,(1-y)/2);gl.uniform2f(pixel,1/video.videoWidth,.5/video.videoHeight);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);
        gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      }
    };
  }
  function cpuRenderer() {
    const ctx=canvas.getContext('2d'),packed=document.createElement('canvas'),image=document.createElement('canvas');
    const read=packed.getContext('2d',{willReadFrequently:true}),draw=image.getContext('2d');let result;
    canvas.dataset.renderer='canvas2d';
    return {
      resize(){},clear(){ctx.clearRect(0,0,canvas.width,canvas.height);},
      paint(){
        if(packed.width!==video.videoWidth || packed.height!==video.videoHeight){
          packed.width=video.videoWidth;packed.height=video.videoHeight;
          image.width=video.videoWidth/2;image.height=video.videoHeight;result=draw.createImageData(image.width,image.height);
        }
        read.drawImage(video,0,0);const pixels=read.getImageData(0,0,packed.width,packed.height).data,out=result.data;
        const w=image.width,h=image.height,stride=packed.width*4;
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          const i=y*stride+x*4,j=(y*w+x)*4,m=i+w*4;
          const a=Math.round((pixels[m]+pixels[m+1]+pixels[m+2])/3);
          out[j]=pixels[i];out[j+1]=pixels[i+1];out[j+2]=pixels[i+2];out[j+3]=a<=4?0:a>=250?255:a;
        }
        draw.putImageData(result,0,0);const scale=Math.max(canvas.width/w,canvas.height/h);
        ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,(canvas.width-w*scale)/2,(canvas.height-h*scale)/2,w*scale,h*scale);
      }
    };
  }
  let renderer;
  try{renderer=gpuRenderer();}catch(_){renderer=null;}
  if(!renderer){const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;renderer=cpuRenderer();}
  function resize(){
    const ratio=Math.min(1,devicePixelRatio||1,Math.sqrt(900000/(innerWidth*innerHeight)));
    canvas.width=Math.round(innerWidth*ratio);canvas.height=Math.round(innerHeight*ratio);renderer.resize();
    if(active && hasImage)render(video.currentTime,true);
  }
  function render(time,force){
    if(video.readyState<2 || (!force && time===lastTime))return;
    renderer.paint();lastTime=time;hasImage=true;canvas.dataset.frames=String(++frames);
  }
  function stop(){
    generation++;active=false;video.pause();cancelAnimationFrame(raf);raf=0;clearTimeout(timer);
    renderer.clear();button.removeAttribute('aria-busy');
  }
  function schedule(id){
    // Drive from the page clock, independent of callbacks for a hidden video compositor.
    raf=requestAnimationFrame(now=>{
      raf=0;if(!active || id!==generation)return;
      try{if(now-lastPaint>=1000/24){lastPaint=now;render(video.currentTime);}}
      catch(error){stop();console.warn('Tiger rendering stopped:',error.message);return;}
      if(video.ended){stop();return;}schedule(id);
    });
  }
  function waitFor(event,action){
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>finish(new Error('Animation load timeout')),20000);
      function finish(error){clearTimeout(timeout);video.removeEventListener(event,done);video.removeEventListener('error',fail);error?reject(error):resolve();}
      function done(){finish();}function fail(){finish(new Error('Animation failed to load'));}
      video.addEventListener(event,done,{once:true});video.addEventListener('error',fail,{once:true});
      try{action();}catch(error){finish(error);}
    });
  }
  function download(url){
    if(!downloads.has(url)){
      const request=(async()=>{
        const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
        try{
          const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error('Animation download failed');
          return URL.createObjectURL(await response.blob());
        }finally{clearTimeout(timeout);}
      })().catch(error=>{downloads.delete(url);throw error;});downloads.set(url,request);
    }
    return downloads.get(url);
  }
  async function prepare(url,id){
    if(asset!==url || !ready || video.readyState<2){
      const local=await download(url);if(id!==generation)return false;
      ready=false;asset=url;await waitFor('loadeddata',()=>{video.src=local;video.load();});ready=true;
    }
    if(id!==generation)return false;
    if(video.currentTime>.001 || video.seeking)await waitFor('seeked',()=>{video.currentTime=0;});
    lastTime=-1;hasImage=false;frames=0;canvas.dataset.frames='0';return id===generation;
  }
  async function show(){
    if(starting)return;stop();starting=true;const id=generation;button.setAttribute('aria-busy','true');
    try{
      const url=innerWidth/innerHeight<.85?assets.mobile:assets.desktop;
      if(!(await prepare(url,id)) || id!==generation || document.hidden)return;
      resize();button.removeAttribute('aria-busy');
      if(reduced.matches){render(0,true);timer=setTimeout(()=>{if(id===generation)stop();},1200);return;}
      // A preloaded blob cannot stall halfway through on GitHub Pages buffering.
      video.muted=false;
      try{await video.play();}catch(error){if(error.name!=='NotAllowedError')throw error;video.muted=true;await video.play();}
      if(id!==generation || document.hidden){video.pause();return;}
      active=true;lastPaint=0;render(video.currentTime,true);schedule(id);
    }catch(error){if(id===generation){ready=false;stop();console.warn('Tiger effect unavailable:',error.message);}}
    finally{starting=false;}
  }
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();stop();});
  canvas.addEventListener('webglcontextrestored',()=>{renderer=gpuRenderer();resize();});
  const style=document.createElement('style');style.textContent='@media(max-width:640px){#tiger-egg{min-width:44px;min-height:44px;margin-block:-10px}}';
  document.head.appendChild(style);button.style.touchAction='manipulation';
  button.addEventListener('click',event=>{event.preventDefault();show();});video.addEventListener('ended',stop);
  window.addEventListener('keydown',event=>{if(event.key==='Escape')stop();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('pagehide',stop);window.addEventListener('resize',resize);resize();
})();
