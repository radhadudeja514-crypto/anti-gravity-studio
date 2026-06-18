/* Global JS Utilities */

// Reveal animations on scroll
function initReveal() {
  const reveals = document.querySelectorAll('.reveal, .animate-fade-up');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  reveals.forEach(r => observer.observe(r));
}
document.addEventListener('DOMContentLoaded', initReveal);

// Mobile Nav
const hamburger = document.getElementById('hamburger');
const navMenu = document.getElementById('nav-menu');
if (hamburger && navMenu) {
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navMenu.classList.toggle('active');
  });
}

// Nav scroll effect
const nav = document.getElementById('site-nav');
if (nav) {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  });
}

// Admin Auth Gate — checks server-side session (HttpOnly cookie) via /api/admin/check
async function checkAdminAuth() {
  // Fast localStorage check first (avoids network call on every page)
  const isAuth = localStorage.getItem('admin_auth') === 'true';
  const expiry = parseInt(localStorage.getItem('admin_auth_expiry') || '0');
  if (!isAuth || Date.now() > expiry) {
    localStorage.removeItem('admin_auth');
    localStorage.removeItem('admin_auth_expiry');
    return false;
  }
  // Also verify backend session is still valid (prevents stale localStorage)
  try {
    const r = await fetch('/api/admin/check',{credentials:'include'});
    const data = await r.json();
    if (!data.authenticated) {
      localStorage.removeItem('admin_auth');
      localStorage.removeItem('admin_auth_expiry');
      return false;
    }
  } catch(e) {
    // Network error: fall back to localStorage state
  }
  return true;
}
function logoutAdmin() {
  fetch('/api/admin/logout', {credentials:'include',  method: 'POST' }).catch(() => {});
  localStorage.removeItem('admin_auth');
  localStorage.removeItem('admin_auth_expiry');
  window.location.href = '/index.html';
}

// Config (Still uses localStorage for simplicity, as these are UI/API settings)
const Config = {
  get: (key) => localStorage.getItem('gig_cfg_' + key) || '',
  set: (key, val) => localStorage.setItem('gig_cfg_' + key, val)
};

// Clipboard
function copyToClipboard(text, successMsg = 'Copied!') {
  navigator.clipboard.writeText(text).then(() => showToast(successMsg));
}

// Toast
function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 100);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, 3000);
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// File Utils
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

// ==========================================
// BACKEND API WRAPPERS (Async)
// ==========================================

// BUG FIX: Was hardcoded to localhost:3005 - now uses relative URL so it works on any domain/port
const API_BASE = '/api';

