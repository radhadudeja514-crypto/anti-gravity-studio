// Landing Page JS

async function initDynamicHero() {
  const mainMedia = await Media.getByPillar('Main');
  const videos = mainMedia.filter(m => m.url.endsWith('.mp4')).slice(0, 3);
  const photos = mainMedia.filter(m => m.url.match(/\.(jpg|jpeg|png|webp)$/i)).slice(0, 5);
  
  const heroWrap = document.getElementById('heroCarousel');
  const dotsWrap = document.querySelector('.hero-dots');
  
  if (videos.length > 0 || photos.length > 0) {
    heroWrap.innerHTML = '';
    dotsWrap.innerHTML = '';
    const allMedia = [...videos, ...photos];
    
    allMedia.forEach((media, index) => {
      let el;
      if(media.url.endsWith('.mp4')) {
        el = document.createElement('video');
        el.className = `hero-vid ${index === 0 ? 'active' : ''}`;
        el.src = media.url;
        el.muted = true;
        el.loop = true;
        el.playsInline = true;
        if(index === 0) el.autoplay = true;
      } else {
        el = document.createElement('img');
        el.className = `hero-vid ${index === 0 ? 'active' : ''}`; // keep class for css fading
        el.src = media.url;
        el.style.objectFit = 'cover';
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.position = 'absolute';
      }
      heroWrap.appendChild(el);
      
      const dot = document.createElement('button');
      dot.className = `hero-dot ${index === 0 ? 'active' : ''}`;
      dot.dataset.index = index;
      dotsWrap.appendChild(dot);
    });
    
    const overlay = document.createElement('div');
    overlay.className = 'hero-overlay';
    heroWrap.appendChild(overlay);
    
    const heroItems = heroWrap.querySelectorAll('.hero-vid');
    const heroDots = dotsWrap.querySelectorAll('.hero-dot');
    let heroIdx = 0;
    let heroTimer;

    function switchHero(idx) {
      heroItems[heroIdx].classList.remove('active');
      heroDots[heroIdx].classList.remove('active');
      heroIdx = (idx + heroItems.length) % heroItems.length;
      heroItems[heroIdx].classList.add('active');
      heroDots[heroIdx].classList.add('active');
      try { if(heroItems[heroIdx].play) heroItems[heroIdx].play(); } catch(e){}
    }

    function startHeroTimer() {
      heroTimer = setInterval(() => switchHero(heroIdx + 1), 6000);
    }

    heroDots.forEach((dot, i) => dot.addEventListener('click', () => { clearInterval(heroTimer); switchHero(i); startHeroTimer(); }));
    startHeroTimer();
  } else {
    // Keep existing fallback behavior from hardcoded HTML
    const fallbackVids = document.querySelectorAll('.hero-vid');
    const fallbackDots = document.querySelectorAll('.hero-dot');
    if (fallbackVids.length) {
      let fallbackIdx = 0;
      function switchFallback(idx) {
        fallbackVids[fallbackIdx].classList.remove('active');
        fallbackDots[fallbackIdx].classList.remove('active');
        fallbackIdx = (idx + fallbackVids.length) % fallbackVids.length;
        fallbackVids[fallbackIdx].classList.add('active');
        fallbackDots[fallbackIdx].classList.add('active');
        try { fallbackVids[fallbackIdx].play(); } catch(e){}
      }
      let fallbackTimer = setInterval(() => switchFallback(fallbackIdx + 1), 6000);
      fallbackDots.forEach((dot, i) => dot.addEventListener('click', () => { clearInterval(fallbackTimer); switchFallback(i); fallbackTimer = setInterval(() => switchFallback(fallbackIdx + 1), 6000); }));
    }
  }
}
initDynamicHero();

// ── Anchor Video Carousels ──
function initAnchorCarousel(carouselId) {
  const wrap = document.getElementById(carouselId);
  if (!wrap) return;
  const vids = wrap.querySelectorAll('.anchor-vid');
  if (!vids.length) return;
  let cur = 0;

  function show(i) {
    vids[cur].classList.remove('active');
    cur = (i + vids.length) % vids.length;
    vids[cur].classList.add('active');
    try { vids[cur].play(); } catch(e){}
  }

  wrap.querySelector('.prev')?.addEventListener('click', () => show(cur - 1));
  wrap.querySelector('.next')?.addEventListener('click', () => show(cur + 1));
  setInterval(() => show(cur + 1), 8000);
}

initAnchorCarousel('corpVideoCarousel');
initAnchorCarousel('sangeetVideoCarousel');

// ── Counting Stat Animation ──
function animateCount(el) {
  const target = parseInt(el.dataset.target);
  const duration = 2000;
  const step = target / (duration / 16);
  let cur = 0;
  const timer = setInterval(() => {
    cur = Math.min(cur + step, target);
    el.textContent = Math.floor(cur) + (target >= 100 ? '+' : '');
    if (cur >= target) clearInterval(timer);
  }, 16);
}

const statObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animateCount(entry.target);
      statObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('.stat-num').forEach(el => statObserver.observe(el));

// ── Enquiry Form ──
initEnquiryForm('mainEnquiryForm', 'Landing');

// ── Load Admin Media into Anchors ──
async function loadAdminMedia() {
  const corpMedia = await Media.getByPillar('Corporate');
  const radhaMedia = await Media.getByPillar('Radha');

  const loadStrip = (stripId, items) => {
    const strip = document.getElementById(stripId);
    if (!strip || !items.length) return;
    strip.innerHTML = '';
    items.slice(0, 8).forEach(item => {
      const div = document.createElement('div');
      div.className = 'anchor-photo';
      if (item.url.match(/\.(jpg|jpeg|png|webp|gif)$/i) || item.type === 'image') {
        div.innerHTML = `<img src="${item.url}" alt="${item.name}" loading="lazy"/>`;
      }
      strip.appendChild(div);
    });
  };

  loadStrip('corpPhotoStrip', corpMedia);
  loadStrip('sangeetPhotoStrip', radhaMedia);
}

loadAdminMedia();
