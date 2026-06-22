/* ============================================================
   ADVANCED.JS — Three.js hero, star ratings, WhatsApp auto,
   voice booking, AI chat, PWA push
   ============================================================ */

/* ── 1. Three.js Particle Hero ── */
function initThreeHero(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.THREE) return;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, canvas.offsetWidth / canvas.offsetHeight, 0.1, 1000);
  camera.position.z = 5;

  // Particle geometry
  const count = 1500;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [
    [0.91, 0.53, 0.12], // radha orange
    [0.16, 0.61, 0.56], // radha teal
    [0.95, 0.79, 0.48], // accent gold
  ];

  for (let i = 0; i < count; i++) {
    pos[i * 3]     = (Math.random() - 0.5) * 20;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
    const c = palette[Math.floor(Math.random() * palette.length)];
    colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
  }

  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({ size: 0.04, vertexColors: true, transparent: true, opacity: 0.7 });
  const particles = new THREE.Points(geo, mat);
  scene.add(particles);

  let mouseX = 0, mouseY = 0;
  document.addEventListener('mousemove', e => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  window.addEventListener('resize', () => {
    renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
    camera.aspect = canvas.offsetWidth / canvas.offsetHeight;
    camera.updateProjectionMatrix();
  });

  (function animate(t = 0) {
    requestAnimationFrame(animate);
    particles.rotation.y = t * 0.0001 + mouseX * 0.1;
    particles.rotation.x = t * 0.00005 - mouseY * 0.05;
    renderer.render(scene, camera);
  })();
}

/* ── 2. Star Rating Testimonials ── */
function buildStarTestimonials(containerId, testimonials) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  testimonials.forEach((t, i) => {
    const stars = '★'.repeat(t.stars || 5) + '☆'.repeat(5 - (t.stars || 5));
    const slide = document.createElement('div');
    slide.className = `testimonial-slide ${i === 0 ? 'active' : ''}`;
    slide.innerHTML = `
      <div class="testimonial-card">
        <div style="color:#F4C97A;font-size:1.4rem;letter-spacing:.1em;margin-bottom:1rem;">${stars}</div>
        <div class="testimonial-text">"${t.text}"</div>
        <div style="display:flex;align-items:center;gap:1rem;justify-content:center;margin-top:1.5rem;">
          ${t.avatar ? `<img src="${t.avatar}" alt="${t.author}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid rgba(232,135,30,.4);"/>` : `<div style="width:48px;height:48px;border-radius:50%;background:rgba(232,135,30,.2);display:flex;align-items:center;justify-content:center;font-size:1.2rem;">${t.emoji || '👤'}</div>`}
          <div style="text-align:left;">
            <div class="testimonial-author">${t.author}</div>
            <div class="testimonial-role">${t.role}</div>
          </div>
        </div>
      </div>`;
    container.appendChild(slide);
  });

  // Auto-rotate every 5s
  let idx = 0;
  const slides = container.querySelectorAll('.testimonial-slide');
  const rotate = () => {
    slides[idx].classList.remove('active');
    idx = (idx + 1) % slides.length;
    slides[idx].classList.add('active');
    // Use scrollTo to match scroll-snap CSS (translateX % is broken with flex)
    const target = slides[idx];
    if(target) container.scrollTo({left: target.offsetLeft, behavior: 'smooth'});
    container.style.transform = '';
  };
  setInterval(rotate, 5000);

  // Hook controls
  const section = container.closest('.testimonial-section');
  if (section) {
    section.querySelector('.tc-prev')?.addEventListener('click', () => {
      slides[idx].classList.remove('active');
      idx = (idx - 1 + slides.length) % slides.length;
      slides[idx].classList.add('active');
      // Use scrollTo to match scroll-snap CSS (translateX % is broken with flex)
    const target = slides[idx];
    if(target) container.scrollTo({left: target.offsetLeft, behavior: 'smooth'});
    container.style.transform = '';
    });
    section.querySelector('.tc-next')?.addEventListener('click', () => rotate());
  }
}

/* ── 3. WhatsApp Auto-Message After Form Submit ── */
function enhanceFormWithWhatsApp(formId, pillar) {
  const form = document.getElementById(formId);
  if (!form) return;

  form.addEventListener('submit', () => {
    const name = form.querySelector('[name="name"]')?.value || '';
    const phone = form.querySelector('[name="phone"]')?.value || '';
    const eventType = form.querySelector('[name="eventType"]')?.value || '';
    const eventDate = form.querySelector('[name="eventDate"]')?.value || '';

    const msg = encodeURIComponent(
      `Hi Radha! I just submitted a booking enquiry.\n\n` +
      `Name: ${name}\nEvent: ${eventType}\nDate: ${eventDate || 'TBD'}\nPhone: ${phone}\n\n` +
      `Looking forward to hearing from you! 🙏`
    );

    // Open WhatsApp after 1.5 second delay (after form success animation)
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = `https://wa.me/918192901515?text=${msg}`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
    }, 1500);
  });
}

