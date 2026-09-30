// Night Museum — app shell: screens, gallery motion, camera, MediaPipe loop.
(function () {
  'use strict';
  const MP_VERSION = '1.0.1';
  const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
  const GESTURE_MODEL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task';
  const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';
  const params = new URLSearchParams(location.search);
  let DEBUG = params.has('debug');
  const CROSSED_ARMS = params.has('crossed');        // experimental close gesture
  const AUTOPLAY_MS = 6000;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ART = window.NM_ARTWORKS;
  const N = ART.length;
  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const log = (...a) => { if (DEBUG) console.log('[NM]', ...a); };

  const state = {
    screen: 'intro',          // intro | gallery
    focus: 5,                 // 0-based → The Night Watch
    playing: true,
    expanded: false,
    camera: 'idle',           // idle | starting | on | off | blocked
    handPresent: false,
    lastInteraction: 0,
  };

  /* ---------------- stage scaling ---------------- */
  function layout() {
    const portrait = innerHeight > innerWidth * 1.1;
    stage.dataset.layout = portrait ? 'portrait' : 'landscape';
    const W = portrait ? 1080 : 1920, H = portrait ? 1920 : 1080;
    stage.style.setProperty('--scale', Math.min(innerWidth / W, innerHeight / H));
    if (state.screen === 'gallery') placeCards(true);
  }
  addEventListener('resize', layout);

  /* ---------------- images (Wikimedia, local fallback) ---------------- */
  function setImg(img, art) {
    img.onerror = () => { if (img.src !== new URL(art.local, location.href).href) { img.onerror = null; img.src = art.local; } };
    img.src = art.src;
    img.alt = `${art.title} — ${art.credit}`;
  }
  setImg($('intro-img'), ART[0]);

  /* ---------------- gallery strip ---------------- */
  const strip = $('strip');
  const cards = ART.map((art, i) => {
    const b = document.createElement('button');
    b.className = 'card'; b.type = 'button'; b.dataset.i = i;
    b.setAttribute('aria-label', `${art.title}, ${art.credit}`);
    const img = document.createElement('img'); img.loading = 'eager'; img.decoding = 'async';
    setImg(img, art); b.appendChild(img);
    b.addEventListener('click', () => { if (i === state.focus) openFocused('click'); else go(i, 'click'); });
    strip.appendChild(b); return b;
  });
  const progress = $('progress');
  ART.forEach(() => progress.appendChild(document.createElement('i')));
  let prevOffsets = new Array(N).fill(0);

  function slotSpec(portrait) {
    // [height, maxWidth, opacity] for |offset| = 0,1,2 ; gaps between slots
    return portrait
      ? { h: [640, 300, 220], maxW: [920, 380, 240], op: [1, .42, .18], gap: [44, 36], center: 380 }
      : { h: [520, 260, 200], maxW: [900, 470, 300], op: [1, .42, .18], gap: [48, 40], center: 260 };
  }
  function placeCards(instant) {
    const portrait = stage.dataset.layout === 'portrait';
    const S = slotSpec(portrait), W = portrait ? 1080 : 1920;
    const size = (i, d) => { const a = Math.abs(d); if (a > 2) return [0, 0];
      const h0 = S.h[a], r = ART[i].ratio; let w = h0 * r, h = h0; if (w > S.maxW[a]) { w = S.maxW[a]; h = w / r; } return [w, h]; };
    const offsets = ART.map((_, i) => { let d = i - state.focus; if (d > N / 2) d -= N; if (d < -N / 2) d += N; return d; });
    // x positions outward from the centre
    const x = {}; const fw = size(state.focus, 0)[0]; x[0] = (W - fw) / 2;
    const byOff = {}; offsets.forEach((d, i) => byOff[d] = i);
    let right = x[0] + fw, left = x[0];
    for (let d = 1; d <= 3; d++) {
      const g = S.gap[Math.min(d - 1, 1)];
      const ri = byOff[d], li = byOff[-d];
      const rw = ri != null ? size(ri, Math.min(d, 2))[0] : 0; const lw = li != null ? size(li, Math.min(d, 2))[0] : 0;
      x[d] = right + g; right = x[d] + rw; x[-d] = left - g - lw; left = x[-d];
    }
    cards.forEach((c, i) => {
      const d = offsets[i], a = Math.abs(d);
      const [w, h] = a <= 2 ? size(i, d) : size(i, 2);
      const jump = Math.abs(d - prevOffsets[i]) > 2 || instant;
      c.classList.toggle('no-anim', jump);
      const xx = a <= 2 ? x[d] : (d < 0 ? x[-2] - 400 : x[2] + 400);
      c.style.width = w + 'px'; c.style.height = h + 'px';
      c.style.transform = `translate(${xx}px, ${S.center - h / 2}px)`;
      const op = a <= 2 ? S.op[a] : 0; c.style.opacity = op; c.style.setProperty('--op', op);
      c.classList.toggle('is-focus', d === 0);
      c.tabIndex = a <= 1 ? 0 : -1; c.setAttribute('aria-hidden', a > 2);
      if (jump) void c.offsetWidth;
    });
    prevOffsets = offsets;
    [...progress.children].forEach((t, i) => t.classList.toggle('on', i === state.focus));
    const pb = $('pinch-bar'); const [fwN, fhN] = size(state.focus, 0);
    pb.style.left = ((W - 200) / 2) + 'px'; pb.style.top = (strip.offsetTop + S.center + fhN / 2 + 14) + 'px';
    updateCaption();
  }
  function updateCaption() {
    const a = ART[state.focus], cap = $('focus-caption');
    cap.classList.add('fading');
    setTimeout(() => {
      $('cap-index').textContent = `${a.id} / ${N}`; $('cap-title').textContent = a.title; $('cap-credit').textContent = a.credit;
      cap.classList.remove('fading');
    }, REDUCED ? 0 : 250);
  }
  function go(i, via) {
    if (state.expanded) return;
    state.focus = (i + N) % N; state.lastInteraction = performance.now();
    placeCards(false);
    if (via) log('go', state.focus, via);
  }
  const next = (via) => go(state.focus + 1, via);
  const prev = (via) => go(state.focus - 1, via);

  /* ---------------- autoplay ---------------- */
  let autoTimer = null;
  function schedule() {
    clearTimeout(autoTimer);
    if (!state.playing || state.expanded || state.screen !== 'gallery' || REDUCED) return;
    autoTimer = setTimeout(() => { if (performance.now() - state.lastInteraction > AUTOPLAY_MS - 50) next(); schedule(); }, AUTOPLAY_MS);
  }
  function setPlaying(p, via) {
    state.playing = p;
    $('btn-pause').textContent = p ? 'Pause' : 'Play';
    $('btn-pause').classList.toggle('active', !p);
    $('toast').classList.toggle('is-paused', !p);
    showStateToast(via);
    schedule();
  }

  /* ---------------- toast / feedback ---------------- */
  let toastTimer = null;
  function toast(title, sub, flash) {
    $('toast-title').textContent = title; $('toast-sub').textContent = sub;
    const t = $('toast'); t.classList.toggle('flash', !!flash);
    clearTimeout(toastTimer);
    if (flash) toastTimer = setTimeout(() => { t.classList.remove('flash'); showStateToast(); }, 1400);
  }
  function showStateToast(via) {
    const cam = state.camera === 'on';
    if (cam && !state.handPresent && state.screen === 'gallery' && handLostShown) return toast('Show your hand to the camera', 'Hold it up, about half a metre from the lens');
    if (!state.playing) return toast('Paused', via === 'palm' ? 'Open palm recognised · swipe to resume' : (cam ? 'Swipe or show your palm to resume' : 'Press Play to resume'), via === 'palm');
    toast('Gallery moving', cam ? 'Swipe to browse · show your palm to pause' : 'Use the buttons below to browse');
  }
  function flashHint(name) {
    const li = document.querySelector(`.gesture-guide [data-hint="${name}"]`);
    const pv = $('cam-preview');
    if (li) { li.classList.add('hot'); setTimeout(() => li.classList.remove('hot'), 800); }
    pv.classList.add('flash'); setTimeout(() => pv.classList.remove('flash'), 800);
  }
  function hotButton(id) { const b = $(id); b.classList.add('hot'); setTimeout(() => b.classList.remove('hot'), 500); }

  /* ---------------- expanded ---------------- */
  function openFocused(via) {
    if (state.expanded || state.screen !== 'gallery') return;
    const a = ART[state.focus];
    state.expanded = true; clearTimeout(autoTimer);
    setImg($('ov-img'), a);
    $('ov-index').textContent = `${a.id} / ${N}`; $('ov-title').textContent = a.title; $('ov-credit').textContent = a.credit;
    $('ov-desc').textContent = a.description; $('ov-medium').textContent = `${a.medium} · Public domain`;
    const ov = $('overlay'); ov.classList.remove('closing'); ov.hidden = false;
    engine && engine.setMode('expanded', performance.now());
    $('btn-close').focus({ preventScroll: true });
    log('open', a.title, via);
  }
  function closeExpanded(via) {
    if (!state.expanded) return;
    const ov = $('overlay'); ov.classList.add('closing');
    setTimeout(() => { ov.hidden = true; ov.classList.remove('closing'); }, REDUCED ? 0 : 340);
    state.expanded = false; state.lastInteraction = performance.now() + 1000; // 1 s rest before drift resumes
    engine && engine.setMode('gallery', performance.now());
    stage.dataset.selecting = 'false';
    cards[state.focus].focus({ preventScroll: true });
    schedule(); showStateToast();
    log('close', via);
  }

  /* ---------------- screens ---------------- */
  function showGallery() {
    state.screen = 'gallery';
    $('intro').hidden = true; $('gallery').hidden = false;
    stage.dataset.screen = 'gallery';
    placeCards(true); showStateToast(); schedule();
    engine && engine.setMode('gallery', performance.now());
    cards[state.focus].focus({ preventScroll: true });
  }

  /* ---------------- camera + MediaPipe ---------------- */
  let stream = null, recognizer = null, pose = null, engine = null, running = false, mpModule = null;
  const video = $('video');

  function setCamera(s) {
    state.camera = s; stage.dataset.camera = s;
    $('cam-label').textContent = { idle: 'Camera off', starting: 'Starting camera…', on: 'Camera ready', off: 'Camera off', blocked: 'Camera blocked' }[s];
    $('btn-cam-toggle').textContent = s === 'on' ? 'Turn off camera' : 'Turn on camera';
    $('cam-empty').textContent = s === 'starting' ? 'Starting…' : 'Camera off';
  }

  async function loadModels() {
    if (recognizer) return;
    mpModule = mpModule || await import(`${MP_URL}/vision_bundle.mjs`);
    const { FilesetResolver, GestureRecognizer, PoseLandmarker } = mpModule;
    const fileset = await FilesetResolver.forVisionTasks(`${MP_URL}/wasm`);
    const opts = (delegate) => ({ baseOptions: { modelAssetPath: GESTURE_MODEL, delegate }, runningMode: 'VIDEO', numHands: 2,
      minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.5 });
    // GPU is faster, but some machines stall while creating the GPU context — give it 8 s, then use CPU.
    const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
    try { recognizer = await withTimeout(GestureRecognizer.createFromOptions(fileset, opts('GPU')), 8000); log('delegate GPU'); }
    catch (e) { log('GPU delegate unavailable, using CPU', e); recognizer = await GestureRecognizer.createFromOptions(fileset, opts('CPU')); }
    if (CROSSED_ARMS) {
      try { pose = await PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1 }); }
      catch (e) { log('pose model failed', e); }
    }
    engine = engine || new window.NMGestureEngine();
    engine.setMode(state.screen === 'gallery' ? (state.expanded ? 'expanded' : 'gallery') : 'off', performance.now());
  }

  async function startCamera(fromIntro) {
    if (state.camera === 'starting' || state.camera === 'on') return;
    setCamera('starting');
    const btn = $('btn-enable');
    if (fromIntro) {
      btn.disabled = true; btn.classList.add('loading'); btn.querySelector('.btn-label').textContent = 'Starting camera…';
      $('camera-waiting').hidden = false; $('camera-alert').hidden = true;
    }
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('unsupported'), { name: 'NotSupportedError' });
      const camP = navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
      const modelP = loadModels();
      stream = await camP;
      $('camera-waiting').hidden = true;
      video.srcObject = stream; await video.play();
      if (fromIntro) btn.querySelector('.btn-label').textContent = 'Loading gestures…';
      await modelP;
      setCamera('on');
      running = true; requestAnimationFrame(loop);
      if (state.screen !== 'gallery') showGallery(); else showStateToast();
    } catch (err) {
      log('camera error', err);
      stopCamera(true);
      setCamera(err && err.name === 'NotAllowedError' ? 'blocked' : 'off');
      showCameraError(err);
      if (!fromIntro) toast('Camera unavailable', 'Keep browsing with the buttons below', true);
    } finally {
      btn.disabled = false; btn.classList.remove('loading');
    }
  }

  function showCameraError(err) {
    const name = err && err.name;
    const map = {
      NotAllowedError: ['Camera access is blocked', 'Allow the camera for this site in your browser settings, then try again. You can also explore with the on-screen buttons.'],
      NotFoundError: ['No camera found', 'Connect a camera and try again, or explore with the on-screen buttons.'],
      NotReadableError: ['The camera is busy', 'Another app is using the camera. Close it and try again, or explore with the on-screen buttons.'],
      NotSupportedError: ['Camera not supported here', 'Open this page in a recent version of Chrome, or explore with the on-screen buttons.'],
    };
    const [title, body] = map[name] || ['Gestures could not start', 'Check your internet connection (the gesture model loads from Google) and try again, or explore with the on-screen buttons.'];
    $('alert-title').textContent = title; $('alert-body').textContent = body;
    $('camera-alert').hidden = false; $('camera-waiting').hidden = true;
    $('btn-enable').querySelector('.btn-label').textContent = 'Try again';
  }

  function stopCamera(silent) {
    running = false;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    video.srcObject = null;
    const cv = $('debug-canvas'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    engine && engine.reset();
    state.handPresent = false; handLostShown = false;
    if (!silent) { setCamera('off'); showStateToast(); }
  }

  /* ---------------- detection loop ---------------- */
  let lastVideoTime = -1, frameNo = 0, handLostShown = false, handLostTimer = null;
  const dbgCanvas = $('debug-canvas'), dbgPanel = $('debug-panel');
  function setDebug(on) { DEBUG = on; dbgCanvas.hidden = false; dbgPanel.hidden = !on; }
  setDebug(DEBUG);

  function loop() {
    if (!running) return;
    if (document.visibilityState === 'visible' && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const t = performance.now();
      let res;
      try { res = recognizer.recognizeForVideo(video, t); } catch (e) { log('recognize error', e); }
      if (res) {
        const hands = res.landmarks.map((lm, i) => ({ landmarks: lm, gesture: res.gestures[i] && res.gestures[i][0] ? res.gestures[i][0].categoryName : 'None', score: res.gestures[i] && res.gestures[i][0] ? res.gestures[i][0].score : 0 }));
        let poseLm = null;
        if (pose && state.expanded && (frameNo++ % 2 === 0)) {
          try { const p = pose.detectForVideo(video, t); poseLm = p.landmarks && p.landmarks[0] || null; } catch (e) { /* ignore */ }
        }
        const events = engine.update({ t, hands, pose: poseLm });
        events.forEach(handle);
        drawDebug(res, engine.debug);
      }
    }
    requestAnimationFrame(loop);
  }

  function handle(ev) {
    if (state.screen !== 'gallery') return;
    if (!/progress/.test(ev.type)) log('event', ev);
    switch (ev.type) {
      case 'next': case 'prev': {
        if (!state.playing) { state.playing = true; $('btn-pause').textContent = 'Pause'; $('btn-pause').classList.remove('active'); $('toast').classList.remove('is-paused'); schedule(); }
        ev.type === 'next' ? next('swipe') : prev('swipe');
        flashHint('swipe'); hotButton(ev.type === 'next' ? 'btn-next' : 'btn-prev');
        toast(ev.type === 'next' ? 'Next painting' : 'Previous painting', ART[state.focus].title, true);
        break;
      }
      case 'pause': setPlaying(!state.playing, 'palm'); flashHint('palm'); hotButton('btn-pause'); if (state.playing) toast('Playing', 'Open palm recognised', true); break;
      case 'palm-progress': {
        const li = document.querySelector('.gesture-guide [data-hint="palm"]');
        if (ev.value > 0) {
          if (li) li.classList.add('hot');
          $('toast-title').textContent = 'Open palm recognised';
          $('toast-sub').textContent = state.playing ? 'Hold still to pause…' : 'Hold still to resume…';
          $('toast').classList.add('flash');
        } else { if (li) li.classList.remove('hot'); $('toast').classList.remove('flash'); showStateToast(); }
        break;
      }
      case 'pinch-progress':
        stage.dataset.selecting = ev.value > 0 ? 'true' : 'false';
        $('pinch-bar').firstElementChild.style.width = (ev.value * 100) + '%';
        if (ev.value > 0 && ev.value < 1) { $('toast-title').textContent = 'Pinch recognised'; $('toast-sub').textContent = `Opening “${ART[state.focus].title}”…`; $('toast').classList.add('flash'); }
        if (ev.value === 0) showStateToast();
        break;
      case 'select': flashHint('pinch'); hotButton('btn-open'); setTimeout(() => { openFocused('pinch'); stage.dataset.selecting = 'false'; }, 180); break;
      case 'close': flashHint('close'); closeExpanded(ev.via); break;
      case 'hand':
        state.handPresent = ev.present;
        clearTimeout(handLostTimer);
        if (!ev.present) { handLostShown = true; if (!state.expanded) showStateToast(); }
        else if (handLostShown) { handLostShown = false; if (!state.expanded) showStateToast(); }
        break;
    }
  }

  function drawDebug(res, d) {
    const c = dbgCanvas, ctx = c.getContext('2d');
    c.width = video.videoWidth; c.height = video.videoHeight; ctx.clearRect(0, 0, c.width, c.height);
    // subtle hand dots always on (confirms tracking on camera); brighter in debug mode
    ctx.fillStyle = DEBUG ? '#c9a96e' : 'rgba(201,169,110,.55)';
    const r = Math.max(3, c.width / 200);
    res.landmarks.forEach(lm => lm.forEach(p => { ctx.beginPath(); ctx.arc(p.x * c.width, p.y * c.height, r, 0, 7); ctx.fill(); }));
    if (!DEBUG) return;
    dbgPanel.textContent = JSON.stringify(Object.assign({ hands: res.landmarks.length, mode: engine.mode, playing: state.playing }, d), null, 1);
  }

  /* ---------------- wiring ---------------- */
  $('btn-enable').addEventListener('click', () => startCamera(true));
  $('btn-skip').addEventListener('click', () => { setCamera('off'); showGallery(); });
  $('btn-cam-toggle').addEventListener('click', () => state.camera === 'on' ? stopCamera(false) : startCamera(false));
  $('btn-prev').addEventListener('click', () => prev('button'));
  $('btn-next').addEventListener('click', () => next('button'));
  $('btn-pause').addEventListener('click', () => setPlaying(!state.playing, 'button'));
  $('btn-open').addEventListener('click', () => openFocused('button'));
  $('btn-close').addEventListener('click', () => closeExpanded('button'));
  $('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeExpanded('backdrop'); });

  // Keyboard alternatives (not advertised in the UI, kept for accessibility)
  addEventListener('keydown', (e) => {
    if (e.key === 'd' && !e.metaKey && !e.ctrlKey) { setDebug(!DEBUG); return; } // hidden test overlay
    if (state.screen !== 'gallery') return;
    if (state.expanded) { if (e.key === 'Escape') { e.preventDefault(); closeExpanded('key'); } return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); next('key'); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev('key'); }
    else if (e.key === ' ') { e.preventDefault(); setPlaying(!state.playing, 'key'); }
    else if (e.key === 'Enter' && document.activeElement && document.activeElement.classList.contains('card') && +document.activeElement.dataset.i !== state.focus) { go(+document.activeElement.dataset.i, 'key'); e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); openFocused('key'); }
  });

  // Stop the stream when the page goes away; pause detection while hidden.
  addEventListener('pagehide', () => stopCamera(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(); else clearTimeout(autoTimer); });

  // Expose a tiny hook for automated UI tests (no effect in normal use)
  window.__NM = { state, handle, go, openFocused, closeExpanded, showGallery, setCamera };

  setCamera('idle');
  layout();
})();
