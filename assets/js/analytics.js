/**
 * assets/js/analytics.js
 * Lightweight analytics tracker — page views + custom events
 */

export function initAnalytics() {
  // Track page view
  const pillar = detectPillar();
  sendView(window.location.pathname, pillar);
}

export function trackEvent(eventName, pillar) {
  fetch('/api/analytics/event', {credentials:'include', 
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventName, pillar: pillar || detectPillar() }),
  }).catch(() => {});
}

function sendView(url, pillar) {
  fetch('/api/analytics/view', {credentials:'include', 
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, pillar }),
  }).catch(() => {});
}

function detectPillar() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes('radha'))    return 'Radha';
  if (path.includes('veronica')) return 'Veronica';
  if (path.includes('tour'))     return 'Tour';
  return 'Main';
}
