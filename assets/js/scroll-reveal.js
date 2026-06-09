/**
 * Anti Gravity Studio — Scroll Reveal Engine
 * ────────────────────────────────────────────
 * IntersectionObserver-based reveal animations
 * with parallax, stagger children, and counter.
 *
 * Classes:
 *   .reveal            — base reveal element (add data-reveal for type)
 *   .parallax           — parallax scroll element (data-speed="0.5")
 *   .count-up           — number counter (data-target="500")
 *
 * data-reveal values:
 *   fade-up | fade-left | fade-right | scale | rotate
 *
 * data-stagger          — stagger children with 100 ms offset
 * data-duration         — custom duration in ms (default 800)
 * data-delay            — base delay in ms (default 0)
 *
 * @version 2.0.0
 * @license MIT
 */
;(function () {
  'use strict';

  /* ── Preferences ─────────────────────────────────────────── */
  var reducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Constants ───────────────────────────────────────────── */
  var EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';
  var DEFAULT_DURATION = 800;   // ms
  var LARGE_DURATION   = 1200;  // ms — for elements taller than this threshold
  var LARGE_THRESHOLD  = 300;   // px height
  var OBSERVER_THRESHOLD = 0.15;
  var STAGGER_OFFSET   = 100;   // ms
  var COUNTER_DURATION  = 2000; // ms

  /* ── Style Injection ─────────────────────────────────────── */
  function injectBaseStyles() {
    if (document.getElementById('ag-reveal-styles')) return;

    var css = [
      /* All reveal elements start invisible (unless reduced-motion) */
      '.reveal{',
      reducedMotion ? '' : '  opacity:0;',
      '  will-change:transform,opacity;',
      '}',
      '.reveal.revealed{opacity:1 !important;transform:none !important;}',
      /* Parallax base */
      '.parallax{will-change:transform;}',
    ].join('\n');

    var style = document.createElement('style');
    style.id = 'ag-reveal-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ── Transform Origins per Type ──────────────────────────── */
  var INITIAL_TRANSFORMS = {
    'fade-up':    'translate3d(0, 40px, 0)',
    'fade-left':  'translate3d(-60px, 0, 0)',
    'fade-right': 'translate3d(60px, 0, 0)',
    'scale':      'scale(0.8)',
    'rotate':     'rotate(-5deg)',
  };

  /* ── Apply Initial State ─────────────────────────────────── */
  function setInitialState(el) {
    if (reducedMotion) return;

    var type = el.getAttribute('data-reveal') || 'fade-up';
    var transform = INITIAL_TRANSFORMS[type] || INITIAL_TRANSFORMS['fade-up'];

    el.style.opacity = '0';
    el.style.transform = transform;
  }

  /* ── Reveal Element ──────────────────────────────────────── */
  function revealElement(el) {
    if (reducedMotion) {
      el.classList.add('revealed');
      return;
    }

    var type = el.getAttribute('data-reveal') || 'fade-up';
    var hasStagger = el.hasAttribute('data-stagger');
    var customDuration = parseInt(el.getAttribute('data-duration'), 10);
    var baseDelay = parseInt(el.getAttribute('data-delay'), 10) || 0;

    /* Determine duration */
    var dur = customDuration || DEFAULT_DURATION;
    if (!customDuration && el.offsetHeight > LARGE_THRESHOLD) {
      dur = LARGE_DURATION;
    }

    if (hasStagger) {
      /* Stagger children */
      var children = el.children;
      for (var i = 0; i < children.length; i++) {
        (function (child, idx) {
          var childTransform = INITIAL_TRANSFORMS[type] || INITIAL_TRANSFORMS['fade-up'];
          child.style.opacity = '0';
          child.style.transform = childTransform;
          child.style.transition =
            'opacity ' + dur + 'ms ' + EASING + ' ' + (baseDelay + idx * STAGGER_OFFSET) + 'ms, ' +
            'transform ' + dur + 'ms ' + EASING + ' ' + (baseDelay + idx * STAGGER_OFFSET) + 'ms';

          /* Force reflow then animate */
          void child.offsetWidth;
          child.style.opacity = '1';
          child.style.transform = 'none';
        })(children[i], i);
      }
      /* Reveal parent container immediately */
      el.style.opacity = '1';
      el.style.transform = 'none';
      el.classList.add('revealed');
    } else {
      /* Single element transition */
      el.style.transition =
        'opacity ' + dur + 'ms ' + EASING + ' ' + baseDelay + 'ms, ' +
        'transform ' + dur + 'ms ' + EASING + ' ' + baseDelay + 'ms';

      /* Force reflow */
      void el.offsetWidth;

      el.style.opacity = '1';
      el.style.transform = 'none';
      el.classList.add('revealed');
    }
  }

  /* ── Count-Up Animation ──────────────────────────────────── */
  function animateCounter(el) {
    var target = parseFloat(el.getAttribute('data-target'));
    if (isNaN(target)) return;

    var suffix = el.getAttribute('data-suffix') || '';
    var prefix = el.getAttribute('data-prefix') || '';
    var decimals = (String(target).split('.')[1] || '').length;

    if (reducedMotion) {
      el.textContent = prefix + target.toFixed(decimals) + suffix;
      return;
    }

    var duration = parseInt(el.getAttribute('data-duration'), 10) || COUNTER_DURATION;
    var start = 0;
    var startTime = null;

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var easedProgress = easeOutCubic(progress);
      var current = start + (target - start) * easedProgress;

      el.textContent = prefix + current.toFixed(decimals) + suffix;

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }

  /* ── Parallax System ─────────────────────────────────────── */
  function initParallax() {
    if (reducedMotion) return;

    var parallaxEls = document.querySelectorAll('.parallax');
    if (!parallaxEls.length) return;

    var ticking = false;

    function updateParallax() {
      var scrollY = window.pageYOffset || document.documentElement.scrollTop;
      var viewH = window.innerHeight;

      for (var i = 0; i < parallaxEls.length; i++) {
        var el = parallaxEls[i];
        var speed = parseFloat(el.getAttribute('data-speed'));
        if (isNaN(speed)) speed = 0.5;

        var rect = el.getBoundingClientRect();
        /* Only process elements near the viewport */
        if (rect.bottom < -200 || rect.top > viewH + 200) continue;

        var center = rect.top + rect.height / 2;
        var offset = (center - viewH / 2) * speed * -0.3;

        el.style.transform = 'translate3d(0,' + offset.toFixed(2) + 'px,0)';
      }
      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateParallax);
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    /* Initial position */
    updateParallax();
  }

  /* ── IntersectionObserver Setup ──────────────────────────── */
  function initRevealObserver() {
    var revealEls = document.querySelectorAll('.reveal');
    if (!revealEls.length) return;

    /* Set initial hidden states */
    for (var i = 0; i < revealEls.length; i++) {
      setInitialState(revealEls[i]);
    }

    if (!('IntersectionObserver' in window)) {
      /* Fallback: reveal everything immediately */
      for (var j = 0; j < revealEls.length; j++) {
        revealEls[j].classList.add('revealed');
        revealEls[j].style.opacity = '1';
        revealEls[j].style.transform = 'none';
      }
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        for (var k = 0; k < entries.length; k++) {
          if (entries[k].isIntersecting) {
            revealElement(entries[k].target);
            observer.unobserve(entries[k].target); // once only
          }
        }
      },
      { threshold: OBSERVER_THRESHOLD }
    );

    for (var m = 0; m < revealEls.length; m++) {
      observer.observe(revealEls[m]);
    }
  }

  /* ── Counter Observer ────────────────────────────────────── */
  function initCounterObserver() {
    var counterEls = document.querySelectorAll('.count-up');
    if (!counterEls.length) return;

    if (!('IntersectionObserver' in window)) {
      for (var i = 0; i < counterEls.length; i++) {
        animateCounter(counterEls[i]);
      }
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        for (var k = 0; k < entries.length; k++) {
          if (entries[k].isIntersecting) {
            animateCounter(entries[k].target);
            observer.unobserve(entries[k].target);
          }
        }
      },
      { threshold: 0.5 }
    );

    for (var j = 0; j < counterEls.length; j++) {
      observer.observe(counterEls[j]);
    }
  }

  /* ── Mutation Observer (for dynamic content) ─────────────── */
  function initMutationWatcher() {
    if (!('MutationObserver' in window)) return;

    var debounceTimer = null;

    var mo = new MutationObserver(function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        /* Re-scan for new .reveal elements that haven't been processed */
        var newReveals = document.querySelectorAll('.reveal:not(.revealed)');
        if (newReveals.length) {
          for (var i = 0; i < newReveals.length; i++) {
            if (!newReveals[i]._agRevealInit) {
              newReveals[i]._agRevealInit = true;
              setInitialState(newReveals[i]);
              if (window._agRevealObserver) {
                window._agRevealObserver.observe(newReveals[i]);
              }
            }
          }
        }
        /* Re-scan counters */
        var newCounters = document.querySelectorAll('.count-up:not([data-counted])');
        if (newCounters.length && window._agCounterObserver) {
          for (var j = 0; j < newCounters.length; j++) {
            window._agCounterObserver.observe(newCounters[j]);
          }
        }
      }, 200);
    });

    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ── Stored Observer Refs (for mutation watcher) ─────────── */
  function initRevealObserverWithRef() {
    var revealEls = document.querySelectorAll('.reveal');

    for (var i = 0; i < revealEls.length; i++) {
      revealEls[i]._agRevealInit = true;
      setInitialState(revealEls[i]);
    }

    if (!('IntersectionObserver' in window)) {
      for (var j = 0; j < revealEls.length; j++) {
        revealEls[j].classList.add('revealed');
        revealEls[j].style.opacity = '1';
        revealEls[j].style.transform = 'none';
      }
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        for (var k = 0; k < entries.length; k++) {
          if (entries[k].isIntersecting) {
            revealElement(entries[k].target);
            observer.unobserve(entries[k].target);
          }
        }
      },
      { threshold: OBSERVER_THRESHOLD }
    );

    window._agRevealObserver = observer;

    for (var m = 0; m < revealEls.length; m++) {
      observer.observe(revealEls[m]);
    }
  }

  function initCounterObserverWithRef() {
    var counterEls = document.querySelectorAll('.count-up');

    if (!('IntersectionObserver' in window)) {
      for (var i = 0; i < counterEls.length; i++) {
        animateCounter(counterEls[i]);
      }
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        for (var k = 0; k < entries.length; k++) {
          if (entries[k].isIntersecting) {
            entries[k].target.setAttribute('data-counted', 'true');
            animateCounter(entries[k].target);
            observer.unobserve(entries[k].target);
          }
        }
      },
      { threshold: 0.5 }
    );

    window._agCounterObserver = observer;

    for (var j = 0; j < counterEls.length; j++) {
      observer.observe(counterEls[j]);
    }
  }

  /* ── Init ─────────────────────────────────────────────────── */
  function init() {
    injectBaseStyles();
    initRevealObserverWithRef();
    initCounterObserverWithRef();
    initParallax();
    initMutationWatcher();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
