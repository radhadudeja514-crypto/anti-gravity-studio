/**
 * ai-assistant.js
 * COST-FREE AI assistant for Anti-Gravity Studio.
 * Uses ZERO external APIs. Powered by:
 *  - Rule-based intent detection (keyword matching + scoring)
 *  - Pre-built knowledge graph of all 3 pillars
 *  - Browser Web Speech API for voice input (optional)
 *  - Injected as a floating widget on all public pages
 */

(function() {
  'use strict';

  // ── Knowledge Base ────────────────────────────────────────────────────────
  const KB = {
    intents: [
      {
        patterns: ['price', 'cost', 'fee', 'rate', 'charge', 'how much', 'budget', 'package', 'affordable'],
        response: (ctx) => {
          const pillar = ctx.pillar;
          if (pillar === 'radha') return "💍 **Radhaa (Wedding)** packages start on request for a sangeet night. Full wedding coverage starts at [pricing on request]. Custom packages available! <a href='/booking.html'>Book a free consultation →</a>";
          if (pillar === 'veronica') return "🎤 **Veronica (Corporate)** hosting starts at [pricing on request]for a half-day event and [pricing on request].5L+ for full-day conferences. <a href='/booking.html'>Get a custom quote →</a>";
          if (pillar === 'tour') return "🧭 **Trail Curator** experiences start at [pricing on request] for heritage walks, going up to [pricing on request]for custom mountain expeditions. <a href='/booking.html'>Plan your trail →</a>";
          return "Our packages vary by service. 💍 Weddings on request · 🎤 Corporate on request · 🧭 Tours on request/person. <a href='/booking.html'>Get a personalised quote →</a>";
        }
      },
      {
        patterns: ['book', 'booking', 'reserve', 'hire', 'enquire', 'enquiry', 'schedule', 'availability', 'available', 'date'],
        response: () => "📅 Ready to book? Head to our <a href='/booking.html'>booking page</a> — choose your pillar, fill in your event details, and pay a small token via UPI to confirm your date. We respond within 4 hours! 🚀"
      },
      {
        patterns: ['wedding', 'sangeet', 'mehendi', 'haldi', 'shaadi', 'bride', 'groom', 'radha'],
        response: () => "💍 **Radhaa** is our wedding & sangeet pillar — specialising in destination weddings, sangeet nights, and heirloom photo/video coverage. <a href='/pillar-radha.html'>Explore Radhaa →</a>",
        setPillar: 'radha'
      },
      {
        patterns: ['corporate', 'conference', 'summit', 'event host', 'mc', 'emcee', 'veronica', 'company', 'office', 'brand'],
        response: () => "🎤 **Veronica** is our corporate powerhouse — sharp, bilingual event hosting for MNC conferences, tech summits, product launches, and award nights. <a href='/pillar-veronica.html'>Meet Veronica →</a>",
        setPillar: 'veronica'
      },
      {
        patterns: ['tour', 'travel', 'trek', 'heritage', 'trail', 'mountain', 'culture', 'walk', 'explore', 'adventure'],
        response: () => "🧭 **The Trail Curator** creates immersive cultural experiences — heritage walks, mountain treks, and off-beat journeys across India. <a href='/pillar-tour.html'>Plan your trail →</a>",
        setPillar: 'tour'
      },
      {
        patterns: ['whatsapp', 'call', 'contact', 'phone', 'reach', 'talk', 'speak'],
        response: () => "📱 You can reach Radhaa directly on WhatsApp: <a href='https://wa.me/918192901515' target='_blank'>+91 81929 01515</a>. We typically respond within 30 minutes! ⚡"
      },
      {
        patterns: ['instagram', 'social', 'follow', 'portfolio', 'gallery', 'reels', 'photos'],
        response: () => "📸 Follow us across our platforms:<br>• <strong>Studio:</strong> @AntiGravityStudio.in<br>• <strong>Weddings:</strong> @RadhaDudeja<br>• <strong>Corporate:</strong> @VeronicaEmcee<br>• <strong>Trail:</strong> @TheTrailCurator"
      },
      {
        patterns: ['hello', 'hi', 'hey', 'hola', 'namaste', 'good morning', 'good evening', 'sup'],
        response: () => {
          const hour = new Date().getHours();
          const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
          return `${greeting}! 👋 I'm **AG Assistant**, your AI guide to Anti-Gravity Studio. I can help you with pricing, bookings, or choosing the right pillar. What brings you here today?`;
        }
      },
      {
        patterns: ['media kit', 'press kit', 'brochure', 'deck', 'download'],
        response: () => "📥 Download our full media kit and portfolio deck here: <a href='/media-kit.html'>Media Kit →</a>"
      },
      {
        patterns: ['location', 'city', 'where', 'based', 'travel to', 'pan india'],
        response: () => "🌍 We are **pan-India** — based in North India but we travel everywhere. From Rajasthan to Kerala, mountains to beaches. Travel costs apply for outstation events. <a href='/booking.html'>Enquire now →</a>"
      },
      {
        patterns: ['experience', 'years', 'how long', 'about', 'who', 'background'],
        response: () => "✨ Anti-Gravity Studio is a multi-persona media empire with 5+ years of storytelling across three specialised pillars — weddings, corporate, and travel. Each pillar has its own identity, voice, and creative philosophy. <a href='/'>Learn more →</a>"
      },
      {
        patterns: ['thank', 'thanks', 'great', 'awesome', 'helpful', 'nice'],
        response: () => "You're so welcome! 😊 Is there anything else I can help you with? Whether it's pricing, booking, or choosing a pillar — I'm here!"
      },
    ],

    fallback: [
      "Hmm, I didn't quite catch that 🤔 You can ask me about **pricing**, **booking**, the **Radhaa** wedding pillar, **Veronica** corporate, or the **Trail Curator** tour experiences!",
      "Not sure about that one! Try asking me: *'What are your wedding prices?'* or *'How do I book an event?'* 🎯",
      "I'm still learning! For complex queries, WhatsApp us directly: <a href='https://wa.me/918192901515' target='_blank'>+91 81929 01515</a> 📱",
    ]
  };

  let currentPillar = null; // tracks conversation context
  let fallbackIndex = 0;

  function getResponse(userText) {
    const text = userText.toLowerCase().trim();
    if (!text) return null;

    let bestMatch = null;
    let bestScore = 0;

    for (const intent of KB.intents) {
      let score = 0;
      for (const p of intent.patterns) {
        if (text.includes(p)) score += p.split(' ').length; // longer matches score higher
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = intent;
      }
    }

    if (bestMatch && bestScore > 0) {
      if (bestMatch.setPillar) currentPillar = bestMatch.setPillar;
      return bestMatch.response({ pillar: currentPillar });
    }

    // Fallback
    const fb = KB.fallback[fallbackIndex % KB.fallback.length];
    fallbackIndex++;
    return fb;
  }

  // ── UI Builder ────────────────────────────────────────────────────────────
  function buildWidget() {
    const style = document.createElement('style');
    style.textContent = `
      #ag-chat-btn {
        position: fixed; bottom: 6rem; right: 1.5rem; z-index: 9998;
        width: 56px; height: 56px; border-radius: 50%;
        background: linear-gradient(135deg, #9d4edd, #00f9ff);
        border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 24px rgba(157,78,221,0.5);
        transition: transform 0.3s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s;
        font-size: 1.4rem;
      }
      #ag-chat-btn:hover { transform: scale(1.1); box-shadow: 0 8px 32px rgba(0,249,255,0.4); }
      #ag-chat-btn .badge {
        position: absolute; top: -4px; right: -4px;
        background: #ff00aa; color: #fff; border-radius: 50%;
        width: 18px; height: 18px; font-size: 10px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        border: 2px solid #0a0a0f;
        animation: pulse-badge 2s infinite;
      }
      @keyframes pulse-badge {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.2); }
      }

      #ag-chat-window {
        position: fixed; bottom: 7rem; right: 1.5rem; z-index: 9999;
        width: 340px; max-height: 500px;
        background: rgba(10,10,15,0.97);
        border: 1px solid rgba(157,78,221,0.3);
        border-radius: 1.25rem;
        display: none; flex-direction: column;
        box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,249,255,0.05);
        backdrop-filter: blur(20px);
        overflow: hidden;
        animation: chat-in 0.4s cubic-bezier(0.16,1,0.3,1);
      }
      @keyframes chat-in {
        from { opacity: 0; transform: translateY(20px) scale(0.95); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      #ag-chat-window.open { display: flex; }

      .ag-chat-header {
        padding: 1rem 1.25rem;
        background: linear-gradient(135deg, rgba(157,78,221,0.3), rgba(0,249,255,0.1));
        border-bottom: 1px solid rgba(255,255,255,0.06);
        display: flex; align-items: center; gap: 0.75rem;
      }
      .ag-chat-avatar {
        width: 36px; height: 36px; border-radius: 50%;
        background: linear-gradient(135deg, #9d4edd, #00f9ff);
        display: flex; align-items: center; justify-content: center;
        font-size: 1rem; flex-shrink: 0;
      }
      .ag-chat-header-info { flex: 1; }
      .ag-chat-header-name { font-size: 0.9rem; font-weight: 700; color: #fff; }
      .ag-chat-header-status { font-size: 0.7rem; color: rgba(0,249,255,0.8); display: flex; align-items: center; gap: 4px; }
      .ag-status-dot { width: 6px; height: 6px; border-radius: 50%; background: #00ff9d; animation: blink 2s infinite; }
      @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      .ag-chat-close {
        background: none; border: none; color: rgba(255,255,255,0.4);
        cursor: pointer; font-size: 1.2rem; padding: 0.25rem; border-radius: 50%;
        transition: color 0.2s, background 0.2s;
      }
      .ag-chat-close:hover { color: #fff; background: rgba(255,255,255,0.1); }

      .ag-chat-messages {
        flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem;
        scrollbar-width: thin; scrollbar-color: rgba(157,78,221,0.3) transparent;
      }
      .ag-msg {
        max-width: 82%; padding: 0.6rem 0.9rem; border-radius: 1rem;
        font-size: 0.82rem; line-height: 1.6; animation: msg-in 0.3s ease;
      }
      @keyframes msg-in { from { opacity: 0; transform: translateY(8px); } }
      .ag-msg a { color: #00f9ff; }
      .ag-msg.bot {
        background: rgba(157,78,221,0.15);
        border: 1px solid rgba(157,78,221,0.2);
        color: rgba(255,255,255,0.9);
        align-self: flex-start; border-radius: 0.25rem 1rem 1rem 1rem;
      }
      .ag-msg.user {
        background: linear-gradient(135deg, #9d4edd22, #00f9ff22);
        border: 1px solid rgba(0,249,255,0.15);
        color: #fff;
        align-self: flex-end; border-radius: 1rem 0.25rem 1rem 1rem;
      }
      .ag-typing {
        display: flex; gap: 4px; align-items: center; padding: 0.6rem 0.9rem;
        background: rgba(157,78,221,0.1); border: 1px solid rgba(157,78,221,0.2);
        border-radius: 0.25rem 1rem 1rem 1rem; width: fit-content;
        align-self: flex-start;
      }
      .ag-typing span {
        width: 6px; height: 6px; border-radius: 50%; background: rgba(0,249,255,0.6);
        animation: typing-bounce 1.2s infinite;
      }
      .ag-typing span:nth-child(2) { animation-delay: 0.2s; }
      .ag-typing span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes typing-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }

      /* Quick replies */
      .ag-quick-replies {
        display: flex; gap: 0.4rem; flex-wrap: wrap; padding: 0 1rem 0.5rem;
      }
      .ag-qr {
        background: rgba(157,78,221,0.1); border: 1px solid rgba(157,78,221,0.3);
        color: rgba(255,255,255,0.7); border-radius: 50px; padding: 0.3rem 0.75rem;
        font-size: 0.72rem; cursor: pointer; transition: all 0.2s; white-space: nowrap;
      }
      .ag-qr:hover { background: rgba(157,78,221,0.3); color: #fff; }

      .ag-chat-input-row {
        display: flex; gap: 0.5rem; padding: 0.75rem;
        border-top: 1px solid rgba(255,255,255,0.06);
      }
      #ag-chat-input {
        flex: 1; background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1); color: #fff;
        border-radius: 50px; padding: 0.5rem 1rem; font-size: 0.82rem;
        outline: none; font-family: inherit; transition: border-color 0.2s;
      }
      #ag-chat-input:focus { border-color: rgba(0,249,255,0.4); }
      #ag-chat-input::placeholder { color: rgba(255,255,255,0.25); }
      #ag-chat-send {
        width: 36px; height: 36px; border-radius: 50%;
        background: linear-gradient(135deg, #9d4edd, #00f9ff);
        border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
        font-size: 0.9rem; flex-shrink: 0; transition: transform 0.2s;
      }
      #ag-chat-send:hover { transform: scale(1.1); }

      @media (max-width: 420px) {
        #ag-chat-window { width: calc(100vw - 2rem); right: 1rem; }
      }
    `;
    document.head.appendChild(style);

    // Chat button
    const btn = document.createElement('button');
    btn.id = 'ag-chat-btn';
    btn.setAttribute('aria-label', 'Chat with AG Assistant');
    btn.innerHTML = `🤖<span class="badge">1</span>`;

    // Chat window
    const win = document.createElement('div');
    win.id = 'ag-chat-window';
    win.innerHTML = `
      <div class="ag-chat-header">
        <div class="ag-chat-avatar">🤖</div>
        <div class="ag-chat-header-info">
          <div class="ag-chat-header-name">AG Assistant</div>
          <div class="ag-chat-header-status"><span class="ag-status-dot"></span>Online — Ask me anything</div>
        </div>
        <button class="ag-chat-close" id="ag-chat-close-btn" aria-label="Close chat">✕</button>
      </div>
      <div class="ag-chat-messages" id="ag-chat-messages"></div>
      <div class="ag-quick-replies" id="ag-quick-replies">
        <button class="ag-qr">💍 Wedding prices?</button>
        <button class="ag-qr">🎤 Corporate hosting?</button>
        <button class="ag-qr">📅 How to book?</button>
        <button class="ag-qr">📱 WhatsApp?</button>
      </div>
      <div class="ag-chat-input-row">
        <input type="text" id="ag-chat-input" placeholder="Ask me anything..." autocomplete="off" maxlength="200">
        <button id="ag-chat-send" aria-label="Send message">➤</button>
      </div>
    `;

    document.body.appendChild(btn);
    document.body.appendChild(win);

    // Detect current pillar from page URL
    const url = window.location.pathname;
    if (url.includes('radha')) currentPillar = 'radha';
    else if (url.includes('veronica')) currentPillar = 'veronica';
    else if (url.includes('tour')) currentPillar = 'tour';

    // Initial greeting
    const msgContainer = win.querySelector('#ag-chat-messages');
    const greeting = `👋 Hi there! I'm **AG Assistant** — your instant guide to Anti-Gravity Studio. Ask me about pricing, booking, or our three creative pillars!`;
    appendMsg(msgContainer, greeting, 'bot');

    // Toggle
    btn.addEventListener('click', () => {
      win.classList.toggle('open');
      btn.querySelector('.badge').style.display = 'none';
    });
    win.querySelector('#ag-chat-close-btn').addEventListener('click', () => {
      win.classList.remove('open');
    });

    // Send
    const input = win.querySelector('#ag-chat-input');
    const sendBtn = win.querySelector('#ag-chat-send');
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

    // Quick replies
    win.querySelector('#ag-quick-replies').addEventListener('click', (e) => {
      if (e.target.classList.contains('ag-qr')) {
        input.value = e.target.textContent.replace(/^[^\w]+/, '').trim();
        sendMessage();
      }
    });

    function sendMessage() {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      appendMsg(msgContainer, text, 'user');
      showTyping(msgContainer);
      setTimeout(() => {
        removeTyping(msgContainer);
        const response = getResponse(text);
        appendMsg(msgContainer, response, 'bot');
      }, 600 + Math.random() * 500);
    }
  }

  function appendMsg(container, text, type) {
    const msg = document.createElement('div');
    msg.className = `ag-msg ${type}`;
    // Render **bold** markdown and <a> tags safely
    msg.innerHTML = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  function showTyping(container) {
    const t = document.createElement('div');
    t.className = 'ag-typing';
    t.id = 'ag-typing-indicator';
    t.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(t);
    container.scrollTop = container.scrollHeight;
  }

  function removeTyping(container) {
    const t = container.querySelector('#ag-typing-indicator');
    if (t) t.remove();
  }

  // Don't show on admin pages
  if (!window.location.pathname.includes('/admin/')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', buildWidget);
    } else {
      buildWidget();
    }
  }
})();