const Leads = {
  async getAll() {
    try {
      const res = await fetch(`${API_BASE}/leads`);
      return await res.json();
    } catch(e) { console.error('API Error:', e); return []; }
  },
  async add(data) {
    try {
      await fetch(`${API_BASE}/leads`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch(e) { console.error('API Error:', e); }
  },
  async update(id, updates) {
    try {
      await fetch(`${API_BASE}/leads/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch(e) { console.error('API Error:', e); }
  },
  async delete(id) {
    try {
      await fetch(`${API_BASE}/leads/${id}`, { method: 'DELETE' });
    } catch(e) { console.error('API Error:', e); }
  },
  async exportCSV() {
    const leads = await this.getAll();
    if(!leads.length) return alert('No leads to export.');
    const headers = ['Date', 'Pillar', 'Name', 'Phone', 'Email', 'Event Type', 'Event Date', 'Budget', 'Status', 'Message'];
    const rows = leads.map(l => [
      l.timestamp, l.pillar, l.name, l.phone, l.email, 
      l.eventType, l.eventDate, l.budget, l.status, (l.message||'').replace(/,/g, ';')
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Gig_Leads_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }
};

const Media = {
  async getAll() {
    try {
      const res = await fetch(`${API_BASE}/media/public`);
      return await res.json();
    } catch(e) { console.error('API Error:', e); return []; }
  },
  async getByPillar(pillar) {
    const all = await this.getAll();
    return all.filter(m => m.pillar === pillar);
  },
  async add(data) {
    // If it's a file, we should use FormData.
    // If we get here with base64 data, we send it as JSON.
    try {
      await fetch(`${API_BASE}/media`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch(e) { console.error('API Error:', e); }
  },
  async delete(id) {
    try {
      await fetch(`${API_BASE}/media/${id}`, { method: 'DELETE' });
    } catch(e) { console.error('API Error:', e); }
  }
};

const Schedule = {
  async getAll() {
    try {
      const res = await fetch(`${API_BASE}/schedule`);
      return await res.json();
    } catch(e) { console.error('API Error:', e); return []; }
  },
  async add(data) {
    try {
      await fetch(`${API_BASE}/schedule`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch(e) { console.error('API Error:', e); }
  },
  async delete(id) {
    try {
      await fetch(`${API_BASE}/schedule/${id}`, { method: 'DELETE' });
    } catch(e) { console.error('API Error:', e); }
  }
};

// Form Handler
function initEnquiryForm(formId, pillar) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const origText = btn.innerHTML;
    btn.innerHTML = 'Sending...';
    btn.disabled = true;

    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    data.pillar = pillar;
    
    // Save to backend
    await Leads.add(data);

    // Try EmailJS
    const sId = Config.get('emailjs_service');
    const tId = Config.get('emailjs_template');
    const pubKey = Config.get('emailjs_key');
    if (sId && tId && pubKey && window.emailjs) {
      try {
        await emailjs.send(sId, tId, {
          to_name: "Admin",
          from_name: data.name,
          message: `New Lead for ${pillar}:\nPhone: ${data.phone}\nEmail: ${data.email}\nEvent: ${data.eventType}\nMessage: ${data.message}`
        }, pubKey);
      } catch (err) { console.warn("EmailJS error", err); }
    }

    btn.innerHTML = 'Sent Successfully! ✓';
    btn.style.background = '#22c55e';
    form.reset();
    setTimeout(() => {
      btn.innerHTML = origText;
      btn.disabled = false;
      btn.style.background = '';
    }, 3000);
  });
}

// ==========================================
// AWWWARDS-LEVEL UI INTERACTIVITY
// ==========================================

// 1. Custom Cursor
function initCustomCursor() {
  // Only init on non-touch devices
  if (window.matchMedia("(pointer: coarse)").matches) return;
  
  const cursor = document.createElement('div');
  cursor.className = 'custom-cursor';
  const follower = document.createElement('div');
  follower.className = 'custom-cursor-follower';
  
  document.body.appendChild(cursor);
  document.body.appendChild(follower);
  
  let mouseX = 0, mouseY = 0;
  let followerX = 0, followerY = 0;
  
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    cursor.style.left = mouseX + 'px';
    cursor.style.top = mouseY + 'px';
  });
  
  // Smooth follower loop
  function loop() {
    followerX += (mouseX - followerX) * 0.15;
    followerY += (mouseY - followerY) * 0.15;
    follower.style.left = followerX + 'px';
    follower.style.top = followerY + 'px';
    requestAnimationFrame(loop);
  }
  loop();
  
  // Hover effects on clickables
  const clickables = document.querySelectorAll('a, button, input, select, textarea, .media-card, .gallery-item, .tc-btn');
  clickables.forEach(el => {
    el.addEventListener('mouseenter', () => {
      cursor.classList.add('hover');
      follower.classList.add('hover');
    });
    el.addEventListener('mouseleave', () => {
      cursor.classList.remove('hover');
      follower.classList.remove('hover');
    });
  });
}

// 2. Magnetic Buttons
function initMagneticButtons() {
  const magnets = document.querySelectorAll('.magnetic-btn');
  magnets.forEach(btn => {
    btn.addEventListener('mousemove', function(e) {
      const pos = this.getBoundingClientRect();
      const x = e.clientX - pos.left - pos.width / 2;
      const y = e.clientY - pos.top - pos.height / 2;
      this.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
    });
    btn.addEventListener('mouseleave', function() {
      this.style.transform = 'translate(0px, 0px)';
    });
  });
}

// 3. Sticky Booking Bar
function initStickyBar() {
  const bar = document.getElementById('stickyBookingBar');
  if (!bar) return;
  
  window.addEventListener('scroll', () => {
    // Show after scrolling 500px down
    if (window.scrollY > 500) {
      bar.classList.add('visible');
    } else {
      bar.classList.remove('visible');
    }
  });
}

// 4. Testimonial Carousel
function initTestimonials(trackId) {
  const track = document.getElementById(trackId);
  if (!track) return;
  
  let isDown = false;
  let startX;
  let scrollLeft;
  let currentIndex = 0;
  const slides = track.querySelectorAll('.testimonial-slide');
  const slideWidth = 100; // percent
  
  function goToSlide(index) {
    if(index < 0) index = slides.length - 1;
    if(index >= slides.length) index = 0;
    
    slides.forEach((s, i) => {
      s.classList.toggle('active', i === index);
    });
    track.style.transform = `translateX(-${index * slideWidth}%)`;
    currentIndex = index;
  }
  
  // Global buttons if any exist in the same section
  const section = track.closest('.testimonial-section');
  if(section) {
    const prevBtn = section.querySelector('.tc-prev');
    const nextBtn = section.querySelector('.tc-next');
    if(prevBtn) prevBtn.addEventListener('click', () => goToSlide(currentIndex - 1));
    if(nextBtn) nextBtn.addEventListener('click', () => goToSlide(currentIndex + 1));
  }
  
  // Touch / Drag (basic swipe detection)
  track.addEventListener('mousedown', (e) => {
    isDown = true;
    startX = e.pageX;
  });
  track.addEventListener('mouseleave', () => isDown = false);
  track.addEventListener('mouseup', (e) => {
    if(!isDown) return;
    isDown = false;
    const endX = e.pageX;
    if(startX - endX > 50) goToSlide(currentIndex + 1); // swiped left
    if(endX - startX > 50) goToSlide(currentIndex - 1); // swiped right
  });
  track.addEventListener('touchstart', (e) => startX = e.touches[0].clientX);
  track.addEventListener('touchend', (e) => {
    const endX = e.changedTouches[0].clientX;
    if(startX - endX > 50) goToSlide(currentIndex + 1);
    if(endX - startX > 50) goToSlide(currentIndex - 1);
  });
  
  // Init first slide
  goToSlide(0);
}

// 5. Analytics Tracker
function initAnalytics() {
  // Determine Pillar
  let pillar = 'Unknown';
  if(window.location.pathname.includes('pillar-radha')) pillar = 'Radha';
  if(window.location.pathname.includes('pillar-veronica')) pillar = 'Corporate';
  if(window.location.pathname.includes('pillar-tour')) pillar = 'Tour';
  
  if(pillar !== 'Unknown') {
    // 1. Log Page View
    fetch(`${API_BASE}/analytics/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: window.location.href, pillar })
    }).catch(e => console.warn('Analytics View Error', e));
    
    // 2. Track "Book" Button Clicks
    const bookButtons = document.querySelectorAll('a[href="#enquire"], .sticky-bar-btn');
    bookButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        fetch(`${API_BASE}/analytics/event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventName: 'Click_Book_Now', pillar })
        }).catch(e => console.warn('Analytics Event Error', e));
      });
    });
  }
}

// 6. Predictive Prefetching (Performance Innovation)
function initPrefetch() {
  const prefetched = new Set();
  const links = document.querySelectorAll('a[href]');
  
  links.forEach(link => {
    const url = link.getAttribute('href');
    // Only prefetch local HTML pages (not hashes, not external)
    if (url && url.endsWith('.html') && !url.startsWith('http')) {
      link.addEventListener('mouseenter', () => {
        if (prefetched.has(url)) return;
        
        const prefetchLink = document.createElement('link');
        prefetchLink.rel = 'prefetch';
        prefetchLink.href = url;
        document.head.appendChild(prefetchLink);
        
        prefetched.add(url);
        console.log(`[AI Predict] Prefetched: ${url}`);
      }, { once: true }); // Only listen once per link
    }
  });
}

// Run all UI inits
document.addEventListener('DOMContentLoaded', () => {
  // Legacy UI cursors/magnets disabled in favor of modern cursor-fx.js and magnetic.js
  // initCustomCursor();
  // initMagneticButtons();
  initStickyBar();
  initAnalytics();
  initPrefetch();
});
