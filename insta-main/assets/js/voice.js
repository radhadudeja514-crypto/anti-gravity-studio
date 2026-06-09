/**
 * assets/js/voice.js
 * Web Speech API voice booking & command support
 */

export function initVoice() {
  const btn = document.getElementById('voice-btn');
  if (!btn) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    btn.setAttribute('title', 'Voice not supported in this browser');
    btn.style.opacity = '0.4';
    btn.disabled = true;
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang        = 'en-IN';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let listening = false;

  btn.setAttribute('aria-label', 'Start voice command');
  btn.setAttribute('aria-pressed', 'false');

  btn.addEventListener('click', () => {
    if (listening) {
      recognition.stop();
    } else {
      recognition.start();
    }
  });

  recognition.addEventListener('start', () => {
    listening = true;
    btn.setAttribute('aria-pressed', 'true');
    btn.classList.add('voice-active');
    showVoiceStatus('Listening…');
  });

  recognition.addEventListener('end', () => {
    listening = false;
    btn.setAttribute('aria-pressed', 'false');
    btn.classList.remove('voice-active');
    hideVoiceStatus();
  });

  recognition.addEventListener('error', e => {
    console.warn('Voice error:', e.error);
    showVoiceStatus(`Error: ${e.error}`, true);
    setTimeout(hideVoiceStatus, 3000);
  });

  recognition.addEventListener('result', e => {
    const transcript = e.results[0][0].transcript.toLowerCase().trim();
    handleVoiceCommand(transcript);
  });
}

function handleVoiceCommand(text) {
  // Fill booking form fields if present
  const nameEl      = document.getElementById('booking-name');
  const phoneEl     = document.getElementById('booking-phone');
  const msgEl       = document.getElementById('booking-message');
  const eventTypeEl = document.getElementById('booking-event-type');

  if (nameEl && text.includes('my name is')) {
    const name = text.split('my name is')[1].trim();
    nameEl.value = capitalise(name);
    nameEl.dispatchEvent(new Event('input'));
    return;
  }
  if (phoneEl && /\d{10}/.test(text)) {
    phoneEl.value = text.match(/\d{10}/)[0];
    return;
  }
  if (eventTypeEl) {
    if (text.includes('wedding')) eventTypeEl.value = 'wedding';
    else if (text.includes('corporate')) eventTypeEl.value = 'corporate';
    else if (text.includes('tour')) eventTypeEl.value = 'tour';
  }
  if (msgEl && text.includes('message')) {
    const msg = text.split('message')[1].trim();
    if (msg) msgEl.value = msg;
    return;
  }

  // Navigation commands
  if (text.includes('go to booking') || text.includes('book now'))
    return window.location.assign('/booking.html');
  if (text.includes('go home') || text.includes('homepage'))
    return window.location.assign('/index.html');
  if (text.includes('admin'))
    return window.location.assign('/admin/login.html');

  showVoiceStatus(`Heard: "${text}" — try "my name is…" or "go to booking"`, false);
  setTimeout(hideVoiceStatus, 4000);
}

function showVoiceStatus(msg, isError = false) {
  let el = document.getElementById('voice-status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'voice-status';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = [
      'position:fixed', 'bottom:1.5rem', 'left:50%', 'transform:translateX(-50%)',
      'background:rgba(10,10,15,0.95)', 'border:1px solid rgba(0,249,255,0.3)',
      'color:#fff', 'padding:0.75rem 1.5rem', 'border-radius:999px',
      'font-size:0.85rem', 'z-index:9999', 'backdrop-filter:blur(12px)',
    ].join(';');
    document.body.appendChild(el);
  }
  el.style.borderColor = isError ? 'rgba(255,100,100,0.4)' : 'rgba(0,249,255,0.3)';
  el.textContent = msg;
  el.style.display = 'block';
}

function hideVoiceStatus() {
  const el = document.getElementById('voice-status');
  if (el) el.style.display = 'none';
}

function capitalise(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}
