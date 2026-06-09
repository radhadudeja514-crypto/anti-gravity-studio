/**
 * assets/js/pwa.js
 * PWA install prompt + service worker registration
 */

export function initPWA() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => console.log('SW registered, scope:', reg.scope))
      .catch(err => console.warn('SW registration failed:', err));
  }

  // PWA install prompt
  let deferredPrompt = null;
  const installBtn   = document.getElementById('pwa-install-btn');

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.style.display = 'flex';
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('PWA install outcome:', outcome);
      deferredPrompt = null;
      installBtn.style.display = 'none';
    });
  }

  window.addEventListener('appinstalled', () => {
    console.log('PWA installed');
    if (installBtn) installBtn.style.display = 'none';
  });
}
