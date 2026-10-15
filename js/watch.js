// Watch renderer: turns a model + dial variant into a layered SVG string.
// Coordinates: origin at the dial centre, 0deg at 12 o'clock, clockwise.
(function (global) {
  'use strict';

  /* ---------- geometry + colour helpers ---------- */
  const rad = (d) => (d * Math.PI) / 180;
  const r2 = (n) => Math.round(n * 100) / 100;
  const P = (r, a) => [r2(r * Math.sin(rad(a))), r2(-r * Math.cos(rad(a)))];
  const pts = (list) => list.map((p) => p.join(',')).join(' ');

  const hex2rgb = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16)); };
  const rgb2hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((v, i) => v + (B[i] - v) * t)); };
  const ramp = (cols, t) => {
    t = Math.max(0, Math.min(1, t));
    const n = cols.length - 1, i = Math.min(n - 1, Math.floor(t * n));
    return mix(cols[i], cols[i + 1], t * n - i);
  };

  const ring = (rIn, rOut) =>
    `M0 ${-rOut}A${rOut} ${rOut} 0 1 1 0 ${rOut}A${rOut} ${rOut} 0 1 1 0 ${-rOut}Z` +
    `M0 ${-rIn}A${rIn} ${rIn} 0 1 0 0 ${rIn}A${rIn} ${rIn} 0 1 0 0 ${-rIn}Z`;

  const sector = (rIn, rOut, a0, a1) => {
    const large = a1 - a0 > 180 ? 1 : 0;
    const [x0, y0] = P(rOut, a0), [x1, y1] = P(rOut, a1), [x2, y2] = P(rIn, a1), [x3, y3] = P(rIn, a0);
    return `M${x0} ${y0}A${rOut} ${rOut} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${rIn} ${rIn} 0 ${large} 0 ${x3} ${y3}Z`;
  };
  const arcPath = (r, a0, a1) => {
    const [x0, y0] = P(r, a0), [x1, y1] = P(r, a1);
    return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };

  /* ---------- brand marks (from the supplied artwork) ---------- */
  // Wordmark paths, native box 101.5 x 18.4 after translate(-0.9 -38.7)
  const WORDMARK = [
    'M 19.6,55.2 18.5,51.9 C 18,50.4 17.6,49.8 16.8,49 c -0.5,-0.5 -1.3,-0.7 -1.9,-0.9 2.1,-0.3 3.7,-2.2 3.7,-4.4 0,-2.4 -2,-4.4 -4.4,-4.4 0,0 -0.1,0 -0.1,0 v 0 H 7.4 3.4 1 v 1.3 H 3.4 V 55.2 H 0.9 v 1.3 h 6.4 v 0 H 9.8 V 55.2 H 7.4 v -7 h 1.9 c 0.1,0 0.1,0 0.2,0 h 0.4 c 0.6,0 1.1,0.1 1.6,0.2 0.4,0.1 0.9,0.3 1.2,0.5 0.4,0.3 0.9,0.7 1.3,1.3 0.1,0.2 0.2,0.4 0.3,0.5 0.7,1.4 1.2,3.3 1.7,5.7 h 3 v 0 h 2.7 v -1.3 z m -8,-8.3 H 7.4 v -6.3 h 4.2 c 1.8,0.1 3.2,1.3 3.2,3.1 0,1.8 -1.4,3.1 -3.2,3.2 z',
    'm 31.9,38.7 c -5.2,0 -9.3,4.2 -9.3,9.2 0,5 4.2,9.2 9.3,9.2 5.2,0 9.3,-4.2 9.3,-9.2 0,-5 -4.1,-9.2 -9.3,-9.2 z m 3.9,14.5 c -0.3,0.4 -0.7,0.8 -1.1,1.1 -0.7,0.5 -1.5,0.9 -2.3,0.9 -0.2,0 -0.3,0 -0.5,0 -0.2,0 -0.3,0 -0.5,0 -0.8,0 -1.6,-0.4 -2.3,-0.9 C 28.7,54 28.3,53.6 28,53.2 27,51.9 26.4,50 26.4,47.9 c 0,-2 0.5,-3.7 1.4,-5.1 0.5,-0.9 1.2,-1.6 2.2,-2 0,0 0,0 0,0 0,0 0.1,0 0.1,-0.1 0.1,-0.1 0.2,-0.1 0.4,-0.1 0.4,-0.1 0.9,-0.2 1.3,-0.2 0.5,0 0.9,0.1 1.3,0.2 0.1,0 0.3,0.1 0.4,0.1 0,0 0.1,0 0.1,0.1 0,0 0,0 0,0 0.9,0.4 1.7,1.1 2.2,2 0.9,1.3 1.4,3.1 1.4,5.1 0.2,2.1 -0.4,4 -1.4,5.3 z',
    'm 59.7,49.8 h -1.3 v 2.6 c 0,1.6 -1.3,2.8 -2.9,2.8 0,0 0,0 0,0 v 0 H 51.5 50 V 40.6 h 2.5 V 39.3 H 50 v 0 h -0.3 -6.2 v 1.3 H 46 v 14.6 h -2.5 v 1.3 h 14.9 1.1 0.1 0.1 v 0 0 -4.2 0 z',
    'm 79.5,39.4 v 0 h -0.1 -4 -12.9 v 1.3 H 65 v 14.6 h -2.5 v 1.3 0 h 12.9 2.9 1.1 0.1 v 0 h 0.1 v -4.2 -1.9 h -1.3 v 2 0 c 0,1.6 -1.3,2.8 -2.9,2.8 0,0 0,0 0,0 v 0 h -4.6 v 0 H 69 68.9 v -7 -0.3 h 1.3 c 0,0 0,0 0,0 H 71 v 0 c 1.2,0 2.1,1 2.1,2.1 0,0 0,0 0,0 v 0 0.7 0 0.3 h 1.2 v -0.1 -3 0 -1.1 0 -2.9 -0.1 h -1.2 v 0.8 0 c 0,0 0,0 0,0 0,1.2 -0.9,2 -2.1,2 v 0 h -0.8 -0.8 -0.5 v -6.2 h 0.1 3.7 c 0,0 0,0 0.1,0 h 2.6 c 1.6,0 2.8,1.3 2.9,2.8 v 0 1.8 h 1.3 v -1.7 z',
    'm 101.8,55.3 c -1.2,0 -1.5,-0.4 -2.5,-1.5 l -5.7,-7.1 3.8,-4.5 v 0 c 1,-1.2 1.3,-1.6 2.6,-1.6 h 0.8 0.2 V 39.3 H 100.8 97 96.8 94.1 94 v 1.3 h 0.2 1.4 v 0 c 0,0 0,0 0,0 0.3,0 0.6,0.3 0.6,0.6 0,0.1 0,0.2 -0.1,0.3 l -3.3,4 -2.8,-3.2 -0.5,-0.7 c -0.1,-0.1 -0.1,-0.2 -0.1,-0.4 0,-0.3 0.3,-0.6 0.6,-0.6 h 1.5 v -1.3 h -2.7 -3.9 -2.1 v 1.3 h 0.4 c 1.1,0.1 1.4,0.4 2.3,1.4 l 5,6.3 -4.5,5.4 v 0 c -1,1.2 -1.3,1.6 -2.6,1.6 h -0.8 -0.3 v 1.3 h 0.3 4.3 0.3 2.3 0.3 v -1.3 h -0.3 -1.6 v 0 c 0,0 0,0 0,0 -0.3,0 -0.6,-0.3 -0.6,-0.6 0,-0.1 0.1,-0.3 0.1,-0.4 l 4,-4.8 3.3,4.2 0.5,0.6 c 0.1,0.1 0.1,0.2 0.1,0.4 0,0.3 -0.3,0.6 -0.6,0.6 0,0 0,0 0,0 v 0 h -1.6 v 1.3 0 0 h 9.3 v -1.3 z',
  ];

  // Coronet vectorised from the supplied crown artwork (native coords 567..1031 x 332..838)
  const CROWN_BODY = 'M603 488L688 776C700 822 760 838 799 838C838 838 898 822 910 776L995 488L986 488L893 700L911 416L903 416L835 693L802 388L796 388L763 693L695 416L687 416L705 700L612 488Z M707 786A92 28 0 1 0 891 786A92 28 0 1 0 707 786Z';
  const CROWN_BALLS = [[597, 466], [692, 391], [799, 362], [907, 391], [1001, 466]];

  function crownMark(cx, top, w, fill, stroke) {
    const s = w / 466;
    const st = stroke ? ` stroke="${stroke}" stroke-width="${r2(0.9 / s)}"` : '';
    return `<g transform="translate(${r2(cx - 799 * s)} ${r2(top - 332 * s)}) scale(${r2(s * 10000) / 10000})" fill="${fill}"${st}>` +
      `<path fill-rule="evenodd" d="${CROWN_BODY}"/>` +
      CROWN_BALLS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="30"/>`).join('') + '</g>';
  }
  function wordmark(top, w, fill) {
    const s = w / 101.5;
    return `<g transform="translate(${r2(-w / 2)} ${top}) scale(${r2(s * 10000) / 10000}) translate(-0.9 -38.7)" fill="${fill}">` +
      WORDMARK.map((d) => `<path d="${d}"/>`).join('') + '</g>';
  }

  /* ---------- metals ---------- */
  const METALS = {
    steel:      { deep: '#3a3d41', lo: '#7a7f85', mid: '#c2c6cb', hi: '#f5f6f8' },
    whitegold:  { deep: '#46474b', lo: '#8a8c91', mid: '#d2d4d7', hi: '#fdfdfd' },
    platinum:   { deep: '#4b4f55', lo: '#90959b', mid: '#d6dadf', hi: '#ffffff' },
    yellowgold: { deep: '#5a3c0c', lo: '#a37b2b', mid: '#dfbf70', hi: '#fff2c4' },
    black:      { deep: '#000000', lo: '#0c0c0d', mid: '#262729', hi: '#5c5e62' },
  };

  function metalDefs() {
    let s = '';
    for (const [k, m] of Object.entries(METALS)) {
      s += `<linearGradient id="${k}-lin" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${m.hi}"/><stop offset=".3" stop-color="${m.mid}"/>
        <stop offset=".52" stop-color="${m.lo}"/><stop offset=".74" stop-color="${m.hi}"/>
        <stop offset="1" stop-color="${m.lo}"/></linearGradient>
      <linearGradient id="${k}-h" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="${m.lo}"/><stop offset=".28" stop-color="${m.hi}"/>
        <stop offset=".55" stop-color="${m.mid}"/><stop offset=".8" stop-color="${m.hi}"/>
        <stop offset="1" stop-color="${m.lo}"/></linearGradient>
      <linearGradient id="${k}-v" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="${m.lo}"/><stop offset=".3" stop-color="${m.hi}"/>
        <stop offset=".6" stop-color="${m.mid}"/><stop offset="1" stop-color="${m.deep}"/></linearGradient>
      <linearGradient id="${k}-facet" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="${m.hi}"/><stop offset=".49" stop-color="${m.mid}"/>
        <stop offset=".51" stop-color="${m.lo}"/><stop offset="1" stop-color="${mix(m.lo, m.mid, 0.5)}"/></linearGradient>
      <radialGradient id="${k}-rad" cx=".36" cy=".3" r=".9">
        <stop offset="0" stop-color="${m.hi}"/><stop offset=".45" stop-color="${m.mid}"/>
        <stop offset=".8" stop-color="${m.lo}"/><stop offset="1" stop-color="${m.deep}"/></radialGradient>`;
    }
    return s;
  }

  /* ---------- case, crown, pushers ---------- */
  function caseBody(metal, opts) {
    const m = METALS[metal];
    let s = '';
    const lug = (sx, sg) => {
      const X = (x) => r2(sx * x), Y = (y) => r2(sg * y);
      return `<path d="M${X(158)} ${Y(118)}C${X(156)} ${Y(186)} ${X(145)} ${Y(226)} ${X(130)} ${Y(254)}Q${X(116)} ${Y(263)} ${X(100)} ${Y(254)}C${X(98)} ${Y(226)} ${X(99)} ${Y(200)} ${X(103)} ${Y(170)}Z" fill="url(#${metal}-lin)" stroke="${m.deep}" stroke-width="1.2"/>` +
        `<path d="M${X(149)} ${Y(160)}C${X(147)} ${Y(200)} ${X(138)} ${Y(228)} ${X(125)} ${Y(249)}" fill="none" stroke="${m.hi}" stroke-width="2.6" opacity="${sx < 0 ? 0.85 : 0.55}"/>` +
        `<path d="M${X(130)} ${Y(254)}Q${X(116)} ${Y(263)} ${X(100)} ${Y(254)}" fill="none" stroke="${m.deep}" stroke-width="1.6" opacity=".7"/>`;
    };
    s += lug(-1, -1) + lug(1, -1) + lug(-1, 1) + lug(1, 1);
    s += `<circle r="208" fill="url(#${metal}-rad)" stroke="${m.deep}" stroke-width="1.4"/>`;
    s += `<circle r="204" fill="none" stroke="${m.hi}" stroke-width="1" opacity=".5"/>`;
    return s;
  }

  function crownAssembly(metal, guards) {
    const m = METALS[metal];
    let s = '';
    if (guards) {
      s += `<path d="M196 -50C216 -48 228 -36 227 -22L227 22C228 36 216 48 196 50Z" fill="url(#${metal}-v)" stroke="${m.deep}" stroke-width="1.2"/>`;
    }
    const x0 = guards ? 216 : 205, w = 27, h = 46;
    s += `<rect x="${x0 - 8}" y="-12" width="12" height="24" fill="url(#${metal}-v)" stroke="${m.deep}" stroke-width=".8"/>`;
    s += `<rect x="${x0}" y="${-h / 2}" width="${w}" height="${h}" rx="5" fill="url(#${metal}-v)" stroke="${m.deep}" stroke-width="1.1"/>`;
    // knurled grip: ridges run along the crown axis, bunching toward the edges
    for (let i = 1; i < 18; i++) {
      const y = r2((h / 2 - 2) * Math.sin(-Math.PI / 2 + (Math.PI * i) / 18));
      s += `<line x1="${x0 + 4}" x2="${x0 + w - 2}" y1="${y}" y2="${y}" stroke="${i % 2 ? m.deep : m.hi}" stroke-width=".7" opacity=".55"/>`;
    }
    s += `<rect x="${x0 + w - 4}" y="${-h / 2 + 2}" width="4" height="${h - 4}" rx="2" fill="${m.lo}" opacity=".7"/>`;
    return s;
  }

  function pushers(metal) {
    const m = METALS[metal];
    return [[58, 'start'], [122, 'reset']].map(([a, act]) =>
      `<g class="pusher" data-action="${act}" transform="rotate(${a})">
        <rect x="-15" y="-238" width="30" height="34" fill="transparent"/>
        <rect x="-11" y="-226" width="22" height="22" rx="2" fill="url(#${metal}-h)" stroke="${m.deep}" stroke-width="1"/>
        ${[...Array(7)].map((_, i) => `<line x1="${-9 + i * 3}" x2="${-9 + i * 3}" y1="-224" y2="-206" stroke="${m.deep}" stroke-width=".6" opacity=".5"/>`).join('')}
        <rect class="pusher-btn" x="-7.5" y="-238" width="15" height="13" rx="3" fill="url(#${metal}-h)" stroke="${m.deep}" stroke-width="1"/>
      </g>`).join('');
  }

  /* ---------- bezels ---------- */
  function flutedBezel(metal, rIn, rOut, n) {
    const m = METALS[metal];
    const tones = [m.deep, m.lo, m.mid, m.hi];
    const L = [-0.62, -0.78]; // light from upper left
    let s = '';
    const step = 360 / n;
    for (let i = 0; i < n; i++) {
      const a0 = i * step, a1 = a0 + step / 2, a2 = a0 + step;
      const mid = rad(a1);
      const t = [Math.cos(mid), Math.sin(mid)];
      const rOutV = [Math.sin(mid), -Math.cos(mid)];
      [[a0, a1, -1], [a1, a2, 1]].forEach(([b0, b1, side]) => {
        const nx = side * t[0] * 0.85 + rOutV[0] * 0.35, ny = side * t[1] * 0.85 + rOutV[1] * 0.35;
        const b = 0.5 + 0.55 * (nx * L[0] + ny * L[1]);
        s += `<polygon points="${pts([P(rIn, b0), P(rOut, b0), P(rOut, b1), P(rIn, b1)])}" fill="${ramp(tones, b)}"/>`;
      });
      s += `<line x1="${P(rIn + 1, a1)[0]}" y1="${P(rIn + 1, a1)[1]}" x2="${P(rOut, a1)[0]}" y2="${P(rOut, a1)[1]}" stroke="${m.hi}" stroke-width=".5" opacity=".6"/>`;
    }
    s += `<path d="${ring(rIn, rOut)}" fill-rule="evenodd" fill="url(#bezelShade)"/>`;
    s += `<circle r="${rOut}" fill="none" stroke="${m.deep}" stroke-width="1.2"/><circle r="${rIn}" fill="none" stroke="${m.deep}" stroke-width="1"/>`;
    return s;
  }

  function smoothBezel(metal, rIn, rOut) {
    const m = METALS[metal];
    return `<path d="${ring(rIn, rOut)}" fill-rule="evenodd" fill="url(#${metal}-lin)"/>` +
      `<path d="${ring(rIn, rOut)}" fill-rule="evenodd" fill="url(#bezelShade)"/>` +
      `<circle r="${rOut}" fill="none" stroke="${m.deep}" stroke-width="1.2"/><circle r="${rIn}" fill="none" stroke="${m.deep}" stroke-width="1"/>`;
  }

  // Outer metal edge used by insert bezels. Rotating bezels get coin-edge knurling.
  function bezelEdge(metal, knurl) {
    const m = METALS[metal];
    let s = `<path d="${ring(194, 202)}" fill-rule="evenodd" fill="url(#${metal}-lin)"/>`;
    if (knurl) {
      for (let i = 0; i < 180; i++) {
        const [x1, y1] = P(198.5, i * 2), [x2, y2] = P(202, i * 2);
        s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${m.deep}" stroke-width=".7" opacity=".55"/>`;
      }
    }
    return s + `<circle r="202" fill="none" stroke="${m.deep}" stroke-width="1.2"/>`;
  }

  const insertGloss = (rIn, rOut) => `<path d="${ring(rIn, rOut)}" fill-rule="evenodd" fill="url(#ceramicGloss)"/>`;
  const radialText = (a, r, txt, size, fill, extra = '') =>
    `<text transform="rotate(${r2(a)}) translate(0 ${-r})" font-size="${size}" fill="${fill}" class="bz" ${extra}>${txt}</text>`;

  function subInsert(ins, lumeBezel, lumeColor) {
    let s = `<path d="${ring(170, 194)}" fill-rule="evenodd" fill="${ins.color}"/>`;
    s += insertGloss(170, 194);
    const pr = `url(#printGrad)`;
    for (let i = 0; i < 60; i++) {
      const a = i * 6;
      if (i === 0) {
        s += `<polygon points="${pts([P(192.5, -5.4), P(192.5, 5.4), P(174.5, 0)])}" fill="${pr}"/>`;
        s += `<circle cx="0" cy="-185.5" r="3.9" fill="url(#whitegold-lin)"/>`;
        const pip = `<circle class="lume" cx="0" cy="-185.5" r="3" fill="${lumeColor}"/>`;
        s += pip; lumeBezel.push(pip);
      } else if (i % 10 === 0) {
        s += radialText(a, 182.2, i, 15, pr);
      } else if (i % 5 === 0) {
        s += `<rect transform="rotate(${a})" x="-2.2" y="-191" width="4.4" height="15" fill="${pr}"/>`;
      } else if (i < 15) {
        s += `<rect transform="rotate(${a})" x="-.75" y="-191" width="1.5" height="8" fill="${pr}"/>`;
      }
    }
    return s;
  }

  function gmtInsert(ins) {
    let s = `<path d="${sector(170, 194, -90, 90)}" fill="${ins.top}"/><path d="${sector(170, 194, 90, 270)}" fill="${ins.bottom}"/>`;
    s += insertGloss(170, 194);
    const pr = `url(#printGrad)`;
    for (let h = 0; h < 24; h++) {
      const a = h * 15;
      if (h === 0) s += `<polygon points="${pts([P(192.5, -6), P(192.5, 6), P(173.5, 0)])}" fill="${pr}"/>`;
      else if (h % 2 === 0) s += radialText(a, 182.2, h, 14, pr);
      else s += `<polygon transform="rotate(${a})" points="-2.6,-190 2.6,-190 0,-182" fill="${pr}"/>`;
    }
    return s;
  }

  function tachyInsert() {
    let s = `<path d="${ring(170, 194)}" fill-rule="evenodd" fill="#111214"/>` + insertGloss(170, 194);
    const pr = `url(#printGrad)`;
    const nums = [400, 300, 250, 200, 180, 150, 140, 130, 120, 110, 100, 90, 85, 80, 75, 70, 65, 60];
    const ticks = [500, 450, 350, 275, 225, 190, 170, 160, 95];
    nums.concat(ticks).forEach((v) => {
      const a = (3600 / v) * 6;
      s += `<rect transform="rotate(${r2(a)})" x="-.6" y="-193.5" width="1.2" height="4.5" fill="${pr}"/>`;
    });
    nums.forEach((v) => { s += radialText((3600 / v) * 6, 182.2, v, v >= 100 ? 9.6 : 10.6, pr); });
    s += `<path id="uphArc" d="${arcPath(181, 6, 46)}" fill="none"/>`;
    s += `<text font-size="7.2" fill="${pr}" class="bz" letter-spacing="1"><textPath href="#uphArc" startOffset="50%" text-anchor="middle" dominant-baseline="central">UNITS PER HOUR</textPath></text>`;
    return s;
  }

  function fixed24Bezel() {
    let s = smoothBezel('steel', 170, 202);
    const ink = '#1b1c1e';
    for (let h = 0; h < 24; h++) {
      const a = h * 15;
      if (h === 0) s += `<polygon points="${pts([P(197, -6), P(197, 6), P(178, 0)])}" fill="${ink}"/>`;
      else if (h % 2 === 0) s += radialText(a, 186, h, 14, ink, 'font-weight="600"');
      else s += `<rect transform="rotate(${a})" x="-1.4" y="-196" width="2.8" height="9" fill="${ink}"/>`;
    }
    return s;
  }

  /* ---------- dial furniture ---------- */
  function minuteTrack(style, color, skipSix) {
    let s = '';
    const skip = (i) => skipSix && i >= 29 && i <= 31;
    if (style === 'rail') {
      const arcs = skipSix ? `<path d="${arcPath(152.5, 186, 534)}"/><path d="${arcPath(158.2, 186, 534)}"/>` : `<circle r="152.5"/><circle r="158.2"/>`;
      s += `<g fill="none" stroke="${color}" stroke-width=".55" opacity=".85">${arcs}</g>`;
      for (let i = 0; i < 60; i++) {
        if (skip(i)) continue;
        s += `<rect transform="rotate(${i * 6})" x="${i % 5 ? -0.4 : -0.75}" y="-158.2" width="${i % 5 ? 0.8 : 1.5}" height="5.7" fill="${color}"/>`;
      }
    } else if (style === 'ticks') {
      for (let i = 0; i < 60; i++) {
        if (skip(i)) continue;
        s += `<rect transform="rotate(${i * 6})" x="-.5" y="-159" width="1" height="6.5" fill="${color}"/>`;
      }
    } else if (style === 'fine') {
      s += `<circle r="158.5" fill="none" stroke="${color}" stroke-width=".5"/>`;
      for (let i = 0; i < 240; i++) {
        if (skipSix && i >= 116 && i <= 124) continue;
        const major = i % 4 === 0;
        s += `<rect transform="rotate(${i * 1.5})" x="${major ? -0.5 : -0.2}" y="-158.5" width="${major ? 1 : 0.4}" height="${major ? 6.5 : 3}" fill="${color}"/>`;
      }
    }
    return s;
  }

  function indices(model, v, lumeStatic) {
    const style = v.indices || model.indices;
    const metal = v.idx || 'whitegold';
    const facet = `url(#${metal}-facet)`;
    const lin = `url(#${metal}-lin)`;
    const lume = v.lume || '#f1efe6';
    const skip = (i) => (model.date && i === 3) || (model.day && i === 0) ||
      (model.chrono && (i === 3 || i === 9 || i === 6));
    const L = (str) => { lumeStatic.push(str); return str; };
    let s = '';

    for (let i = 0; i < 12; i++) {
      if (skip(i)) continue;
      const a = i * 30;
      if (style === 'baton' || style === 'daytona') {
        const rI = style === 'daytona' ? 129 : 116, rO = 149.5, w = style === 'daytona' ? 6 : 9.2;
        const xs = i === 0 ? [-5.2, 5.2] : [0];
        xs.forEach((x) => {
          s += `<g transform="rotate(${a})"><rect x="${x - w / 2 - 0.6}" y="${-rO - 0.6}" width="${w + 1.2}" height="${rO - rI + 1.2}" fill="rgba(0,0,0,.35)" transform="translate(.8 1.4)"/>` +
            `<rect x="${x - w / 2}" y="${-rO}" width="${w}" height="${rO - rI}" fill="${facet}" stroke="${METALS[metal].deep}" stroke-width=".4"/>` +
            L(`<rect class="lume" transform="rotate(${a})" x="${r2(x - w * 0.22)}" y="${-rO + 2.2}" width="${r2(w * 0.44)}" height="${r2((rO - rI) * 0.48)}" rx=".6" fill="${lume}"/>`).replace(`transform="rotate(${a})" `, '') + '</g>';
        });
      } else if (style === 'roman') {
        const num = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'][i];
        const nf = v.numeral || {};
        const fill = nf.metal ? `url(#${nf.metal}-lin)` : nf.fill;
        const stroke = nf.metal ? METALS[nf.metal].deep : nf.stroke;
        s += `<g transform="rotate(${a}) translate(0 -134) scale(.78 1)">` +
          `<text class="roman" font-size="23" fill="rgba(0,0,0,.35)" transform="translate(.9 1.4)">${num}</text>` +
          `<text class="roman" font-size="23" fill="${fill}" stroke="${stroke}" stroke-width="${nf.metal ? 0.4 : 0.7}">${num}</text></g>`;
      } else if (style === 'dots' || style === 'explorer') {
        const surround = `url(#${metal}-lin)`;
        const deep = METALS[metal].deep;
        if (i === 0) {
          s += `<polygon points="-14.8,-152 14.8,-152 0,-119" fill="${surround}" stroke="${deep}" stroke-width=".5"/>`;
          s += L(`<polygon class="lume" points="-11.6,-149.6 11.6,-149.6 0,-124.2" fill="${lume}"/>`);
        } else if (style === 'explorer' && i % 3 === 0) {
          const [x, y] = P(129, a);
          const t = `x="${x}" y="${y}" class="explorer-num" font-size="35"`;
          s += `<text ${t} fill="rgba(0,0,0,.4)" transform="translate(.9 1.6)">${i}</text>`;
          s += L(`<text class="lume explorer-num" x="${x}" y="${y}" font-size="35" fill="${lume}">${i}</text>`);
          s += `<text ${t} fill="none" stroke="${surround}" stroke-width="1.7">${i}</text>`;
        } else if (style === 'explorer') {
          s += `<g transform="rotate(${a})"><rect x="-4.8" y="-151" width="9.6" height="29" fill="${surround}" stroke="${deep}" stroke-width=".5"/></g>`;
          s += L(`<rect class="lume" transform="rotate(${a})" x="-3.2" y="-149.4" width="6.4" height="25.8" fill="${lume}"/>`);
        } else if (i === 6 || i === 9 || i === 3) {
          s += `<g transform="rotate(${a})"><rect x="-6.6" y="-151.5" width="13.2" height="31.5" rx="1" fill="${surround}" stroke="${deep}" stroke-width=".5"/></g>`;
          s += L(`<rect class="lume" transform="rotate(${a})" x="-4.9" y="-149.8" width="9.8" height="28.1" fill="${lume}"/>`);
        } else {
          const [x, y] = P(137, a);
          s += `<circle cx="${x}" cy="${y}" r="10.2" fill="${surround}" stroke="${deep}" stroke-width=".5"/>`;
          s += L(`<circle class="lume" cx="${x}" cy="${y}" r="8.2" fill="${lume}"/>`);
        }
      }
    }
    return s;
  }

  function dialText(model, v) {
    const t = model.text;
    const txt = v.text, acc = v.accent || v.text;
    const K = 1.18;
    let s = crownMark(0, t.crown.y, t.crown.w * K, `url(#${v.idx || 'whitegold'}-lin)`, METALS[v.idx || 'whitegold'].deep);
    s += wordmark(t.word.y, t.word.w * K, txt);
    [...t.top, ...t.bottom].forEach((l) => {
      s += `<text class="${l.plain ? 'dialtxt plain' : 'dialtxt'}" x="0" y="${l.y}" font-size="${r2(l.s * K)}" fill="${l.c === 'accent' ? acc : txt}">${l.t}</text>`;
    });
    // SWISS [crown] MADE at six
    s += `<text class="dialtxt small" x="-6.5" y="155.4" font-size="3.6" style="text-anchor:end" fill="${txt}">SWISS</text>`;
    s += crownMark(0, 152.6, 5.2, txt);
    s += `<text class="dialtxt small" x="6.5" y="155.4" font-size="3.6" style="text-anchor:start" fill="${txt}">MADE</text>`;
    return s;
  }

  function dateWindow(metal) {
    const m = METALS[metal];
    return `<g transform="translate(123 0)">
      <rect x="-14.2" y="-11.2" width="28.4" height="22.4" rx="1.6" fill="url(#${metal}-lin)" stroke="${m.deep}" stroke-width=".6"/>
      <rect x="-12.4" y="-9.4" width="24.8" height="18.8" fill="#fbfaf6"/>
      <g clip-path="url(#lensClip)">
        <rect x="-20" y="-16" width="40" height="32" fill="#fdfcf8"/>
        <text id="date-text" class="datefont" x="0" y="1.5" font-size="27" fill="#101010">1</text>
      </g>
    </g>`;
  }
  const cyclops = () => `<g transform="translate(123 0)" class="cyclops">
      <rect x="-19" y="-15" width="38" height="30" rx="8" fill="url(#lensGrad)" stroke="rgba(255,255,255,.55)" stroke-width=".8"/>
      <rect x="-17.4" y="-13.4" width="34.8" height="26.8" rx="6.6" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="1"/>
      <path d="M-14 -11.6 Q0 -14.4 14 -11.6" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="1.1" stroke-linecap="round"/>
    </g>`;

  function dayWindow(metal) {
    const m = METALS[metal];
    return `<path d="${sector(114.5, 140.5, -26.5, 26.5)}" fill="url(#${metal}-lin)" stroke="${m.deep}" stroke-width=".6"/>
      <path d="${sector(116.5, 138.5, -25, 25)}" fill="#fbfaf6"/>
      <path id="dayArc" d="${arcPath(127.5, -40, 40)}" fill="none"/>
      <text class="datefont day" font-size="10.4" fill="#111" letter-spacing=".6"><textPath id="day-text" href="#dayArc" startOffset="50%" text-anchor="middle" dominant-baseline="central">MONDAY</textPath></text>`;
  }

  function subdials(v) {
    const sd = v.sub;
    const defs = [
      { cx: 72, cy: 0, kind: 'min', marks: 30, nums: [[10, 120], [20, 240], [30, 0]] },
      { cx: 0, cy: 72, kind: 'hr', marks: 12, nums: [[3, 90], [6, 180], [9, 270], [12, 0]] },
      { cx: -72, cy: 0, kind: 'sec', marks: 60, nums: [[20, 120], [40, 240], [60, 0]] },
    ];
    let s = '', hands = '';
    defs.forEach((d) => {
      s += `<g transform="translate(${d.cx} ${d.cy})">`;
      s += `<circle r="35" fill="${sd.fill}"/>`;
      s += `<circle r="35" fill="url(#azurage)"/>`;
      s += `<circle r="35" fill="none" stroke="${sd.ring}" stroke-width="2.2"/>`;
      for (let i = 0; i < d.marks; i++) {
        const big = d.kind === 'hr' || i % (d.kind === 'min' ? 5 : 5) === 0;
        s += `<rect transform="rotate(${r2((i * 360) / d.marks)})" x="${big ? -0.55 : -0.3}" y="-33" width="${big ? 1.1 : 0.6}" height="${big ? 5 : 3}" fill="${sd.print}"/>`;
      }
      d.nums.forEach(([n, a]) => {
        const [x, y] = P(21.5, a);
        s += `<text class="subnum" x="${x}" y="${y}" font-size="7.2" fill="${sd.print}">${n}</text>`;
      });
      s += '</g>';
      hands += `<g filter="url(#handShadowSm)"><g data-hand="sub-${d.kind}" data-cx="${d.cx}" data-cy="${d.cy}" transform="translate(${d.cx} ${d.cy})">
        <polygon points="-1.7,7 -1.1,-27 0,-31 1.1,-27 1.7,7" fill="${sd.hand}"/>
        <circle r="2.8" fill="${sd.hand}"/></g></g>`;
    });
    return { s, hands };
  }

  /* ---------- hands ---------- */
  // Each hand returns base markup plus a lume-only copy (and occluders) for night mode.
  function batonHand(len, w, tail, lumeFrom, lumeTo, metal, lume) {
    const body = `<polygon points="${pts([[-w / 2, tail], [-w / 2, -len + w], [0, -len], [w / 2, -len + w], [w / 2, tail]])}" fill="url(#${metal}-facet)" stroke="${METALS[metal].deep}" stroke-width=".4"/>`;
    const lw = w * 0.46;
    const l = `<rect class="lume" x="${r2(-lw / 2)}" y="${-lumeTo}" width="${r2(lw)}" height="${lumeTo - lumeFrom}" rx="${r2(lw / 2)}" fill="${lume}"/>`;
    return { base: body + l, lume: l, occl: '' };
  }

  function mercedesHour(metal, lume) {
    const dp = METALS[metal].deep, f = `url(#${metal}-facet)`;
    const body = `<polygon points="-4,15 -4.6,-44 4.6,-44 4,15" fill="${f}" stroke="${dp}" stroke-width=".4"/>` +
      `<polygon points="-7.5,-66 0,-87 7.5,-66" fill="${f}" stroke="${dp}" stroke-width=".4"/>`;
    const l = `<rect class="lume" x="-2.4" y="-42" width="4.8" height="24" rx="1.2" fill="${lume}"/>` +
      `<circle class="lume" cx="0" cy="-56" r="11.2" fill="${lume}"/>` +
      `<polygon class="lume" points="-4.4,-67.5 0,-81 4.4,-67.5" fill="${lume}"/>`;
    const over = `<circle cx="0" cy="-56" r="12.2" fill="none" stroke="${f}" stroke-width="2.6"/>` +
      [0, 120, 240].map((a) => `<rect transform="translate(0 -56) rotate(${a})" x="-1.1" y="-11.5" width="2.2" height="11.5" fill="${f}"/>`).join('') +
      `<circle cx="0" cy="-56" r="2" fill="${f}"/>`;
    return { base: body + l + over, lume: l, occl: over };
  }

  function swordMinute(metal, lume) {
    const body = `<polygon points="-3.4,20 -5.2,-128 0,-151 5.2,-128 3.4,20" fill="url(#${metal}-facet)" stroke="${METALS[metal].deep}" stroke-width=".4"/>`;
    const l = `<polygon class="lume" points="-2.2,-22 -3.4,-127 0,-142 3.4,-127 2.2,-22" fill="${lume}"/>`;
    return { base: body + l, lume: l, occl: '' };
  }

  function secondsHand(kind, metal, lume, color) {
    const f = color || `url(#${metal}-lin)`;
    let base = `<rect x="-.95" y="-152" width="1.9" height="186" fill="${f}"/><circle cx="0" cy="26" r="4.4" fill="${f}"/>`;
    let l = '';
    if (kind === 'lollipop') {
      base += `<circle cx="0" cy="-112" r="5.6" fill="${f}"/>`;
      l = `<circle class="lume" cx="0" cy="-112" r="4.3" fill="${lume}"/>`;
      base += l;
    }
    base += `<circle r="4.2" fill="${f}"/><circle r="1.4" fill="${METALS[metal].deep}"/>`;
    return { base, lume: l, occl: '' };
  }

  function arrowHand(color, metal, lume, len = 128) {
    const dp = METALS[metal].deep;
    const base = `<rect x="-1.2" y="${-len}" width="2.4" height="${len + 8}" fill="${color}"/>` +
      `<polygon points="-9,${-len + 4} 0,${-len - 19} 9,${-len + 4}" fill="${color}" stroke="${dp}" stroke-width=".6"/>`;
    const l = `<polygon class="lume" points="-4.6,${-len + 1} 0,${-len - 11} 4.6,${-len + 1}" fill="${lume}"/>`;
    return { base: base + l + `<circle r="5" fill="${color}"/>`, lume: l, occl: '' };
  }

  function handGroup(id, h) {
    return `<g filter="url(#handShadow)"><g data-hand="${id}">${h.base}</g></g>`;
  }
  function handLumeGroup(id, h) {
    if (!h.lume) return '';
    return `<g data-hand="${id}">${h.lume}${h.occl ? `<g class="occl">${h.occl}</g>` : ''}</g>`;
  }

  /* ---------- dial surface ---------- */
  function sunburstCSS(base) {
    // conic sheen with two bright lobes on the light axis + fine radial brushing
    const stops = [];
    for (let a = 0; a <= 360; a += 7.5) {
      const v = Math.cos(rad(2 * (a - 315)));
      const c = v > 0 ? `rgba(255,255,255,${(0.34 * Math.pow(v, 2.4)).toFixed(3)})` : `rgba(0,0,0,${(0.28 * Math.pow(-v, 1.6)).toFixed(3)})`;
      stops.push(`${c} ${a}deg`);
    }
    return `background:conic-gradient(${stops.join(',')}), ${base};`;
  }

  /* ---------- assemble ---------- */
  function build(model, variant) {
    const v = variant;
    const caseMetal = v.case || model.case;
    const handMetal = v.hands || 'whitegold';
    const lume = v.lume || '#f1efe6';
    const lumeStatic = [], lumeBezel = [];
    const dial = v.dial;
    const textCol = v.text;
    const trackCol = v.track || textCol;
    const bezelType = model.bezel.type;
    const scale = model.handScale || 1;

    const defs = `<defs>
      ${metalDefs()}
      <radialGradient id="bezelShade" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="202">
        <stop offset=".83" stop-color="#000" stop-opacity=".35"/><stop offset=".9" stop-color="#000" stop-opacity="0"/>
        <stop offset=".96" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>
      <linearGradient id="ceramicGloss" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".35" stop-color="#fff" stop-opacity=".03"/>
        <stop offset=".65" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity=".08"/></linearGradient>
      <linearGradient id="printGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fafafa"/><stop offset=".5" stop-color="${(v.insert && v.insert.print) || '#e2e2dc'}"/><stop offset="1" stop-color="#b9b9b4"/></linearGradient>
      <radialGradient id="dialGrad" gradientUnits="userSpaceOnUse" cx="-20" cy="-30" r="190">
        <stop offset="0" stop-color="${mix(dial.base, '#ffffff', 0.04)}"/><stop offset=".55" stop-color="${dial.base}"/>
        <stop offset="1" stop-color="${dial.edge}"/></radialGradient>
      <radialGradient id="dialVignette" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="162">
        <stop offset=".78" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".32"/></radialGradient>
      <radialGradient id="dialGloss" gradientUnits="userSpaceOnUse" cx="-55" cy="-75" r="150">
        <stop offset="0" stop-color="#fff" stop-opacity=".13"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <radialGradient id="azurage" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="35" spreadMethod="repeat" fx="0" fy="0">
        <stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".02" stop-color="#fff" stop-opacity=".07"/><stop offset=".04" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <linearGradient id="rehautGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${mix(dial.edge, '#ffffff', 0.25)}"/><stop offset=".5" stop-color="${mix(dial.edge, '#000000', 0.15)}"/>
        <stop offset="1" stop-color="${mix(dial.edge, '#ffffff', 0.12)}"/></linearGradient>
      <linearGradient id="lensGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity=".04"/>
        <stop offset="1" stop-color="#bfe0ff" stop-opacity=".12"/></linearGradient>
      <clipPath id="lensClip"><rect x="-18" y="-14" width="36" height="28" rx="7"/></clipPath>
      <radialGradient id="glare" gradientUnits="userSpaceOnUse" cx="-70" cy="-110" r="230">
        <stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".5" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <filter id="handShadow" filterUnits="userSpaceOnUse" x="-260" y="-260" width="520" height="520">
        <feDropShadow dx="2.6" dy="4.2" stdDeviation="2.2" flood-color="#000" flood-opacity=".5"/></filter>
      <filter id="handShadowSm" filterUnits="userSpaceOnUse" x="-260" y="-260" width="520" height="520">
        <feDropShadow dx="1" dy="1.6" stdDeviation="1" flood-color="#000" flood-opacity=".45"/></filter>
      <filter id="caseShadow" filterUnits="userSpaceOnUse" x="-300" y="-500" width="600" height="1000">
        <feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#000" flood-opacity=".55"/></filter>
      <filter id="lumeGlow" filterUnits="userSpaceOnUse" x="-260" y="-260" width="520" height="520">
        <feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>`;

    let out = `<svg class="watch-svg" viewBox="-262 -282 524 564" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${model.name} watch face showing the current local time">`;
    out += defs;


    // 2. case + crown + pushers
    out += `<g filter="url(#caseShadow)">`;
    if (model.pushers) out += pushers(caseMetal);
    out += crownAssembly(caseMetal, model.guards);
    out += caseBody(caseMetal, {});
    out += `</g>`;

    // 3. bezel
    const bm = v.bezelMetal || model.bezel.metal || caseMetal;
    if (bezelType === 'fluted') out += flutedBezel(bm, 170, 202, 64);
    else if (bezelType === 'smooth') out += smoothBezel(caseMetal, 176, 202);
    else if (bezelType === 'fixed24') out += fixed24Bezel();
    else {
      let insert = '';
      if (bezelType === 'sub') insert = subInsert(v.insert, lumeBezel, lume);
      else if (bezelType === 'gmt') insert = gmtInsert(v.insert);
      else if (bezelType === 'tachy') insert = tachyInsert();
      out += `<g id="bezel-rot" data-bezel>${bezelEdge(caseMetal, !!model.bezel.rotate)}${insert}</g>`;
    }

    // 4. rehaut with engraving
    const rehautR = bezelType === 'smooth' ? 176 : 170;
    out += `<path d="${ring(161.5, rehautR)}" fill-rule="evenodd" fill="url(#rehautGrad)"/>`;
    for (let i = 0; i < 12; i++) {
      const a = i * 30 + 15;
      out += `<text class="rehaut" transform="rotate(${a}) translate(0 ${-(161.5 + rehautR) / 2})" font-size="5.4" fill="${mix(dial.edge, '#ffffff', 0.55)}" opacity=".7">ROLEX</text>`;
    }
    out += `<g opacity=".7">${crownMark(0, 162.6, 6, mix(dial.edge, '#ffffff', 0.55)).replace('<g ', '<g data-x ')}</g>`;

    // 5. dial
    out += `<g clip-path="url(#dialClip)"><clipPath id="dialClip"><circle r="161.5"/></clipPath>`;
    out += `<circle r="161.5" fill="url(#dialGrad)"/>`;
    if (dial.sunburst) {
      out += `<foreignObject x="-161.5" y="-161.5" width="323" height="323"><div xmlns="http://www.w3.org/1999/xhtml" class="sunburst" style="${sunburstCSS('transparent')}"></div></foreignObject>`;
    }
    if (dial.gloss) out += `<ellipse cx="-40" cy="-60" rx="150" ry="120" fill="url(#dialGloss)"/>`;
    out += `<circle r="161.5" fill="url(#dialVignette)"/>`;
    out += minuteTrack(model.track, trackCol, true);
    out += dialText(model, v);
    if (model.chrono) {
      var sub = subdials(v);
      out += sub.s;
    }
    out += indices(model, v, lumeStatic);
    if (model.date) out += dateWindow(v.idx || 'whitegold');
    if (model.day) out += dayWindow(v.idx || 'whitegold');
    out += `</g>`;

    // 6. hands
    const H = {};
    const hm = handMetal;
    if (model.gmt || model.h24) H.gmt = arrowHand(v.gmtHand || '#c62430', hm, lume, model.h24 ? 132 : 128);
    if (model.hands === 'mercedes') { H.hour = mercedesHour(hm, lume); H.hour.base = `<g transform="scale(1.12)">${H.hour.base}</g>`; H.hour.lume = `<g transform="scale(1.12)">${H.hour.lume}</g>`; H.hour.occl = `<g transform="scale(1.12)">${H.hour.occl}</g>`; H.minute = swordMinute(hm, lume); }
    else {
      H.hour = batonHand(94 * scale, 9.6, 16, 30 * scale, 82 * scale, hm, lume);
      H.minute = batonHand(147 * scale, 7.6, 20, 34 * scale, 136 * scale, hm, lume);
    }
    H.second = secondsHand(model.seconds === 'lollipop' ? 'lollipop' : 'plain', hm, lume);

    if (sub) out += sub.hands;
    const order = ['gmt', 'hour', 'minute'];
    order.forEach((k) => { if (H[k]) out += handGroup(k, H[k]); });
    out += handGroup(model.chrono ? 'chrono' : 'second', H.second);
    out += `<circle r="2.2" fill="${METALS[hm].deep}"/>`;

    // 7. night: dim everything, then re-draw luminescent parts glowing
    // dim layer follows the watch silhouette so the page background is untouched
    const silhouette = (model.pushers ? pushers(caseMetal) : '') + crownAssembly(caseMetal, model.guards) + caseBody(caseMetal, {});
    out += `<g class="night-dim">${silhouette.replace(/class="pusher[^"]*"/g, '')}</g>`;
    out += `<g class="lume-layer" filter="url(#lumeGlow)">`;
    out += lumeStatic.join('');
    if (lumeBezel.length) out += `<g data-bezel>${lumeBezel.join('')}</g>`;
    order.forEach((k) => { if (H[k]) out += handLumeGroup(k, H[k]); });
    if (!model.chrono) out += handLumeGroup('second', H.second);
    out += `</g>`;

    // 8. crystal: cyclops + glare + laser-etched crown at six
    if (model.date) out += cyclops();
    out += `<circle class="glare" r="170" fill="url(#glare)" pointer-events="none"/>`;
    out += `<g opacity=".16" pointer-events="none">${crownMark(0, 140.5, 5.4, '#ffffff')}</g>`;

    // bezel hit target
    if (model.bezel.rotate) out += `<path class="bezel-hit" d="${ring(170, 204)}" fill-rule="evenodd" fill="transparent"/>`;

    out += `</svg>`;
    return out;
  }

  global.WatchRenderer = { build, crownMark, wordmark, METALS };
})(window);
