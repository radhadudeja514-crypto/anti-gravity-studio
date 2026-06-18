/**
 * media-loader.js — Loads uploaded media from DB into the main website
 * Replaces static placeholder photos with real uploaded content
 */

(async function loadSiteMedia() {
  try {
    // Fetch all media (public endpoint - no auth needed for display)
    const r = await fetch('/api/media/public',{credentials:'include'});
    if (!r.ok) return; // silently skip if endpoint not ready
    const data = await r.json();
    if (!data || !data.length) return;

    const byPillar = { corporate: [], sangeet: [], tour: [], main: [] };
    data.forEach(m => {
      const p = (m.pillar || '').toLowerCase();
      if (p.includes('radha') || p.includes('sangeet')) byPillar.sangeet.push(m);
      else if (p.includes('corporate') || p.includes('veronica')) byPillar.corporate.push(m);
      else if (p.includes('tour')) byPillar.tour.push(m);
      else byPillar.main.push(m);
    });

    // Fill corporate photo strip
    fillPhotoStrip('corpPhotoStrip', byPillar.corporate);
    // Fill sangeet photo strip
    fillPhotoStrip('sangeetPhotoStrip', byPillar.sangeet);

    // Fill hero videos if available
    fillHeroVideos(data);

  } catch (e) {
    // silent fail — site works without DB media
  }
})();

function fillPhotoStrip(stripId, mediaItems) {
  const strip = document.getElementById(stripId);
  if (!strip || !mediaItems.length) return;

  const images = mediaItems.filter(m => m.type === 'image').slice(0, 5);
  if (!images.length) return;

  strip.innerHTML = images.map(m => `
    <div class="anchor-photo" style="overflow:hidden;border-radius:1rem;">
      <img src="${m.url}" alt="${m.name || 'Gallery photo'}"
           style="width:100%;height:100%;object-fit:cover;transition:transform 0.4s ease;"
           loading="lazy"
           onmouseover="this.style.transform='scale(1.05)'"
           onmouseout="this.style.transform='scale(1)'"
      >
    </div>
  `).join('');
}

function fillHeroVideos(allMedia) {
  const videos = allMedia.filter(m => m.type === 'video');
  if (videos.length < 1) return;

  const carousel = document.getElementById('heroCarousel');
  if (!carousel) return;

  // Replace existing static video sources with DB ones
  const heroVids = carousel.querySelectorAll('.hero-vid');
  videos.slice(0, heroVids.length).forEach((m, i) => {
    if (heroVids[i]) {
      const source = heroVids[i].querySelector('source');
      if (source && m.url) {
        source.src = m.url;
        heroVids[i].load();
        if (i === 0) heroVids[i].play();
      }
    }
  });
}
