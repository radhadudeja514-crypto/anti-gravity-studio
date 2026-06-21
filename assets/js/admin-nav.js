/**
 * admin-nav.js — ANTI-GRAVITY MISSION CONTROL
 * Shared bottom nav bar + auth + toast system for all admin pages
 * Include at the bottom of every admin page <body>
 */

// ── Auth check ────────────────────────────────────────────────────────────────
(async function checkAdminAuth() {
  try {
    const r = await fetch('/api/admin/check', {credentials:'include'});
    const d = await r.json();
    if (!d.authenticated) window.location.href = '/admin/login.html';
  } catch (e) {
    window.location.href = '/admin/login.html';
  }
})();

// ── Inject mesh background if not already present ─────────────────────────────
(function injectMeshBg() {
  if (document.querySelector('.mesh-bg')) return;
  const mesh = document.createElement('div');
  mesh.className = 'mesh-bg';
  mesh.innerHTML = '<div class="mesh-orb"></div><div class="mesh-orb"></div><div class="mesh-orb"></div>';
  document.body.prepend(mesh);
  const scan = document.createElement('div');
  scan.className = 'scanlines';
  document.body.prepend(scan);
})();

// ── Inject toast container ────────────────────────────────────────────────────
(function injectToast() {
  if (document.getElementById('toastContainer')) return;
  const tc = document.createElement('div');
  tc.className = 'toast-container';
  tc.id = 'toastContainer';
  document.body.appendChild(tc);
})();

