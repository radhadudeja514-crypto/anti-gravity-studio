/**
 * loader.js
 * ─────────────────────────────────────────────────────
 * Cinematic loading screen overlay.
 * Self-injects DOM elements and CSS styles.
 * Plays a progress animation then dissolves to reveal page.
 * ─────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Inject Styles ───────────────────────────────── */
  var css = [
    '#page-loader {',
    '  position: fixed;',
    '  top: 0; left: 0;',
    '  width: 100%; height: 100%;',
    '  background: #000;',
    '  z-index: 99999;',
    '  display: flex;',
    '  flex-direction: column;',
    '  align-items: center;',
    '  justify-content: center;',
    '  transition: opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1), transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);',
    '  will-change: opacity, transform;',
    '}',
    '#page-loader.loader-exit {',
    '  opacity: 0;',
    '  transform: scale(1.08);',
    '  pointer-events: none;',
    '}',
    '',
    '.loader-logo {',
    '  font-family: "Inter", "Segoe UI", system-ui, sans-serif;',
    '  font-size: 3.2rem;',
    '  font-weight: 800;',
    '  letter-spacing: -1px;',
    '  color: #fff;',
    '  user-select: none;',
    '  position: relative;',
    '  margin-bottom: 2.5rem;',
    '}',
    '.loader-logo .dot {',
    '  color: #00f9ff;',
    '  display: inline-block;',
    '  text-shadow: 0 0 12px #00f9ff, 0 0 40px rgba(0,249,255,0.4);',
    '  animation: dotPulse 1.2s ease-in-out infinite;',
    '}',
    '@keyframes dotPulse {',
    '  0%, 100% { text-shadow: 0 0 12px #00f9ff, 0 0 40px rgba(0,249,255,0.4); transform: scale(1); }',
    '  50% { text-shadow: 0 0 24px #00f9ff, 0 0 60px rgba(0,249,255,0.6), 0 0 90px rgba(0,249,255,0.2); transform: scale(1.15); }',
    '}',
    '',
    '.loader-bar-track {',
    '  width: 220px;',
    '  height: 2px;',
    '  background: rgba(255,255,255,0.08);',
    '  border-radius: 2px;',
    '  overflow: hidden;',
    '  position: relative;',
    '}',
    '.loader-bar-fill {',
    '  height: 100%;',
    '  width: 0%;',
    '  background: linear-gradient(90deg, #00f9ff, #9d4edd, #ff00aa);',
    '  border-radius: 2px;',
    '  box-shadow: 0 0 12px rgba(0,249,255,0.5);',
    '  transition: width 0.05s linear;',
    '}',
    '',
    '.loader-percent {',
    '  font-family: "JetBrains Mono", "Fira Code", monospace;',
    '  font-size: 0.75rem;',
    '  color: rgba(255,255,255,0.35);',
    '  margin-top: 1rem;',
    '  letter-spacing: 2px;',
    '  user-select: none;',
    '}',
    '',
    '/* Particle burst canvas */',
    '.loader-burst {',
    '  position: fixed;',
    '  top: 0; left: 0;',
    '  width: 100%; height: 100%;',
    '  z-index: 100000;',
    '  pointer-events: none;',
    '}',
    '',
    '/* Reduced motion */',
    '@media (prefers-reduced-motion: reduce) {',
    '  .loader-logo .dot { animation: none; }',
    '  #page-loader { transition-duration: 0.01s; }',
    '}'
  ].join('\n');

  var styleTag = document.createElement('style');
  styleTag.textContent = css;
  document.head.appendChild(styleTag);

  /* ── Build DOM ───────────────────────────────────── */
  var overlay = document.createElement('div');
  overlay.id = 'page-loader';

  var logo = document.createElement('div');
  logo.className = 'loader-logo';
  logo.innerHTML = 'RD<span class="dot">.</span>';

  var barTrack = document.createElement('div');
  barTrack.className = 'loader-bar-track';

  var barFill = document.createElement('div');
  barFill.className = 'loader-bar-fill';
  barTrack.appendChild(barFill);

  var percentText = document.createElement('div');
  percentText.className = 'loader-percent';
  percentText.textContent = '0%';

  overlay.appendChild(logo);
  overlay.appendChild(barTrack);
  overlay.appendChild(percentText);

  /* Insert at top of body */
  document.body.insertBefore(overlay, document.body.firstChild);

  /* ── Progress Animation ──────────────────────────── */
  var DURATION = prefersReducedMotion ? 300 : 2500;
  var startTime = null;
  var finished = false;

  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  function tickProgress(timestamp) {
    if (!startTime) startTime = timestamp;
    var elapsed = timestamp - startTime;
    var raw = Math.min(elapsed / DURATION, 1);
    var progress = easeOutQuart(raw);
    var pct = Math.round(progress * 100);

    barFill.style.width = pct + '%';
    percentText.textContent = pct + '%';

    if (raw < 1) {
      requestAnimationFrame(tickProgress);
    } else {
      onComplete();
    }
  }

  requestAnimationFrame(tickProgress);

  /* ── Particle Burst Effect ───────────────────────── */
  function createBurst(callback) {
    if (prefersReducedMotion) {
      if (callback) callback();
      return;
    }

    var burstCanvas = document.createElement('canvas');
    burstCanvas.className = 'loader-burst';
    burstCanvas.width = window.innerWidth;
    burstCanvas.height = window.innerHeight;
    document.body.appendChild(burstCanvas);

    var ctx = burstCanvas.getContext('2d');
    var cx = burstCanvas.width / 2;
    var cy = burstCanvas.height / 2;

    var BURST_COUNT = 60;
    var particles = [];
    var burstColors = ['#00f9ff', '#ff00aa', '#9d4edd', '#ffffff'];

    for (var i = 0; i < BURST_COUNT; i++) {
      var angle = (Math.PI * 2 * i) / BURST_COUNT + (Math.random() - 0.5) * 0.5;
      var speed = 3 + Math.random() * 6;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 1.5 + Math.random() * 2.5,
        color: burstColors[Math.floor(Math.random() * burstColors.length)],
        life: 1,
        decay: 0.015 + Math.random() * 0.015
      });
    }

    var burstDone = false;

    function animateBurst() {
      if (burstDone) return;

      ctx.clearRect(0, 0, burstCanvas.width, burstCanvas.height);

      var alive = 0;
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        if (p.life <= 0) continue;
        alive++;

        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.life -= p.decay;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (alive > 0) {
        requestAnimationFrame(animateBurst);
      } else {
        burstDone = true;
        burstCanvas.parentNode.removeChild(burstCanvas);
        if (callback) callback();
      }
    }

    requestAnimationFrame(animateBurst);
  }

  /* ── Complete & Dissolve ─────────────────────────── */
  function onComplete() {
    if (finished) return;
    finished = true;

    /* Fire burst */
    createBurst(function () {
      /* Clean up style tag after overlay removed */
    });

    /* Dissolve overlay */
    overlay.classList.add('loader-exit');

    var removeFn = function () {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      document.body.classList.add('page-loaded');

      /* Remove injected style after a delay so burst can finish */
      setTimeout(function () {
        if (styleTag.parentNode) {
          styleTag.parentNode.removeChild(styleTag);
        }
      }, 2000);
    };

    overlay.addEventListener('transitionend', function handler(e) {
      if (e.target !== overlay) return;
      overlay.removeEventListener('transitionend', handler);
      removeFn();
    });

    /* Fallback: force removal after 1.5s in case transitionend doesn't fire */
    setTimeout(removeFn, 1500);
  }

})();