/* ── 4. Scarcity Live Counter ── */
function initScarcityCounter(elementId, maxSlots = 4) {
  const el = document.getElementById(elementId);
  if (!el) return;
  // Persist in session so it doesn't flicker on reload
  const key = 'scarcity_slots_' + new Date().toDateString();
  let slots = parseInt(sessionStorage.getItem(key));
  if (isNaN(slots)) {
    slots = Math.floor(Math.random() * 3) + 1; // 1-3 slots
    sessionStorage.setItem(key, slots);
  }
  el.textContent = `🔥 Only ${slots} date${slots > 1 ? 's' : ''} left this month!`;
}

/* ── 5. Scroll-Triggered Count-Up ── */
function initCountUp() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseInt(el.dataset.target);
      const suffix = el.dataset.suffix || (target >= 100 ? '+' : '');
      let cur = 0;
      const step = target / 80;
      const timer = setInterval(() => {
        cur = Math.min(cur + step, target);
        el.textContent = Math.floor(cur) + suffix;
        if (cur >= target) clearInterval(timer);
      }, 20);
      observer.unobserve(el);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-target]').forEach(el => observer.observe(el));
}

/* ── 6. Voice Booking (Web Speech API) ── */
function initVoiceBooking(triggerBtnId) {
  const btn = document.getElementById(triggerBtnId);
  if (!btn || !window.SpeechRecognition && !window.webkitSpeechRecognition) return;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SR();
  recognition.lang = 'en-IN';
  recognition.continuous = false;
  recognition.interimResults = false;

  btn.addEventListener('click', () => {
    recognition.start();
    btn.textContent = '🎤 Listening...';
    btn.style.background = 'rgba(232,135,30,.2)';
  });

  recognition.onresult = e => {
    const transcript = e.results[0][0].transcript.toLowerCase();
    btn.textContent = '🎤 Voice Book';
    btn.style.background = '';

    // Parse date mentions
    let date = '';
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    months.forEach((m, i) => {
      if (transcript.includes(m)) {
        const match = transcript.match(new RegExp(`(\\d+)\\s*${m}`));
        const day = match ? match[1].padStart(2,'0') : '15';
        const yr = new Date().getFullYear() + (i < new Date().getMonth() ? 1 : 0);
        date = `${yr}-${String(i+1).padStart(2,'0')}-${day}`;
      }
    });

    if (date) {
      const dateInput = document.querySelector('[name="eventDate"], #bDate');
      if (dateInput) { dateInput.value = date; dateInput.dispatchEvent(new Event('change')); }
    }

    // Parse event type
    const typeMap = { 'sangeet': 'Sangeet', 'wedding': 'Wedding Ceremony', 'corporate': 'Corporate Conference', 'tour': 'Heritage Tour', 'haldi': 'Mehendi / Haldi' };
    Object.entries(typeMap).forEach(([kw, val]) => {
      if (transcript.includes(kw)) {
        const sel = document.querySelector('[name="eventType"], #bEventType');
        if (sel) { [...sel.options].forEach(o => { if (o.value === val) o.selected = true; }); }
      }
    });

    if (date) showToast(`Booking date set: ${date} — check the form!`);
  };

  recognition.onerror = () => { btn.textContent = '🎤 Voice Book'; btn.style.background = ''; };
}

/* ── 7. PWA Install Prompt ── */
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const banner = document.getElementById('pwaInstallBanner');
  if (banner) banner.style.display = 'flex';
});

function installPWA() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then(() => {
    deferredInstallPrompt = null;
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.style.display = 'none';
  });
}

/* ── 8. Page View Fade Transition ── */
function initPageTransitions() {
  document.querySelectorAll('a[href]').forEach(link => {
    const url = link.getAttribute('href');
    if (!url || url.startsWith('#') || url.startsWith('http') || url.startsWith('mailto') || url.startsWith('tel') || url.startsWith('upi') || url.startsWith('https://wa.me')) return;
    link.addEventListener('click', e => {
      e.preventDefault();
      document.body.style.opacity = '0';
      document.body.style.transition = 'opacity .35s ease';
      setTimeout(() => window.location.href = url, 350);
    });
  });
  document.body.style.opacity = '1';
  document.body.style.transition = 'opacity .35s ease';
}

/* ── 9. Init PWA Service Worker ── */
function initSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

/* ── 10. Run All ── */
document.addEventListener('DOMContentLoaded', () => {
  initCountUp();
  initPageTransitions();
  initSW();
  // Scarcity counters — call initScarcityCounter('elementId') on pages that need it
});
