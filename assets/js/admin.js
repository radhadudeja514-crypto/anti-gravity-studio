/**
 * assets/js/admin.js
 * Admin dashboard toggle, session-aware auth check
 */

export function initAdminToggle() {
  // Check if admin session is active
  fetch('/api/admin/check')
    .then(r => r.json())
    .then(data => {
      const adminBtn = document.getElementById('admin-btn');
      if (!adminBtn) return;
      if (data.authenticated) {
        adminBtn.textContent = '⚙ CURATOR ADMIN';
        adminBtn.onclick = () => window.location.assign('/admin/dashboard.html');
      } else {
        adminBtn.onclick = () => window.location.assign('/admin/login.html');
      }
    })
    .catch(() => {}); // silently fail if server is down
}

/**
 * Logout helper — call from admin pages
 */
export async function adminLogout() {
  await fetch('/api/admin/logout', {credentials:'include',  method: 'POST' });
  window.location.assign('/admin/login.html');
}

/**
 * Fetch a CSRF token for forms
 */
export async function getCsrfToken() {
  const r = await fetch('/api/csrf-token',{credentials:'include'});
  const d = await r.json();
  return d.token;
}
