/* Tiger at the viewport centre; keyed explosion covers the viewport in front. */
(function () {
  'use strict';
  const button = document.getElementById('tiger-egg');
  const canvas = document.createElement('canvas');
  canvas.id = 'tiger-fx';
  document.body.appendChild(canvas);
  if (!button || !canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const source = document.currentScript.src;
  const media = name => new URL('../media/' + name, source).href;
  const starts = [0, 3.95];
  const blastLead = .30; // Skip the explosion clip's empty green lead-in.
  let generation = 0, frame = 0, active = false, prepared;
  let audioContext, soundBuffer, sounds = [], lastPaint = 0, nextBlast = 0;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9998';
  function track(name, width, height) {
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.preload = 'none';
    video.src = media(name);
    const surface = document.createElement('canvas');
    surface.width = width; surface.height = height;
    return {video, surface, ctx:surface.getContext('2d', {willReadFrequently:true}), time:-1};
  }
  const tiger = track('tiger-run.mp4', 360, 640);
  const blast = track('tiger-explosion.mp4', 960, 540);
  function resize() {
    const ratio = Math.min(1.5, window.devicePixelRatio || 1,
      Math.sqrt(1500000 / (innerWidth * innerHeight)));
    canvas.width = Math.round(innerWidth * ratio);
    canvas.height = Math.round(innerHeight * ratio);
  }
  function load(video) {
    if (video.readyState >= 2) return Promise.resolve();
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => finish(new Error('Media load timeout')), 20000);
      function finish(error) {
        clearTimeout(timer); video.removeEventListener('loadeddata', ready);
        video.removeEventListener('error', fail);
        error ? reject(error) : resolve();
      }
      function ready() { finish(); }
      function fail() { finish(new Error('Media failed to load')); }
      video.addEventListener('loadeddata',ready,{once:true});
      video.addEventListener('error',fail,{once:true}); video.load();
    });
  }
  function seek(video, time) {
    if (Math.abs(video.currentTime-time)<.001 && !video.seeking) return Promise.resolve();
    return new Promise((resolve,reject) => {
      const timer=setTimeout(()=>finish(new Error('Media seek timeout')),10000);
      function finish(error) {
        clearTimeout(timer); video.removeEventListener('seeked',done);
        video.removeEventListener('error',fail);
        error?reject(error):resolve();
      }
      function done(){finish();}
      function fail(){finish(new Error('Media seek failed'));}
      video.addEventListener('seeked',done,{once:true});
      video.addEventListener('error',fail,{once:true}); video.currentTime=time;
    });
  }
  function playExplosionSound() {
    if (soundBuffer && audioContext && audioContext.state === 'running') {
      const node = audioContext.createBufferSource(), gain = audioContext.createGain();
      gain.gain.value = .55; node.buffer = soundBuffer;
      node.connect(gain); gain.connect(audioContext.destination);
      node.start(0,blastLead); sounds.push(node);
    }
  }
  function stop() {
    generation++; active = false; cancelAnimationFrame(frame); frame = 0;
    tiger.video.pause(); blast.video.pause();
    sounds.forEach(node => { try { node.stop(); } catch (_) {} }); sounds = [];
    ctx.clearRect(0,0,canvas.width,canvas.height);
    button.removeAttribute('aria-busy');
  }
  function keyed(track, flame) {
    if (track.video.readyState < 2) return false;
    if (track.time === track.video.currentTime) return true;
    track.time = track.video.currentTime;
    const c = track.ctx, w = track.surface.width, h = track.surface.height;
    c.clearRect(0,0,w,h); c.drawImage(track.video,0,0,w,h);
    const pixels = c.getImageData(0,0,w,h), d = pixels.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], b = d[i+2], m = Math.max(r,b);
      if (flame) {
        let a = 1-Math.max(0,Math.min(1,(g-m)/249.9));
        a = Math.max(0,Math.min(1,(a-.015)/.985));
        if (a < .025) { d[i+3] = 0; continue; }
        d[i] = Math.min(255,r/a);
        d[i+1] = Math.max(0,Math.min(255,(g-(1-a)*255)*.82/a));
        d[i+2] = Math.min(255,b/a); d[i+3] = Math.round(a*255);
      } else {
        const a = Math.max(0,Math.min(1,(65-(g-m))/55));
        d[i+1] = Math.min(g,m*1.03+3); d[i+3] = Math.round(a*255);
      }
    }
    c.putImageData(pixels,0,0); return true;
  }
  function paint(now) {
    if (!active) return;
    frame = requestAnimationFrame(paint);
    if (now-lastPaint < 1000/30) return;
    lastPaint = now;
    const t = tiger.video.currentTime, w = canvas.width, h = canvas.height;
    if (tiger.video.ended || t >= 7.15) { stop(); return; }
    ctx.clearRect(0,0,w,h);
    if (keyed(tiger,false)) {
      const mobile = innerWidth <= 640;
      const height = Math.min(h*(mobile?.72:.82),w*1.4,(mobile?600:800)*(w/innerWidth));
      const width = height*360/640;
      ctx.drawImage(tiger.surface,(w-width)/2,(h-height)/2,width,height);
    }
    if (nextBlast < starts.length && t >= starts[nextBlast]) {
      nextBlast++; blast.video.currentTime = blastLead; blast.time = -1;
      blast.video.play().catch(() => {});
      playExplosionSound();
    }
    if (nextBlast && t-starts[nextBlast-1] < 3.15-blastLead && keyed(blast,true)) {
      const scale = Math.max(w/960,h/540);
      ctx.drawImage(blast.surface,(w-960*scale)/2,(h-540*scale)/2,960*scale,540*scale);
    }
  }
  async function show() {
    stop(); const id = generation;
    // Unlock optional audio in the actual click/key gesture, before loading media.
    if (!reduced.matches) {
      try {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!audioContext && Audio) audioContext = new Audio();
        if (audioContext) audioContext.resume().catch(() => {});
      } catch (_) {}
    }
    button.setAttribute('aria-busy','true');
    try {
      if (!prepared) prepared = Promise.all([load(tiger.video),load(blast.video),
        audioContext ? fetch(media('tiger-explosion.mp3')).then(r => {
          if (!r.ok) throw new Error('Audio load failed'); return r.arrayBuffer();
        }).then(data => audioContext.decodeAudioData(data)).then(buffer => {soundBuffer=buffer;}).catch(() => {}) : Promise.resolve()
      ]).catch(error => {prepared=null;throw error;});
      await prepared;
      if (id !== generation || document.hidden) return;
      button.removeAttribute('aria-busy'); resize();
      await Promise.all([seek(tiger.video,0),seek(blast.video,blastLead)]);
      if (id !== generation || document.hidden) return;
      tiger.time = blast.time = -1; nextBlast = 1; lastPaint = 0;
      if (reduced.matches) {
        keyed(tiger,false);
        const h=Math.min(canvas.height*.6,canvas.width*1.4),w=h*360/640;
        ctx.drawImage(tiger.surface,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
        setTimeout(() => {if(id===generation)stop();},1200); return;
      }
      // Reveal only after both videos can play, so the first canvas frame has both layers.
      await Promise.all([tiger.video.play(),blast.video.play()]);
      if (id !== generation) return;
      playExplosionSound();
      active = true; frame = requestAnimationFrame(paint);
    } catch (error) { if (id === generation) stop(); console.warn('Tiger effect unavailable:',error.message); }
  }
  const touchStyle = document.createElement('style');
  touchStyle.textContent = '@media(max-width:640px){#tiger-egg{min-width:44px;min-height:44px;margin-block:-10px}}';
  document.head.appendChild(touchStyle);
  button.style.touchAction = 'manipulation';
  button.addEventListener('click',event => {event.preventDefault();show();});
  window.addEventListener('keydown',event => {if(event.key==='Escape')stop();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('resize',resize); window.addEventListener('pagehide',stop);
  resize();
})();
