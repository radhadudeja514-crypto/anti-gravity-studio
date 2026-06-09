/**
 * cursor-fx.js
 * ─────────────────────────────────────────────────────
 * Premium custom cursor system for desktop devices.
 * Self-injects DOM elements and CSS styles.
 *
 * Features:
 *  - Small filled dot (instant follow)
 *  - Larger circle outline (lerp follow)
 *  - Interactive hover states (links, buttons, images/videos)
 *  - Click press animation
 *  - Glowing trail (last 8 positions)
 *  - Respects prefers-reduced-motion
 * ─────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ── Guard: desktop pointer only ─────────────────── */
  if (!window.matchMedia('(pointer: fine)').matches) return;

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Config ──────────────────────────────────────── */
  var LERP_SPEED      = 0.15;
  var DOT_SIZE        = 8;
  var CIRCLE_DEFAULT  = 40;
  var CIRCLE_HOVER    = 60;
  var TRAIL_LENGTH    = 8;
  var TRAIL_FADE      = 0.6;

  var COLOR_DEFAULT   = '#00f9ff';
  var COLOR_INTERACT  = '#ff00aa';

  /* ── Inject Styles ───────────────────────────────── */
  var css = [
    '/* Custom cursor — hide default */',
    'body.cursor-fx-active, body.cursor-fx-active * {',
    '  cursor: none !important;',
    '}',
    '',
    '.cfx-dot {',
    '  position: fixed;',
    '  top: 0; left: 0;',
    '  width: ' + DOT_SIZE + 'px;',
    '  height: ' + DOT_SIZE + 'px;',
    '  border-radius: 50%;',
    '  background: ' + COLOR_DEFAULT + ';',
    '  box-shadow: 0 0 8px ' + COLOR_DEFAULT + ', 0 0 20px rgba(0,249,255,0.3);',
    '  pointer-events: none;',
    '  z-index: 999999;',
    '  transform: translate(-50%, -50%);',
    '  transition: transform 0.12s ease, background 0.25s ease, box-shadow 0.25s ease;',
    '  will-change: left, top, transform;',
    '}',
    '.cfx-dot.pressing {',
    '  transform: translate(-50%, -50%) scale(0.5);',
    '}',
    '.cfx-dot.interactive {',
    '  background: ' + COLOR_INTERACT + ';',
    '  box-shadow: 0 0 8px ' + COLOR_INTERACT + ', 0 0 20px rgba(255,0,170,0.3);',
    '}',
    '',
    '.cfx-circle {',
    '  position: fixed;',
    '  top: 0; left: 0;',
    '  width: ' + CIRCLE_DEFAULT + 'px;',
    '  height: ' + CIRCLE_DEFAULT + 'px;',
    '  border: 1.5px solid ' + COLOR_DEFAULT + ';',
    '  border-radius: 50%;',
    '  pointer-events: none;',
    '  z-index: 999998;',
    '  transform: translate(-50%, -50%);',
    '  transition: width 0.35s cubic-bezier(0.25,1,0.5,1),',
    '              height 0.35s cubic-bezier(0.25,1,0.5,1),',
    '              border-radius 0.35s cubic-bezier(0.25,1,0.5,1),',
    '              border-color 0.25s ease,',
    '              box-shadow 0.25s ease,',
    '              transform 0.12s ease;',
    '  will-change: left, top, width, height;',
    '}',
    '.cfx-circle.hovering {',
    '  width: ' + CIRCLE_HOVER + 'px;',
    '  height: ' + CIRCLE_HOVER + 'px;',
    '  border-color: ' + COLOR_INTERACT + ';',
    '  box-shadow: 0 0 20px rgba(255,0,170,0.25), inset 0 0 20px rgba(255,0,170,0.05);',
    '}',
    '.cfx-circle.pressing {',
    '  transform: translate(-50%, -50%) scale(0.8);',
    '}',
    '.cfx-circle.media-hover {',
    '  width: 70px;',
    '  height: 70px;',
    '  border-radius: 16px;',
    '  border-color: ' + COLOR_DEFAULT + ';',
    '  box-shadow: 0 0 20px rgba(0,249,255,0.2), inset 0 0 20px rgba(0,249,255,0.04);',
    '}',
    '',
    '.cfx-label {',
    '  position: absolute;',
    '  top: 50%; left: 50%;',
    '  transform: translate(-50%, -50%);',
    '  font-family: "Inter", "Segoe UI", system-ui, sans-serif;',
    '  font-size: 0.55rem;',
    '  font-weight: 600;',
    '  letter-spacing: 2px;',
    '  text-transform: uppercase;',
    '  color: ' + COLOR_DEFAULT + ';',
    '  opacity: 0;',
    '  transition: opacity 0.25s ease;',
    '  pointer-events: none;',
    '  white-space: nowrap;',
    '}',
    '.cfx-circle.media-hover .cfx-label {',
    '  opacity: 1;',
    '}',
    '',
    '.cfx-trail {',
    '  position: fixed;',
    '  border-radius: 50%;',
    '  pointer-events: none;',
    '  z-index: 999997;',
    '  transform: translate(-50%, -50%);',
    '  will-change: left, top, opacity;',
    '}',
    '',
    '/* Reduced motion */',
    '@media (prefers-reduced-motion: reduce) {',
    '  .cfx-dot, .cfx-circle { transition: none !important; }',
    '  .cfx-trail { display: none !important; }',
    '}'
  ].join('\n');

  var styleTag = document.createElement('style');
  styleTag.textContent = css;
  document.head.appendChild(styleTag);

  /* ── Create DOM Elements ─────────────────────────── */
  var dot = document.createElement('div');
  dot.className = 'cfx-dot';

  var circle = document.createElement('div');
  circle.className = 'cfx-circle';

  var label = document.createElement('span');
  label.className = 'cfx-label';
  label.textContent = 'VIEW';
  circle.appendChild(label);

  document.body.appendChild(dot);
  document.body.appendChild(circle);

  /* Trail dots */
  var trails = [];
  if (!prefersReducedMotion) {
    for (var t = 0; t < TRAIL_LENGTH; t++) {
      var trail = document.createElement('div');
      trail.className = 'cfx-trail';
      var size = Math.max(2, DOT_SIZE - t * 0.8);
      trail.style.width = size + 'px';
      trail.style.height = size + 'px';
      trail.style.background = COLOR_DEFAULT;
      trail.style.boxShadow = '0 0 6px ' + COLOR_DEFAULT;
      trail.style.opacity = '0';
      document.body.appendChild(trail);
      trails.push({
        el: trail,
        x: -100,
        y: -100
      });
    }
  }

  /* Activate cursor hiding */
  document.body.classList.add('cursor-fx-active');

  /* ── State ───────────────────────────────────────── */
  var mouseX = -100, mouseY = -100;
  var circleX = -100, circleY = -100;
  var trailHistory = []; // array of {x, y}
  var isHovering = false;
  var isMediaHover = false;
  var isPressed = false;
  var isVisible = false;

  /* ── Event Listeners ─────────────────────────────── */
  document.addEventListener('mousemove', function (e) {
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (!isVisible) {
      isVisible = true;
      dot.style.opacity = '1';
      circle.style.opacity = '1';
    }
  }, { passive: true });

  document.addEventListener('mousedown', function () {
    isPressed = true;
    dot.classList.add('pressing');
    circle.classList.add('pressing');
  });

  document.addEventListener('mouseup', function () {
    isPressed = false;
    dot.classList.remove('pressing');
    circle.classList.remove('pressing');
  });

  document.addEventListener('mouseleave', function () {
    isVisible = false;
    dot.style.opacity = '0';
    circle.style.opacity = '0';
    for (var i = 0; i < trails.length; i++) {
      trails[i].el.style.opacity = '0';
    }
  });

  document.addEventListener('mouseenter', function () {
    isVisible = true;
    dot.style.opacity = '1';
    circle.style.opacity = '1';
  });

  /* Hover detection via mouseover/mouseout for performance */
  document.addEventListener('mouseover', function (e) {
    var target = e.target;
    if (!target) return;

    /* Check media */
    if (target.matches && target.matches('img, video, picture, [data-cursor="view"], canvas')) {
      isMediaHover = true;
      isHovering = false;
      circle.classList.add('media-hover');
      circle.classList.remove('hovering');
      dot.classList.add('interactive');
      return;
    }

    /* Check interactive */
    var interactive = target.closest && target.closest('a, button, [role="button"], input[type="submit"], .btn, [data-cursor="pointer"]');
    if (interactive) {
      isHovering = true;
      isMediaHover = false;
      circle.classList.add('hovering');
      circle.classList.remove('media-hover');
      dot.classList.add('interactive');
      updateTrailColor(COLOR_INTERACT);
      return;
    }
  }, { passive: true });

  document.addEventListener('mouseout', function (e) {
    var target = e.target;
    if (!target) return;

    if (target.matches && target.matches('img, video, picture, [data-cursor="view"], canvas')) {
      isMediaHover = false;
      circle.classList.remove('media-hover');
      dot.classList.remove('interactive');
    }

    var interactive = target.closest && target.closest('a, button, [role="button"], input[type="submit"], .btn, [data-cursor="pointer"]');
    if (interactive) {
      isHovering = false;
      circle.classList.remove('hovering');
      dot.classList.remove('interactive');
      updateTrailColor(COLOR_DEFAULT);
    }
  }, { passive: true });

  /* ── Trail color helper ──────────────────────────── */
  function updateTrailColor(color) {
    for (var i = 0; i < trails.length; i++) {
      trails[i].el.style.background = color;
      trails[i].el.style.boxShadow = '0 0 6px ' + color;
    }
  }

  /* ── Animation Loop ──────────────────────────────── */
  var raf;

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function tick() {
    raf = requestAnimationFrame(tick);

    /* Dot: instant follow */
    dot.style.left = mouseX + 'px';
    dot.style.top  = mouseY + 'px';

    /* Circle: lerp follow */
    circleX = lerp(circleX, mouseX, LERP_SPEED);
    circleY = lerp(circleY, mouseY, LERP_SPEED);
    circle.style.left = circleX + 'px';
    circle.style.top  = circleY + 'px';

    /* Trail positions */
    if (!prefersReducedMotion && trails.length > 0) {
      /* Record current position */
      trailHistory.unshift({ x: mouseX, y: mouseY });
      if (trailHistory.length > TRAIL_LENGTH + 4) {
        trailHistory.length = TRAIL_LENGTH + 4;
      }

      for (var i = 0; i < trails.length; i++) {
        var idx = i + 2; // offset so trail is behind cursor
        if (trailHistory[idx]) {
          trails[i].el.style.left = trailHistory[idx].x + 'px';
          trails[i].el.style.top  = trailHistory[idx].y + 'px';

          var maxOpacity = TRAIL_FADE * (1 - i / trails.length);
          trails[i].el.style.opacity = isVisible ? String(maxOpacity) : '0';
        }
      }
    }
  }

  tick();

  /* ── Cleanup on page hide ────────────────────────── */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else {
      tick();
    }
  });

})();
