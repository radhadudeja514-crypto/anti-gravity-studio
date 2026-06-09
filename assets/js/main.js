/**
 * assets/js/main.js — Anti-Gravity Gig Portfolio
 * ES-module entry point. Imports all feature modules.
 */

import { initParticles }   from './particles.js';
import { initVoice }       from './voice.js';
import { initAdminToggle } from './admin.js';
import { initPWA }         from './pwa.js';
import { initAnalytics }   from './analytics.js';

// ── Boot ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  initVoice();
  initAdminToggle();
  initPWA();
  initAnalytics();
  initFocusStyles();
  initScrollReveal();
  initAccessibleModals();
});

// ── Accessible focus ring: only show on keyboard nav ─────────────────────────
function initFocusStyles() {
  document.body.addEventListener('mousedown', () =>
    document.body.classList.remove('keyboard-user')
  );
  document.body.addEventListener('keydown', e => {
    if (e.key === 'Tab') document.body.classList.add('keyboard-user');
  });
}

// ── Scroll-reveal via IntersectionObserver ────────────────────────────────────
function initScrollReveal() {
  const els = document.querySelectorAll('[data-reveal]');
  if (!els.length) return;
  const obs = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  els.forEach(el => obs.observe(el));
}

// ── Accessible modal: trap focus & close on Escape ────────────────────────────
function initAccessibleModals() {
  document.querySelectorAll('[data-modal-trigger]').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const targetId = trigger.getAttribute('data-modal-trigger');
      const modal    = document.getElementById(targetId);
      if (!modal) return;
      openModal(modal);
    });
  });

  document.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('[role="dialog"]');
      if (modal) closeModal(modal);
    });
  });
}

function openModal(modal) {
  modal.removeAttribute('hidden');
  modal.setAttribute('aria-hidden', 'false');
  // Focus first focusable element
  const focusable = modal.querySelectorAll('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusable.length) focusable[0].focus();

  // Trap focus
  modal._trapFocus = e => {
    if (e.key !== 'Tab') return;
    const items = [...focusable];
    const first = items[0];
    const last  = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  modal._escClose = e => { if (e.key === 'Escape') closeModal(modal); };
  document.addEventListener('keydown', modal._trapFocus);
  document.addEventListener('keydown', modal._escClose);
}

function closeModal(modal) {
  modal.setAttribute('hidden', '');
  modal.setAttribute('aria-hidden', 'true');
  document.removeEventListener('keydown', modal._trapFocus);
  document.removeEventListener('keydown', modal._escClose);
}