// ── Toast system ──────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', info: '💡' };
  t.innerHTML = `${icons[type] || '💡'} ${msg}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ── Inject bottom navigation bar ──────────────────────────────────────────────
(function injectAdminNav() {
  const current = window.location.pathname.split('/').pop();

  const sections = [
    { group: 'Core', items: [
      { href: 'dashboard.html',          icon: '🛸', label: 'Dashboard' },
      { href: 'leads.html',              icon: '🎯', label: 'Leads' },
      { href: 'schedule.html',           icon: '📅', label: 'Schedule' },
      { href: 'analytics.html',          icon: '📊', label: 'Analytics' },
      { href: 'media.html',              icon: '🖼️', label: 'Media' },
      { href: 'payments.html',           icon: '💳', label: 'Payments' },
      { href: 'google-my-business.html', icon: '⭐', label: 'Reviews' },
      { href: 'config.html',             icon: '⚙️', label: 'Settings' },
    ]},
  ];

  const allPages = sections.flatMap(s => s.items);

  const bar = document.createElement('div');
  bar.id = 'admin-shared-nav';
  bar.style.cssText = `
    position:fixed; bottom:0; left:0; right:0; z-index:9999;
    background:rgba(6,6,16,0.95); border-top:1px solid rgba(0,249,255,0.1);
    display:flex; align-items:center; justify-content:center; gap:1px;
    padding:0.35rem 0.5rem; backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
    overflow-x:auto; flex-wrap:nowrap;
  `;

  bar.innerHTML = allPages.map(p => {
    const isActive = current === p.href;
    const activeBg = isActive ? 'rgba(0,249,255,0.1)' : 'transparent';
    const activeColor = isActive ? '#00f9ff' : 'rgba(255,255,255,0.4)';
    const activeBorder = isActive ? '1px solid rgba(0,249,255,0.2)' : '1px solid transparent';
    const aiStyle = p.ai ? 'background:rgba(0,249,255,0.06);border:1px solid rgba(0,249,255,0.15);' : '';
    const glowStyle = isActive ? 'box-shadow:0 -2px 15px rgba(0,249,255,0.1);' : '';

    return `
      <a href="${p.href}" style="
        display:inline-flex;flex-direction:column;align-items:center;gap:1px;
        padding:0.35rem 0.6rem;border-radius:8px;text-decoration:none;
        font-family:'Inter',sans-serif;font-size:0.58rem;font-weight:${isActive ? '700' : '500'};
        white-space:nowrap;transition:all 0.2s;min-width:52px;
        color:${activeColor};background:${activeBg};border:${activeBorder};${aiStyle}${glowStyle}
        letter-spacing:0.03em;
      " onmouseover="this.style.color='#00f9ff';this.style.background='rgba(0,249,255,0.08)'"
         onmouseout="this.style.color='${activeColor}';this.style.background='${isActive ? 'rgba(0,249,255,0.1)' : (p.ai ? 'rgba(0,249,255,0.06)' : 'transparent')}'"
      >
        <span style="font-size:1rem;line-height:1;${p.ai && !isActive ? 'animation:aiPulse 2s ease-in-out infinite;' : ''}">${p.icon}</span>
        <span>${p.label}</span>
      </a>
    `;
  }).join('') + `
    <span style="width:1px;height:24px;background:rgba(255,255,255,0.08);margin:0 4px;flex-shrink:0;"></span>
    <a href="../index.html" target="_blank" style="display:inline-flex;flex-direction:column;align-items:center;gap:1px;padding:0.35rem 0.5rem;border-radius:8px;text-decoration:none;font-family:'Inter',sans-serif;font-size:0.58rem;font-weight:500;white-space:nowrap;transition:all 0.2s;color:rgba(255,255,255,0.3);" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,0.3)'">
      <span style="font-size:1rem;line-height:1;">🌐</span><span>Home</span>
    </a>
    <a href="../pillar-radha.html" target="_blank" style="display:inline-flex;flex-direction:column;align-items:center;gap:1px;padding:0.35rem 0.5rem;border-radius:8px;text-decoration:none;font-family:'Inter',sans-serif;font-size:0.58rem;font-weight:500;white-space:nowrap;transition:all 0.2s;color:rgba(232,135,30,0.5);" onmouseover="this.style.color='#e8871e'" onmouseout="this.style.color='rgba(232,135,30,0.5)'">
      <span style="font-size:1rem;line-height:1;">🪔</span><span>Radha</span>
    </a>
    <a href="../pillar-veronica.html" target="_blank" style="display:inline-flex;flex-direction:column;align-items:center;gap:1px;padding:0.35rem 0.5rem;border-radius:8px;text-decoration:none;font-family:'Inter',sans-serif;font-size:0.58rem;font-weight:500;white-space:nowrap;transition:all 0.2s;color:rgba(192,192,192,0.4);" onmouseover="this.style.color='#C0C0C0'" onmouseout="this.style.color='rgba(192,192,192,0.4)'">
      <span style="font-size:1rem;line-height:1;">🎤</span><span>Corp</span>
    </a>
    <a href="../pillar-tour.html" target="_blank" style="display:inline-flex;flex-direction:column;align-items:center;gap:1px;padding:0.35rem 0.5rem;border-radius:8px;text-decoration:none;font-family:'Inter',sans-serif;font-size:0.58rem;font-weight:500;white-space:nowrap;transition:all 0.2s;color:rgba(242,165,65,0.5);" onmouseover="this.style.color='#F2A541'" onmouseout="this.style.color='rgba(242,165,65,0.5)'">
      <span style="font-size:1rem;line-height:1;">🧭</span><span>Tour</span>
    </a>
    <a href="/admin/login.html" onclick="return logoutAdmin()" style="
      display:inline-flex;flex-direction:column;align-items:center;gap:1px;
      padding:0.35rem 0.6rem;border-radius:8px;text-decoration:none;
      font-family:'Inter',sans-serif;font-size:0.58rem;font-weight:500;
      white-space:nowrap;transition:all 0.2s;min-width:42px;
      color:rgba(255,100,100,0.5);
    " onmouseover="this.style.color='#ff6b6b'" onmouseout="this.style.color='rgba(255,100,100,0.5)'">
      <span style="font-size:1rem;line-height:1;">🚪</span><span>Logout</span>
    </a>
  `;

  // Add CSS animation for AI pulse
  if (!document.getElementById('navAnimStyles')) {
    const style = document.createElement('style');
    style.id = 'navAnimStyles';
    style.textContent = `@keyframes aiPulse{0%,100%{opacity:1;}50%{opacity:0.5;}}`;
    document.head.appendChild(style);
  }

  document.body.style.paddingBottom = '65px';
  document.body.appendChild(bar);
})();

// ── Logout ────────────────────────────────────────────────────────────────────
function logoutAdmin() {
  fetch('/api/admin/logout', { method: 'POST', credentials:'include' })
    .finally(() => { window.location.href = '/admin/login.html'; });
  return false;
}

// ── Escape HTML helper ────────────────────────────────────────────────────────
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// ── Format date helper ────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

// ── Format currency ───────────────────────────────────────────────────────────
function formatCurrency(num) {
  return '₹' + (num || 0).toLocaleString('en-IN');
}
