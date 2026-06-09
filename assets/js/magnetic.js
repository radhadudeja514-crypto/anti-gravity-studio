/**
 * Anti Gravity Studio — Magnetic Buttons & 3D Card Tilt
 * ──────────────────────────────────────────────────────
 * Magnetic pull effect for .magnetic-btn elements.
 * 3D perspective tilt for .tilt-card elements.
 *
 * Both effects auto-disable on:
 *   • Touch-primary devices
 *   • prefers-reduced-motion: reduce
 *
 * @version 2.0.0
 * @license MIT
 */
;(function () {
  'use strict';

  /* ── Feature Gates ───────────────────────────────────────── */
  var reducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var isTouchPrimary = (function () {
    /* Primary input is coarse (finger) — disable hover-based effects */
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
    return false;
  })();

  if (reducedMotion || isTouchPrimary) return; // nothing to do

  /* ── Brand Colours (for glow) ────────────────────────────── */
  var BRAND = {
    cyan: '#00f9ff',
    magenta: '#ff00aa',
  };

  /* ── Constants ───────────────────────────────────────────── */
  var MAG_PULL_RADIUS  = 100;  // px — how far away the mouse can "pull" the button
  var MAG_MAX_DISP     = 15;   // px — max displacement
  var MAG_LERP         = 0.15; // smoothing factor (0 = frozen, 1 = instant)
  var MAG_RETURN_LERP  = 0.1;  // smoother return to origin

  var TILT_MAX_DEG     = 10;   // degrees
  var TILT_PERSPECTIVE = 1000; // px
  var TILT_LERP        = 0.08;
  var TILT_RETURN_LERP = 0.06;

  /* ── Utilities ───────────────────────────────────────────── */
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  /* ── Style Injection ─────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('ag-magnetic-styles')) return;

    var css = [
      /* Magnetic buttons — base */
      '.magnetic-btn{',
      '  position:relative;',
      '  will-change:transform;',
      '  transition:box-shadow .3s ease;',
      '}',
      '.magnetic-btn .ag-mag-glow{',
      '  position:absolute;inset:0;border-radius:inherit;pointer-events:none;',
      '  opacity:0;transition:opacity .3s ease;',
      '}',
      '.magnetic-btn:hover .ag-mag-glow{opacity:1;}',

      /* Tilt cards — base */
      '.tilt-card{',
      '  position:relative;',
      '  will-change:transform;',
      '  transform-style:preserve-3d;',
      '  transition:box-shadow .4s ease;',
      '}',
      '.tilt-card .ag-tilt-gloss{',
      '  position:absolute;inset:0;border-radius:inherit;pointer-events:none;',
      '  opacity:0;transition:opacity .4s ease;',
      '  background:radial-gradient(circle at 50% 50%, rgba(255,255,255,0.12) 0%, transparent 60%);',
      '}',
      '.tilt-card:hover .ag-tilt-gloss{opacity:1;}',
    ].join('\n');

    var style = document.createElement('style');
    style.id = 'ag-magnetic-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ── Magnetic Button Controller ──────────────────────────── */
  function initMagnetic() {
    var buttons = document.querySelectorAll('.magnetic-btn');
    if (!buttons.length) return;

    for (var i = 0; i < buttons.length; i++) {
      setupMagneticBtn(buttons[i]);
    }
  }

  function setupMagneticBtn(btn) {
    /* Inject glow layer */
    if (!btn.querySelector('.ag-mag-glow')) {
      var glow = document.createElement('span');
      glow.className = 'ag-mag-glow';
      btn.appendChild(glow);
    }

    var state = {
      active: false,
      targetX: 0,
      targetY: 0,
      currentX: 0,
      currentY: 0,
      rafId: null,
    };

    var glowEl = btn.querySelector('.ag-mag-glow');

    function tick() {
      var factor = state.active ? MAG_LERP : MAG_RETURN_LERP;
      state.currentX = lerp(state.currentX, state.targetX, factor);
      state.currentY = lerp(state.currentY, state.targetY, factor);

      /* Snap to zero when close enough */
      if (
        !state.active &&
        Math.abs(state.currentX) < 0.1 &&
        Math.abs(state.currentY) < 0.1
      ) {
        state.currentX = 0;
        state.currentY = 0;
        btn.style.transform = '';
        state.rafId = null;
        return;
      }

      btn.style.transform =
        'translate3d(' +
        state.currentX.toFixed(2) +
        'px,' +
        state.currentY.toFixed(2) +
        'px,0)';

      state.rafId = requestAnimationFrame(tick);
    }

    function startLoop() {
      if (!state.rafId) {
        state.rafId = requestAnimationFrame(tick);
      }
    }

    /* We listen on `document` for mousemove so pull works even outside the button rect */
    function onMouseMove(e) {
      var rect = btn.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var dx = e.clientX - cx;
      var dy = e.clientY - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < MAG_PULL_RADIUS + Math.max(rect.width, rect.height) / 2) {
        state.active = true;
        /* Normalize displacement */
        var maxDist = MAG_PULL_RADIUS + Math.max(rect.width, rect.height) / 2;
        var strength = 1 - clamp(dist / maxDist, 0, 1);
        state.targetX = clamp(dx * strength, -MAG_MAX_DISP, MAG_MAX_DISP);
        state.targetY = clamp(dy * strength, -MAG_MAX_DISP, MAG_MAX_DISP);

        /* Glow follows cursor relative to button */
        var px = ((e.clientX - rect.left) / rect.width) * 100;
        var py = ((e.clientY - rect.top) / rect.height) * 100;
        glowEl.style.background =
          'radial-gradient(circle at ' +
          px.toFixed(1) +
          '% ' +
          py.toFixed(1) +
          '%, ' +
          BRAND.cyan +
          '22 0%, transparent 60%)';

        startLoop();
      } else if (state.active) {
        state.active = false;
        state.targetX = 0;
        state.targetY = 0;
        startLoop();
      }
    }

    function onMouseLeave() {
      state.active = false;
      state.targetX = 0;
      state.targetY = 0;
      startLoop();
    }

    /* Use event delegation — attach to the button's parent zone */
    document.addEventListener('mousemove', onMouseMove, { passive: true });
    btn.addEventListener('mouseleave', onMouseLeave);

    /* Cleanup helper (useful if elements get removed dynamically) */
    btn._agMagCleanup = function () {
      document.removeEventListener('mousemove', onMouseMove);
      btn.removeEventListener('mouseleave', onMouseLeave);
      if (state.rafId) cancelAnimationFrame(state.rafId);
    };
  }

  /* ── 3D Card Tilt Controller ─────────────────────────────── */
  function initTilt() {
    var cards = document.querySelectorAll('.tilt-card');
    if (!cards.length) return;

    for (var i = 0; i < cards.length; i++) {
      setupTiltCard(cards[i]);
    }
  }

  function setupTiltCard(card) {
    /* Inject glossy highlight layer */
    if (!card.querySelector('.ag-tilt-gloss')) {
      var gloss = document.createElement('span');
      gloss.className = 'ag-tilt-gloss';
      card.appendChild(gloss);
    }

    var glossEl = card.querySelector('.ag-tilt-gloss');

    var state = {
      active: false,
      targetRotX: 0,
      targetRotY: 0,
      currentRotX: 0,
      currentRotY: 0,
      rafId: null,
    };

    function tick() {
      var factor = state.active ? TILT_LERP : TILT_RETURN_LERP;
      state.currentRotX = lerp(state.currentRotX, state.targetRotX, factor);
      state.currentRotY = lerp(state.currentRotY, state.targetRotY, factor);

      if (
        !state.active &&
        Math.abs(state.currentRotX) < 0.05 &&
        Math.abs(state.currentRotY) < 0.05
      ) {
        state.currentRotX = 0;
        state.currentRotY = 0;
        card.style.transform = '';
        card.style.boxShadow = '';
        state.rafId = null;
        return;
      }

      card.style.transform =
        'perspective(' +
        TILT_PERSPECTIVE +
        'px) rotateX(' +
        state.currentRotX.toFixed(3) +
        'deg) rotateY(' +
        state.currentRotY.toFixed(3) +
        'deg)';

      /* Dynamic shadow shifts opposite to tilt direction */
      var shadowX = -state.currentRotY * 1.5;
      var shadowY = state.currentRotX * 1.5;
      card.style.boxShadow =
        shadowX.toFixed(1) + 'px ' +
        shadowY.toFixed(1) + 'px 30px rgba(0,0,0,0.35), ' +
        '0 0 60px rgba(0,0,0,0.15)';

      state.rafId = requestAnimationFrame(tick);
    }

    function startLoop() {
      if (!state.rafId) {
        state.rafId = requestAnimationFrame(tick);
      }
    }

    card.addEventListener('mouseenter', function () {
      state.active = true;
      startLoop();
    });

    card.addEventListener('mousemove', function (e) {
      if (!state.active) return;

      var rect = card.getBoundingClientRect();
      /* Normalize -1 → +1 */
      var nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      var ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;

      /* Invert Y for natural tilt feel */
      state.targetRotX = -ny * TILT_MAX_DEG;
      state.targetRotY =  nx * TILT_MAX_DEG;

      /* Move glossy highlight */
      var px = ((e.clientX - rect.left) / rect.width) * 100;
      var py = ((e.clientY - rect.top) / rect.height) * 100;
      glossEl.style.background =
        'radial-gradient(circle at ' +
        px.toFixed(1) + '% ' + py.toFixed(1) +
        '%, rgba(255,255,255,0.15) 0%, transparent 55%)';
    });

    card.addEventListener('mouseleave', function () {
      state.active = false;
      state.targetRotX = 0;
      state.targetRotY = 0;
      startLoop();
    });

    /* Cleanup */
    card._agTiltCleanup = function () {
      if (state.rafId) cancelAnimationFrame(state.rafId);
    };
  }

  /* ── Mutation Observer (dynamic content) ─────────────────── */
  function initMutationWatcher() {
    if (!('MutationObserver' in window)) return;

    var debounceTimer = null;

    var mo = new MutationObserver(function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        /* Find new magnetic buttons */
        var newBtns = document.querySelectorAll('.magnetic-btn:not([data-ag-mag])');
        for (var i = 0; i < newBtns.length; i++) {
          newBtns[i].setAttribute('data-ag-mag', '1');
          setupMagneticBtn(newBtns[i]);
        }
        /* Find new tilt cards */
        var newCards = document.querySelectorAll('.tilt-card:not([data-ag-tilt])');
        for (var j = 0; j < newCards.length; j++) {
          newCards[j].setAttribute('data-ag-tilt', '1');
          setupTiltCard(newCards[j]);
        }
      }, 300);
    });

    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ── Mark existing elements ──────────────────────────────── */
  function markExisting() {
    var btns = document.querySelectorAll('.magnetic-btn');
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute('data-ag-mag', '1');
    var cards = document.querySelectorAll('.tilt-card');
    for (var j = 0; j < cards.length; j++) cards[j].setAttribute('data-ag-tilt', '1');
  }

  /* ── Init ─────────────────────────────────────────────────── */
  function init() {
    injectStyles();
    initMagnetic();
    initTilt();
    markExisting();
    initMutationWatcher();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
