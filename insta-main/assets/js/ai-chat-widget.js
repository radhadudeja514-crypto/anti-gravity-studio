/**
 * Anti Gravity Studio — AI Chat Widget
 * ─────────────────────────────────────
 * Self-contained chatbot with DOM + CSS injection.
 * No dependencies, no server — pure client-side intent matching.
 *
 * @version 2.0.0
 * @license MIT
 */
;(function () {
  'use strict';

  /* ── Feature / Preference Checks ─────────────────────────── */
  var reducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Constants ───────────────────────────────────────────── */
  var BRAND = {
    cyan: '#00f9ff',
    magenta: '#ff00aa',
    purple: '#9d4edd',
    orange: '#e8871e',
    dark: '#0a0a0f',
    glass: 'rgba(14,14,22,0.82)',
    glassBorder: 'rgba(255,255,255,0.08)',
  };

  var SESSION_KEY = 'ag_chat_history';
  var OPENED_KEY  = 'ag_chat_auto_opened';
  var AUTO_OPEN_DELAY = 30000; // 30 s

  var GREETING =
    "Hey! 👋 I'm the Anti Gravity AI. Ask me about our wedding hosting, corporate events, or heritage tours!";

  /* ── Intent Definitions ──────────────────────────────────── */
  var INTENTS = [
    {
      keys: ['wedding', 'sangeet', 'radha', 'marriage', 'shaadi', 'mehendi', 'haldi'],
      response:
        "💍 <strong>Radha — Wedding & Family Events</strong><br><br>" +
        "From intimate sangeet nights to grand celebrations, Radha brings heart and soul to every family milestone.<br><br>" +
        "✦ 500+ events hosted across India<br>" +
        "✦ Sangeet choreography & MC hosting<br>" +
        "✦ Packages starting at <strong>₹25,000</strong><br>" +
        "✦ Premium packages up to <strong>₹5,00,000+</strong><br><br>" +
        "Shall I share our wedding brochure? 🎉",
    },
    {
      keys: ['corporate', 'conference', 'veronica', 'summit', 'seminar', 'office', 'company', 'brand'],
      response:
        "🎤 <strong>Veronica — Corporate Events</strong><br><br>" +
        "Elevate your corporate gatherings with world-class MC hosting and event production.<br><br>" +
        "✦ Tech summits & product launches<br>" +
        "✦ Award nights & gala dinners<br>" +
        "✦ Panel moderation & keynote hosting<br>" +
        "✦ Premium & custom pricing<br><br>" +
        "Let's make your next event unforgettable! 🚀",
    },
    {
      keys: ['tour', 'travel', 'heritage', 'trail', 'walk', 'city', 'explore', 'culture'],
      response:
        "🏛️ <strong>Tour — Heritage Walks & Trails</strong><br><br>" +
        "Discover India's hidden stories through immersive heritage experiences.<br><br>" +
        "✦ 50+ cities covered<br>" +
        "✦ Curated cultural immersion walks<br>" +
        "✦ Group & private tours available<br>" +
        "✦ Food trails, architecture walks & more<br><br>" +
        "Where would you like to explore? 🗺️",
    },
    {
      keys: ['price', 'cost', 'budget', 'rate', 'charge', 'fee', 'pricing', 'package'],
      response:
        "💰 <strong>Pricing Overview</strong><br><br>" +
        "<strong>Radha (Weddings)</strong><br>" +
        "  • Starter — ₹25,000<br>" +
        "  • Classic — ₹75,000<br>" +
        "  • Premium — ₹2,00,000<br>" +
        "  • Royal — ₹5,00,000+<br><br>" +
        "<strong>Veronica (Corporate)</strong><br>" +
        "  • Custom quotes based on scope<br>" +
        "  • Half-day / Full-day packages<br><br>" +
        "<strong>Tour (Heritage)</strong><br>" +
        "  • Group walks from ₹500/person<br>" +
        "  • Private tours from ₹5,000<br><br>" +
        "Want a detailed quote? Just ask! 📋",
    },
    {
      keys: ['book', 'date', 'available', 'reserve', 'slot', 'schedule'],
      response:
        "📅 Great! Let's lock in your date.<br><br>" +
        "Click below to head to our booking page, or tell me more about what you're planning and I'll guide you.<br><br>" +
        '<button class="ag-chat-action-btn" onclick="window.open(\'#booking\',\'_self\')">📅 Book Now</button>',
    },
    {
      keys: ['contact', 'phone', 'whatsapp', 'email', 'call', 'reach', 'number'],
      response:
        "📞 <strong>Get in Touch</strong><br><br>" +
        "✦ WhatsApp: <a href='https://wa.me/919876543210' target='_blank' rel='noopener' style='color:" +
        BRAND.cyan +
        "'>+91 98765 43210</a><br>" +
        "✦ Email: hello@antigravitystudio.in<br>" +
        "✦ Instagram: @anti.gravity.studio<br><br>" +
        "We typically respond within 2 hours! ⚡",
    },
  ];

  var FALLBACK =
    "I can help with <strong>Wedding Hosting</strong>, <strong>Corporate Events</strong>, or <strong>Heritage Tours</strong>. Which interests you?";

  var QUICK_REPLIES = ['Wedding Hosting', 'Corporate MC', 'Heritage Tours'];

  /* ── CSS Injection ───────────────────────────────────────── */
  function injectStyles() {
    var css = [
      /* ----- Reset & Host ----- */
      '#ag-chat-fab,#ag-chat-window,#ag-chat-window *{box-sizing:border-box;margin:0;padding:0;font-family:"Inter","Segoe UI",system-ui,-apple-system,sans-serif;}',

      /* ----- Floating Action Button ----- */
      '#ag-chat-fab{',
      '  position:fixed;bottom:28px;right:28px;z-index:99999;',
      '  width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;',
      '  background:linear-gradient(135deg,' + BRAND.cyan + ',' + BRAND.magenta + ');',
      '  color:#fff;font-size:26px;display:flex;align-items:center;justify-content:center;',
      '  box-shadow:0 4px 24px rgba(0,249,255,0.3),0 0 0 0 rgba(0,249,255,0.4);',
      '  transition:transform .3s cubic-bezier(.16,1,.3,1),box-shadow .3s ease;',
      reducedMotion ? '' : '  animation:ag-fab-pulse 2.5s infinite;',
      '}',
      '#ag-chat-fab:hover{transform:scale(1.08);}',
      '#ag-chat-fab.ag-hidden{transform:scale(0);pointer-events:none;}',

      '@keyframes ag-fab-pulse{',
      '  0%,100%{box-shadow:0 4px 24px rgba(0,249,255,0.25),0 0 0 0 rgba(0,249,255,0.35);}',
      '  50%{box-shadow:0 4px 32px rgba(0,249,255,0.35),0 0 0 12px rgba(0,249,255,0);}',
      '}',

      /* ----- Chat Window ----- */
      '#ag-chat-window{',
      '  position:fixed;bottom:96px;right:28px;z-index:99999;',
      '  width:380px;height:520px;border-radius:20px;overflow:hidden;',
      '  display:flex;flex-direction:column;',
      '  background:' + BRAND.glass + ';',
      '  border:1px solid ' + BRAND.glassBorder + ';',
      '  backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);',
      '  box-shadow:0 24px 80px rgba(0,0,0,0.55),0 0 1px rgba(255,255,255,0.08);',
      '  transform:translateY(20px) scale(0.96);opacity:0;pointer-events:none;',
      '  transition:transform .4s cubic-bezier(.16,1,.3,1),opacity .4s ease;',
      '}',
      '#ag-chat-window.ag-open{transform:translateY(0) scale(1);opacity:1;pointer-events:auto;}',

      /* ----- Header ----- */
      '.ag-chat-header{',
      '  display:flex;align-items:center;padding:16px 18px;',
      '  background:linear-gradient(135deg,rgba(0,249,255,0.08),rgba(255,0,170,0.06));',
      '  border-bottom:1px solid ' + BRAND.glassBorder + ';flex-shrink:0;',
      '}',
      '.ag-chat-avatar{',
      '  width:36px;height:36px;border-radius:50%;',
      '  background:linear-gradient(135deg,' + BRAND.cyan + ',' + BRAND.magenta + ');',
      '  display:flex;align-items:center;justify-content:center;font-size:18px;margin-right:12px;flex-shrink:0;',
      '}',
      '.ag-chat-header-info{flex:1;}',
      '.ag-chat-header-title{font-size:14px;font-weight:600;color:#fff;}',
      '.ag-chat-header-status{font-size:11px;color:rgba(255,255,255,0.55);display:flex;align-items:center;gap:5px;margin-top:2px;}',
      '.ag-status-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;display:inline-block;' +
        (reducedMotion ? '' : 'animation:ag-status-blink 2s infinite;') + '}',
      '@keyframes ag-status-blink{0%,100%{opacity:1;}50%{opacity:.4;}}',
      '.ag-chat-close{',
      '  background:none;border:none;color:rgba(255,255,255,0.5);font-size:22px;cursor:pointer;',
      '  width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;',
      '  transition:background .2s,color .2s;',
      '}',
      '.ag-chat-close:hover{background:rgba(255,255,255,0.08);color:#fff;}',

      /* ----- Messages Area ----- */
      '.ag-chat-messages{',
      '  flex:1;overflow-y:auto;padding:18px 14px;display:flex;flex-direction:column;gap:10px;',
      '  scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.12) transparent;',
      '}',
      '.ag-chat-messages::-webkit-scrollbar{width:5px;}',
      '.ag-chat-messages::-webkit-scrollbar-track{background:transparent;}',
      '.ag-chat-messages::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:4px;}',

      /* ----- Bubbles ----- */
      '.ag-msg{max-width:85%;display:flex;flex-direction:column;' + (reducedMotion ? '' : 'animation:ag-msg-in .35s cubic-bezier(.16,1,.3,1);') + '}',
      '.ag-msg-bot{align-self:flex-start;}',
      '.ag-msg-user{align-self:flex-end;}',
      '.ag-msg-bubble{',
      '  padding:12px 16px;border-radius:16px;font-size:13.5px;line-height:1.55;color:#eee;word-break:break-word;',
      '}',
      '.ag-msg-bot .ag-msg-bubble{',
      '  background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.06);border-bottom-left-radius:4px;',
      '}',
      '.ag-msg-user .ag-msg-bubble{',
      '  background:linear-gradient(135deg,' + BRAND.cyan + '22,' + BRAND.magenta + '22);',
      '  border:1px solid ' + BRAND.cyan + '33;border-bottom-right-radius:4px;',
      '}',
      '.ag-msg-time{font-size:10px;color:rgba(255,255,255,0.3);margin-top:4px;padding:0 4px;}',
      '.ag-msg-bot .ag-msg-time{text-align:left;}',
      '.ag-msg-user .ag-msg-time{text-align:right;}',

      '.ag-msg-bubble a{color:' + BRAND.cyan + ';text-decoration:none;}',
      '.ag-msg-bubble a:hover{text-decoration:underline;}',

      '.ag-chat-action-btn{',
      '  display:inline-block;margin-top:8px;padding:8px 20px;border:none;border-radius:10px;cursor:pointer;',
      '  background:linear-gradient(135deg,' + BRAND.cyan + ',' + BRAND.magenta + ');',
      '  color:#fff;font-size:13px;font-weight:600;transition:opacity .2s;',
      '}',
      '.ag-chat-action-btn:hover{opacity:.85;}',

      '@keyframes ag-msg-in{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}',

      /* ----- Typing Indicator ----- */
      '.ag-typing{display:flex;gap:5px;align-items:center;padding:12px 16px;}',
      '.ag-typing-dot{',
      '  width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,0.35);',
      reducedMotion ? '' : '  animation:ag-typing-bounce .6s ease-in-out infinite;',
      '}',
      '.ag-typing-dot:nth-child(2){animation-delay:.15s;}',
      '.ag-typing-dot:nth-child(3){animation-delay:.3s;}',
      '@keyframes ag-typing-bounce{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}',

      /* ----- Quick Replies ----- */
      '.ag-quick-replies{',
      '  display:flex;gap:8px;padding:8px 14px;flex-shrink:0;overflow-x:auto;',
      '}',
      '.ag-quick-chip{',
      '  padding:7px 14px;border-radius:20px;font-size:12px;font-weight:500;white-space:nowrap;cursor:pointer;',
      '  background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);',
      '  transition:background .2s,border-color .2s,color .2s;flex-shrink:0;',
      '}',
      '.ag-quick-chip:hover{background:rgba(0,249,255,0.1);border-color:' + BRAND.cyan + '55;color:' + BRAND.cyan + ';}',

      /* ----- Input Area ----- */
      '.ag-chat-input-wrap{',
      '  display:flex;align-items:center;padding:12px 14px;gap:10px;flex-shrink:0;',
      '  border-top:1px solid ' + BRAND.glassBorder + ';',
      '}',
      '.ag-chat-input{',
      '  flex:1;padding:10px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);',
      '  background:rgba(255,255,255,0.04);color:#eee;font-size:13.5px;outline:none;',
      '  transition:border-color .2s;',
      '}',
      '.ag-chat-input::placeholder{color:rgba(255,255,255,0.3);}',
      '.ag-chat-input:focus{border-color:' + BRAND.cyan + '55;}',
      '.ag-chat-send{',
      '  width:38px;height:38px;border-radius:10px;border:none;cursor:pointer;flex-shrink:0;',
      '  background:linear-gradient(135deg,' + BRAND.cyan + ',' + BRAND.magenta + ');',
      '  color:#fff;font-size:16px;display:flex;align-items:center;justify-content:center;',
      '  transition:opacity .2s,transform .15s;',
      '}',
      '.ag-chat-send:hover{opacity:.85;}',
      '.ag-chat-send:active{transform:scale(.92);}',

      /* ----- Mobile ----- */
      '@media(max-width:480px){',
      '  #ag-chat-window{',
      '    width:100%;height:100%;bottom:0;right:0;border-radius:0;',
      '    max-height:100dvh;',
      '  }',
      '  #ag-chat-fab{bottom:18px;right:18px;}',
      '}',

      /* ----- Notification badge ----- */
      '.ag-chat-badge{',
      '  position:absolute;top:-2px;right:-2px;width:18px;height:18px;border-radius:50%;',
      '  background:' + BRAND.magenta + ';font-size:10px;color:#fff;',
      '  display:flex;align-items:center;justify-content:center;font-weight:700;',
      '  transform:scale(0);transition:transform .3s cubic-bezier(.16,1,.3,1);',
      '}',
      '.ag-chat-badge.ag-show{transform:scale(1);}',
    ].join('\n');

    var style = document.createElement('style');
    style.id = 'ag-chat-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ── DOM Construction ────────────────────────────────────── */
  function buildDOM() {
    /* FAB */
    var fab = document.createElement('button');
    fab.id = 'ag-chat-fab';
    fab.setAttribute('aria-label', 'Open chat');
    fab.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

    var badge = document.createElement('span');
    badge.className = 'ag-chat-badge';
    badge.textContent = '1';
    fab.appendChild(badge);

    /* Window */
    var win = document.createElement('div');
    win.id = 'ag-chat-window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'Chat with Anti Gravity AI');
    win.innerHTML = [
      '<div class="ag-chat-header">',
      '  <div class="ag-chat-avatar">✦</div>',
      '  <div class="ag-chat-header-info">',
      '    <div class="ag-chat-header-title">AI Assistant</div>',
      '    <div class="ag-chat-header-status"><span class="ag-status-dot"></span> Online</div>',
      '  </div>',
      '  <button class="ag-chat-close" aria-label="Close chat">&times;</button>',
      '</div>',
      '<div class="ag-chat-messages" aria-live="polite"></div>',
      '<div class="ag-quick-replies"></div>',
      '<div class="ag-chat-input-wrap">',
      '  <input class="ag-chat-input" type="text" placeholder="Type a message…" autocomplete="off" />',
      '  <button class="ag-chat-send" aria-label="Send message">',
      '    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
      '  </button>',
      '</div>',
    ].join('\n');

    document.body.appendChild(fab);
    document.body.appendChild(win);

    return { fab: fab, badge: badge, win: win };
  }

  /* ── Audio (Web Audio API — tiny "ding") ─────────────────── */
  var audioCtx = null;

  function playDing() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.25);
    } catch (_) {
      /* Audio not available — silent fallback */
    }
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function timeStamp() {
    var d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
  }

  function escapeHTML(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  /* ── Intent Matching ─────────────────────────────────────── */
  function matchIntent(text) {
    var lower = text.toLowerCase();
    for (var i = 0; i < INTENTS.length; i++) {
      for (var k = 0; k < INTENTS[i].keys.length; k++) {
        if (lower.indexOf(INTENTS[i].keys[k]) !== -1) {
          return INTENTS[i].response;
        }
      }
    }
    return null;
  }

  /* ── Session Storage ─────────────────────────────────────── */
  function saveHistory(messages) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages));
    } catch (_) {}
  }

  function loadHistory() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  /* ── Main Controller ─────────────────────────────────────── */
  function init() {
    injectStyles();
    var els = buildDOM();

    var fab = els.fab;
    var badge = els.badge;
    var win = els.win;
    var messagesEl = win.querySelector('.ag-chat-messages');
    var inputEl = win.querySelector('.ag-chat-input');
    var sendBtn = win.querySelector('.ag-chat-send');
    var closeBtn = win.querySelector('.ag-chat-close');
    var quickWrap = win.querySelector('.ag-quick-replies');

    var chatOpen = false;
    var history = loadHistory();
    var isTyping = false;

    /* ── Render Quick Replies ─── */
    function renderQuickReplies() {
      quickWrap.innerHTML = '';
      for (var i = 0; i < QUICK_REPLIES.length; i++) {
        (function (label) {
          var chip = document.createElement('button');
          chip.className = 'ag-quick-chip';
          chip.textContent = label;
          chip.addEventListener('click', function () {
            handleUserMessage(label);
          });
          quickWrap.appendChild(chip);
        })(QUICK_REPLIES[i]);
      }
    }

    /* ── Append Message to DOM ─── */
    function appendMessage(role, html, time, skipAnim) {
      var wrap = document.createElement('div');
      wrap.className = 'ag-msg ag-msg-' + role;
      if (skipAnim && !reducedMotion) {
        wrap.style.animation = 'none';
      }

      var bubble = document.createElement('div');
      bubble.className = 'ag-msg-bubble';
      bubble.innerHTML = html;

      var ts = document.createElement('div');
      ts.className = 'ag-msg-time';
      ts.textContent = time || timeStamp();

      wrap.appendChild(bubble);
      wrap.appendChild(ts);
      messagesEl.appendChild(wrap);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    /* ── Typing Indicator ─── */
    function showTyping() {
      isTyping = true;
      var wrap = document.createElement('div');
      wrap.className = 'ag-msg ag-msg-bot';
      wrap.id = 'ag-typing-indicator';
      wrap.innerHTML =
        '<div class="ag-msg-bubble"><div class="ag-typing">' +
        '<span class="ag-typing-dot"></span>' +
        '<span class="ag-typing-dot"></span>' +
        '<span class="ag-typing-dot"></span>' +
        '</div></div>';
      messagesEl.appendChild(wrap);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function hideTyping() {
      isTyping = false;
      var el = document.getElementById('ag-typing-indicator');
      if (el) el.remove();
    }

    /* ── Bot Reply Logic ─── */
    function botReply(responseHTML, delay) {
      delay = typeof delay === 'number' ? delay : (reducedMotion ? 200 : 1100);
      showTyping();
      setTimeout(function () {
        hideTyping();
        var ts = timeStamp();
        appendMessage('bot', responseHTML, ts);
        playDing();
        history.push({ role: 'bot', html: responseHTML, time: ts });
        saveHistory(history);
      }, delay);
    }

    /* ── Handle User Input ─── */
    function handleUserMessage(text) {
      if (!text || !text.trim()) return;
      text = text.trim();

      var ts = timeStamp();
      appendMessage('user', escapeHTML(text), ts);
      history.push({ role: 'user', html: escapeHTML(text), time: ts });
      saveHistory(history);

      inputEl.value = '';
      inputEl.focus();

      var match = matchIntent(text);
      if (match) {
        botReply(match);
      } else {
        /* Fallback with quick reply buttons embedded */
        var fallbackHTML = FALLBACK +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;">' +
          '<button class="ag-chat-action-btn" style="font-size:12px;padding:6px 14px;" onclick="document.querySelector(\'.ag-chat-input\').value=\'Wedding Hosting\';document.querySelector(\'.ag-chat-send\').click();">💍 Weddings</button>' +
          '<button class="ag-chat-action-btn" style="font-size:12px;padding:6px 14px;" onclick="document.querySelector(\'.ag-chat-input\').value=\'Corporate Events\';document.querySelector(\'.ag-chat-send\').click();">🎤 Corporate</button>' +
          '<button class="ag-chat-action-btn" style="font-size:12px;padding:6px 14px;" onclick="document.querySelector(\'.ag-chat-input\').value=\'Heritage Tours\';document.querySelector(\'.ag-chat-send\').click();">🏛️ Tours</button>' +
          '</div>';
        botReply(fallbackHTML);
      }
    }

    /* ── Restore History ─── */
    function restoreHistory() {
      if (history.length === 0) return;
      for (var i = 0; i < history.length; i++) {
        appendMessage(history[i].role, history[i].html, history[i].time, true);
      }
    }

    /* ── Toggle Window ─── */
    function openChat() {
      chatOpen = true;
      win.classList.add('ag-open');
      fab.classList.add('ag-hidden');
      badge.classList.remove('ag-show');
      inputEl.focus();

      if (history.length === 0) {
        botReply(GREETING, reducedMotion ? 100 : 600);
      }
    }

    function closeChat() {
      chatOpen = false;
      win.classList.remove('ag-open');
      fab.classList.remove('ag-hidden');
    }

    /* ── Events ─── */
    fab.addEventListener('click', openChat);
    closeBtn.addEventListener('click', closeChat);

    sendBtn.addEventListener('click', function () {
      handleUserMessage(inputEl.value);
    });

    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleUserMessage(inputEl.value);
      }
    });

    /* Close on Escape */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && chatOpen) closeChat();
    });

    /* ── Init ─── */
    renderQuickReplies();
    restoreHistory();

    /* Auto-open after 30 s (once per session) */
    try {
      if (!sessionStorage.getItem(OPENED_KEY)) {
        setTimeout(function () {
          if (!chatOpen) {
            badge.classList.add('ag-show');
            /* If user still hasn't opened, auto-open */
            setTimeout(function () {
              if (!chatOpen) {
                openChat();
                sessionStorage.setItem(OPENED_KEY, '1');
              }
            }, 3000); // badge shows for 3 s, then auto opens
          }
        }, AUTO_OPEN_DELAY);
      }
    } catch (_) {}
  }

  /* ── Bootstrap ───────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
