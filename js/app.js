(function () {
  'use strict';

  const MODELS = window.WATCH_MODELS;
  const R = window.WatchRenderer;
  const $ = (s, el = document) => el.querySelector(s);

  const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const ZONES = [
    ['UTC', 'UTC / Zulu'],
    ['America/Los_Angeles', 'Los Angeles'],
    ['America/Denver', 'Denver'],
    ['America/Chicago', 'Chicago'],
    ['America/New_York', 'New York'],
    ['America/Sao_Paulo', 'São Paulo'],
    ['Europe/London', 'London'],
    ['Europe/Paris', 'Paris'],
    ['Europe/Zurich', 'Geneva'],
    ['Asia/Dubai', 'Dubai'],
    ['Asia/Kolkata', 'Mumbai'],
    ['Asia/Singapore', 'Singapore'],
    ['Asia/Hong_Kong', 'Hong Kong'],
    ['Asia/Seoul', 'Seoul'],
    ['Asia/Tokyo', 'Tokyo'],
    ['Australia/Sydney', 'Sydney'],
    ['Pacific/Auckland', 'Auckland'],
  ];
  const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';

  const state = {
    model: MODELS[0],
    variant: MODELS[0].variants[0],
    night: false,
    gmtZone: 'UTC',
    h24Zone: 'local',
    bezel: {},            // modelId -> degrees
    chosen: {},           // modelId -> last chosen variant id
    chrono: { running: false, start: 0, acc: 0 },
    lastDateKey: '',
  };

  const els = {
    stage: $('#watch'),
    models: $('#models'),
    name: $('#model-name'),
    ref: $('#model-ref'),
    blurb: $('#model-blurb'),
    variants: $('#variants'),
    controls: $('#controls'),
    features: $('#features'),
    lumeBtn: $('#lume-toggle'),
    fsBtn: $('#fs-toggle'),
    panelBtn: $('#panel-toggle'),
  };
  let refs = {};

  /* ---------- audio: tiny synthesized bezel click ---------- */
  let audio;
  function click(strength = 1) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime;
      const buf = audio.createBuffer(1, 600, audio.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6);
      const src = audio.createBufferSource();
      const f = audio.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2400;
      const g = audio.createGain(); g.gain.value = 0.35 * strength;
      src.buffer = buf; src.connect(f); f.connect(g); g.connect(audio.destination);
      src.start(t);
    } catch (e) { /* audio unavailable */ }
  }

  /* ---------- time helpers ---------- */
  const fmtCache = {};
  function zoneParts(date, tz) {
    if (tz === 'local') return { h: date.getHours(), m: date.getMinutes() };
    const f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }));
    const p = {};
    f.formatToParts(date).forEach((x) => { p[x.type] = x.value; });
    return { h: +p.hour % 24, m: +p.minute };
  }

  /* ---------- render ---------- */
  function render() {
    const m = state.model;
    els.stage.innerHTML = R.build(m, state.variant);
    els.stage.dataset.model = m.id;
    state.chosen[m.id] = state.variant.id;
    const svg = $('svg', els.stage);
    refs = {
      svg,
      hands: {},
      bezel: [...svg.querySelectorAll('[data-bezel]')],
      date: $('#date-text', svg),
      day: $('#day-text', svg),
    };
    svg.querySelectorAll('[data-hand]').forEach((el) => {
      const k = el.dataset.hand;
      (refs.hands[k] = refs.hands[k] || []).push(el);
    });
    state.lastDateKey = '';
    applyBezel();
    wireWatch(svg);
    renderPanel();
    tick();
    updateHash();
  }

  function setHand(key, deg) {
    const list = refs.hands[key];
    if (!list) return;
    for (const el of list) {
      const cx = el.dataset.cx, cy = el.dataset.cy;
      el.setAttribute('transform', (cx !== undefined ? `translate(${cx} ${cy}) ` : '') + `rotate(${deg.toFixed(3)})`);
    }
  }

  function chronoElapsed(now) {
    const c = state.chrono;
    return c.running ? c.acc + (now - c.start) : c.acc;
  }

  // Hands are positioned from the exact time on every call, so the seconds
  // hand sweeps continuously instead of stepping.
  function tick() {
    const now = new Date();
    const ms = now.getTime();
    const s = now.getSeconds() + now.getMilliseconds() / 1000;
    const mi = now.getMinutes() + s / 60;
    const h = (now.getHours() % 12) + mi / 60;

    setHand('hour', h * 30);
    setHand('minute', mi * 6);
    setHand('second', s * 6);
    setHand('sub-sec', s * 6);

    const m = state.model;
    if (m.gmt || m.h24) {
      // time-zone lookup is costly, so refresh it once a second
      const zone = m.gmt ? state.gmtZone : state.h24Zone;
      const sec = Math.floor(ms / 1000);
      if (!state.zone || state.zone.sec !== sec || state.zone.id !== zone) state.zone = { sec, id: zone, ...zoneParts(now, zone) };
      const z = state.zone;
      setHand('gmt', (z.h + z.m / 60 + (s % 60) / 3600) * 15);
    }
    if (m.chrono) {
      const e = chronoElapsed(ms);
      setHand('chrono', ((e / 1000) % 60) * 6);
      setHand('sub-min', (Math.floor(e / 60000) % 30) * 12);
      setHand('sub-hr', ((e / 3600000) % 12) * 30);
      const cr = $('#chrono-readout');
      if (cr) cr.textContent = fmtElapsed(e);
    }

    // date and day wheels jump at local midnight
    const key = now.toDateString();
    if (key !== state.lastDateKey) {
      state.lastDateKey = key;
      if (refs.date) refs.date.textContent = now.getDate();
      if (refs.day) refs.day.textContent = DAYS[now.getDay()];
    }

  }

  function fmtElapsed(e) {
    const t = Math.floor(e / 1000);
    const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
    const tenths = Math.floor((e % 1000) / 100);
    return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${tenths}`;
  }


  /* ---------- bezel ---------- */
  function applyBezel() {
    const deg = state.bezel[state.model.id] || 0;
    refs.bezel.forEach((g) => g.setAttribute('transform', `rotate(${deg})`));
  }

  function turnBezel(clicks) {
    const b = state.model.bezel;
    if (!b.rotate) return false;
    if (b.rotate === 'uni' && clicks > 0) return false; // diver's bezel: anticlockwise only
    const id = state.model.id;
    state.bezel[id] = ((state.bezel[id] || 0) + clicks * b.step) % 360;
    applyBezel();
    click();
    return true;
  }

  function svgAngle(svg, evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return (Math.atan2(p.x, -p.y) * 180) / Math.PI;
  }

  function wireWatch(svg) {
    const hit = $('.bezel-hit', svg);
    if (hit) {
      let last = null, acc = 0;
      hit.addEventListener('pointerdown', (e) => {
        hit.setPointerCapture(e.pointerId);
        last = svgAngle(svg, e); acc = 0;
        svg.classList.add('dragging');
      });
      hit.addEventListener('pointermove', (e) => {
        if (last === null) return;
        const a = svgAngle(svg, e);
        let d = a - last; if (d > 180) d -= 360; if (d < -180) d += 360;
        last = a; acc += d;
        const step = state.model.bezel.step;
        while (Math.abs(acc) >= step) {
          const dir = Math.sign(acc);
          acc -= dir * step;
          if (!turnBezel(dir)) acc = 0;
        }
      });
      const end = () => { last = null; svg.classList.remove('dragging'); };
      hit.addEventListener('pointerup', end);
      hit.addEventListener('pointercancel', end);
      hit.addEventListener('wheel', (e) => { e.preventDefault(); turnBezel(e.deltaY > 0 ? -1 : 1); }, { passive: false });
    }
    svg.querySelectorAll('.pusher').forEach((p) => {
      p.addEventListener('click', () => {
        p.classList.add('pressed');
        setTimeout(() => p.classList.remove('pressed'), 140);
        chronoAction(p.dataset.action);
      });
    });
  }

  /* ---------- chronograph ---------- */
  function chronoAction(act) {
    const c = state.chrono, now = Date.now();
    if (act === 'start') {
      if (c.running) { c.acc += now - c.start; c.running = false; }
      else { c.start = now; c.running = true; }
      click(1.4);
    } else if (act === 'reset') {
      if (c.running) return; // a real Daytona ignores reset while running
      c.acc = 0; click(1.4);
    }
    tick();
    renderControls();
  }

  /* ---------- panel ---------- */
  function renderPanel() {
    const m = state.model;
    updateCarousel();
    els.name.textContent = m.name;
    els.ref.textContent = `${m.ref} · ${m.since}`;
    els.blurb.textContent = m.blurb;
    els.variants.innerHTML = m.variants.map((v) => {
      const bg = v.insert && v.insert.top
        ? `linear-gradient(180deg, ${v.insert.top} 50%, ${v.insert.bottom} 50%)`
        : v.insert ? `radial-gradient(circle, ${v.dial.base} 52%, ${v.insert.color} 54%)`
        : `radial-gradient(circle at 35% 30%, ${v.dial.base}, ${v.dial.edge})`;
      return `<button class="swatch${v === state.variant ? ' active' : ''}" data-id="${v.id}" title="${v.name}" aria-label="${v.name} dial">
        <span class="chip" style="background:${bg}"></span><span class="sname">${v.name}</span></button>`;
    }).join('');
    els.features.innerHTML = m.features.map((f) => `<li>${f}</li>`).join('');
    renderControls();
  }

  function zoneOptions(selected, withLocal) {
    const list = withLocal ? [['local', `Local (${LOCAL_TZ.replace(/_/g, ' ')})`], ...ZONES] : ZONES;
    return list.map(([v, l]) => `<option value="${v}"${v === selected ? ' selected' : ''}>${l}</option>`).join('');
  }

  function renderControls() {
    const m = state.model;
    let h = '';
    if (m.gmt) {
      h += `<label class="ctl"><span class="eyebrow">24-hour hand time zone</span>
        <select id="gmt-zone">${zoneOptions(state.gmtZone, false)}</select></label>`;
    }
    if (m.h24) {
      h += `<label class="ctl"><span class="eyebrow">24-hour hand</span>
        <select id="h24-zone">${zoneOptions(state.h24Zone, true)}</select></label>`;
    }
    if (m.bezel.rotate) {
      h += `<div class="ctl"><span class="eyebrow">Bezel ${m.bezel.rotate === 'uni' ? '(unidirectional)' : '(bidirectional)'}</span>
        <div class="btn-row">
          <button class="btn" data-bezel="-1" title="Anticlockwise">↺ One click</button>
          <button class="btn" data-bezel="1" title="Clockwise"${m.bezel.rotate === 'uni' ? ' disabled' : ''}>↻ One click</button>
          <button class="btn ghost" data-bezel="reset">Reset</button>
        </div><p class="hint">Or drag the bezel on the watch, or scroll over it.</p></div>`;
    }
    if (m.chrono) {
      const c = state.chrono;
      h += `<div class="ctl"><span class="eyebrow">Chronograph</span>
        <div class="chrono-readout mono" id="chrono-readout">${fmtElapsed(chronoElapsed(Date.now()))}</div>
        <div class="btn-row">
          <button class="btn" data-chrono="start">${c.running ? 'Stop' : c.acc ? 'Resume' : 'Start'}</button>
          <button class="btn ghost" data-chrono="reset"${c.running ? ' disabled' : ''}>Reset</button>
        </div><p class="hint">The pushers on the case work too: upper at 2 o’clock, lower at 4.</p></div>`;
    }
    els.controls.innerHTML = h;
    els.controls.hidden = !h;
  }

  /* ---------- events ---------- */
  function selectModel(id, variantId) {
    const m = MODELS.find((x) => x.id === id) || MODELS[0];
    state.model = m;
    state.variant = m.variants.find((v) => v.id === (variantId || state.chosen[m.id])) || m.variants[0];
    render();
  }

  /* ---------- model carousel ---------- */
  // Thumbnails are the real renderer output posed at 10:10, turned into
  // images so each one keeps its own gradient ids.
  const THUMB_CSS = 'text{text-anchor:middle;dominant-baseline:central}' +
    '.dialtxt,.roman,.rehaut,.datefont{font-family:"EB Garamond",Georgia,serif;font-weight:600}.datefont{font-weight:700}' +
    '.bz,.explorer-num,.subnum{font-family:Barlow,"Helvetica Neue",Arial,sans-serif;font-weight:500}' +
    '.sunburst{width:100%;height:100%;border-radius:50%}';
  const POSE = { hour: 305, minute: 60, second: 186, gmt: 152.5, chrono: 0, 'sub-sec': 186, 'sub-min': 0, 'sub-hr': 0 };
  const thumbCache = {};

  function thumbURL(model, variant) {
    const key = model.id + '/' + variant.id;
    if (thumbCache[key]) return thumbCache[key];
    const doc = new DOMParser().parseFromString(R.build(model, variant), 'image/svg+xml');
    const svg = doc.documentElement;
    svg.querySelectorAll('.night-dim, .lume-layer, .bezel-hit, .glare').forEach((n) => n.remove());
    svg.querySelectorAll('[data-hand]').forEach((el) => {
      const cx = el.getAttribute('data-cx'), cy = el.getAttribute('data-cy');
      el.setAttribute('transform', (cx !== null ? `translate(${cx} ${cy}) ` : '') + `rotate(${POSE[el.getAttribute('data-hand')] || 0})`);
    });
    const now = new Date();
    const date = svg.querySelector('#date-text'); if (date) date.textContent = now.getDate();
    const day = svg.querySelector('#day-text'); if (day) day.textContent = DAYS[now.getDay()];
    const style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = THUMB_CSS;
    svg.insertBefore(style, svg.firstChild);
    svg.setAttribute('width', '240'); svg.setAttribute('height', '240');
    return (thumbCache[key] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg)));
  }

  function variantOf(m) { return m.variants.find((v) => v.id === state.chosen[m.id]) || m.variants[0]; }

  function buildCarousel() {
    els.models.innerHTML = MODELS.map((x) =>
      `<button class="model-card" data-id="${x.id}" aria-pressed="false" aria-label="${x.name}">
        <span class="thumb"><img alt="" width="104" height="104" decoding="async"></span>
        <span class="mname">${x.name}</span><span class="mref">${x.ref.replace('Ref. ', '')}</span></button>`).join('');
  }

  function updateCarousel() {
    let active;
    els.models.querySelectorAll('.model-card').forEach((card) => {
      const m = MODELS.find((x) => x.id === card.dataset.id);
      const on = m === state.model;
      card.classList.toggle('active', on);
      card.setAttribute('aria-pressed', on);
      const img = card.querySelector('img');
      const src = thumbURL(m, variantOf(m));
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
      if (on) active = card;
    });
    // keep the active card in view without scrolling the page itself
    if (active) {
      const t = els.models, left = active.offsetLeft - t.offsetLeft, right = left + active.offsetWidth;
      if (left < t.scrollLeft || right > t.scrollLeft + t.clientWidth) t.scrollTo({ left: left - 8, behavior: 'smooth' });
    }
    updateArrows();
  }

  function updateArrows() {
    const t = els.models;
    document.querySelector('.arrow[data-dir="-1"]').disabled = t.scrollLeft <= 2;
    document.querySelector('.arrow[data-dir="1"]').disabled = t.scrollLeft + t.clientWidth >= t.scrollWidth - 2;
  }

  buildCarousel();
  els.models.addEventListener('scroll', updateArrows, { passive: true });
  document.querySelectorAll('.carousel .arrow').forEach((a) => a.addEventListener('click', () => {
    els.models.scrollBy({ left: +a.dataset.dir * els.models.clientWidth * 0.8, behavior: 'smooth' });
  }));
  els.models.addEventListener('click', (e) => {
    const b = e.target.closest('.model-card');
    if (b) selectModel(b.dataset.id);
  });
  els.variants.addEventListener('click', (e) => {
    const b = e.target.closest('.swatch');
    if (!b) return;
    state.variant = state.model.variants.find((v) => v.id === b.dataset.id);
    render();
  });
  els.controls.addEventListener('change', (e) => {
    if (e.target.id === 'gmt-zone') state.gmtZone = e.target.value;
    if (e.target.id === 'h24-zone') state.h24Zone = e.target.value;
    tick();
  });
  els.controls.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.bezel === 'reset') { state.bezel[state.model.id] = 0; applyBezel(); click(); }
    else if (b.dataset.bezel) turnBezel(+b.dataset.bezel);
    if (b.dataset.chrono) chronoAction(b.dataset.chrono);
  });

  function setNight(on) {
    state.night = on;
    document.body.classList.toggle('night', on);
    els.lumeBtn.setAttribute('aria-pressed', on);
  }
  els.lumeBtn.addEventListener('click', () => setNight(!state.night));

  // side menu: closed by default, remembered per browser
  function setPanel(open) {
    document.body.classList.toggle('panel-collapsed', !open);
    els.panelBtn.setAttribute('aria-expanded', open);
    try { localStorage.setItem('menuOpen', open ? '1' : '0'); } catch (e) { /* storage unavailable */ }
  }
  els.panelBtn.addEventListener('click', () => setPanel(document.body.classList.contains('panel-collapsed')));
  try { if (localStorage.getItem('menuOpen') === '1') setPanel(true); } catch (e) { /* storage unavailable */ }

  // Embedded viewers often refuse full screen; fall back to an in-page focus mode.
  els.fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    const el = document.documentElement;
    if (!el.requestFullscreen) { document.body.classList.add('focus'); return; }
    el.requestFullscreen().catch(() => document.body.classList.add('focus'));
  });
  document.addEventListener('fullscreenchange', () => document.body.classList.toggle('focus', !!document.fullscreenElement));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.fullscreenElement) document.body.classList.remove('focus');
    if (e.target.matches('input, select, textarea')) return;
    const i = MODELS.indexOf(state.model);
    if (e.key === 'ArrowRight') selectModel(MODELS[(i + 1) % MODELS.length].id);
    else if (e.key === 'ArrowLeft') selectModel(MODELS[(i - 1 + MODELS.length) % MODELS.length].id);
    else if (e.key.toLowerCase() === 'l') setNight(!state.night);
    else if (e.key.toLowerCase() === 'f') els.fsBtn.click();
    else if (e.key.toLowerCase() === 'p') els.panelBtn.click();
    else if (e.key === ' ' && state.model.chrono) { e.preventDefault(); chronoAction('start'); }
  });

  function updateHash() {
    const h = `#${state.model.id}/${state.variant.id}`;
    if (location.hash !== h) history.replaceState(null, '', h);
  }
  function fromHash() {
    const [id, v] = location.hash.replace('#', '').split('/');
    if (id) { const m = MODELS.find((x) => x.id === id); if (m) { state.model = m; state.variant = m.variants.find((x) => x.id === v) || m.variants[0]; } }
  }
  window.addEventListener('hashchange', () => { fromHash(); render(); });


  // header crown mark
  $('#brand-crown').innerHTML = `<svg viewBox="-14 -1 28 32" aria-hidden="true">${R.crownMark(0, 0, 28, 'currentColor')}</svg>`;

  fromHash();
  render();
  // Fonts load after first paint; re-render so text metrics are right.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => render());
  // Redraw every display frame for a smooth sweep. Embedded previews can pause
  // requestAnimationFrame, so a slower timer takes over whenever frames stop.
  let lastFrame = 0;
  (function frame() { lastFrame = performance.now(); tick(); requestAnimationFrame(frame); })();
  setInterval(() => { if (performance.now() - lastFrame > 100) tick(); }, 40);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
})();
