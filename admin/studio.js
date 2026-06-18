/**
 * admin/studio.js — AI Media Studio logic
 * Handles: upload, video trim, image enhance, voice commands, gallery
 */

// ── Panel switching ──────────────────────────────────────────
function showPanel(id, btn) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.side-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('panel-' + id);
  if (el) el.classList.add('active');
  if (btn) btn.classList.add('active');
  if (id === 'gallery') loadGallery('all');
  if (id === 'gallery-radha') loadGallery('radha');
  if (id === 'gallery-veronica') loadGallery('veronica');
  if (id === 'gallery-tour') loadGallery('tour');
  if (id === 'videos') loadVideoGallery();
}

// ── Stats ────────────────────────────────────────────────────
async function refreshStats() {
  try {
    const r = await fetch('/api/media',{credentials:'include'}); const d = await r.json();
    document.getElementById('s-total').textContent = d.length;
    document.getElementById('s-radha').textContent = d.filter(i=>i.pillar==='radha'||i.pillar==='sangeet').length;
    document.getElementById('s-veronica').textContent = d.filter(i=>i.pillar==='corporate').length;
    document.getElementById('s-tour').textContent = d.filter(i=>i.pillar==='tour').length;

    // /api/admin/analytics now returns {revenue:{Radhaa,Corporate,Tour}, conversion}
    // Get lead counts from /api/leads directly
    const [r2, rLeads] = await Promise.all([
      fetch('/api/admin/analytics'),
      fetch('/api/leads')
    ]);
    if (r2.ok) {
      const a = await r2.json();
      const rev = a.revenue || {};
      const totalRev = Object.values(rev).reduce((s,v)=>s+v,0);
      const leadsArr = rLeads.ok ? await rLeads.json() : [];
      document.getElementById('a-leads').textContent = leadsArr.length || 0;
      document.getElementById('a-radha').textContent = leadsArr.filter(l=>/(radha|sangeet)/i.test(l.pillar||'')).length;
      document.getElementById('a-veronica').textContent = leadsArr.filter(l=>/(corp|veronica)/i.test(l.pillar||'')).length;
      document.getElementById('a-rev').textContent = '₹' + (totalRev >= 100000 ? (totalRev/100000).toFixed(1)+'L' : totalRev.toLocaleString('en-IN'));
    }

    const r3 = await fetch('/api/admin/insights',{credentials:'include'});
    if (r3.ok) {
      const insightsList = await r3.json();
      const iHtml = insightsList.map(ins => `<div style="background:rgba(0,0,0,0.5);padding:0.75rem 1rem;border-radius:0.5rem;border-left:2px solid var(--c);">${ins}</div>`).join('');
      document.getElementById('ai-insights-list').innerHTML = iHtml || '<div>No insights available.</div>';
    }

  } catch(e){}
}
refreshStats();

// ── Upload ───────────────────────────────────────────────────
function handleDrop(e, ctx) {
  e.preventDefault();
  document.querySelectorAll('.upload-zone').forEach(z=>z.classList.remove('drag'));
  const files = e.dataTransfer.files;
  if (ctx === 'upload') handleUploadFiles(files);
  else if (ctx === 'video') loadVideoEditor(files[0]);
  else if (ctx === 'enhance') loadEnhancer(files[0]);
}

async function handleUploadFiles(files) {
  if (!files || !files.length) return;
  const bar = document.getElementById('up-bar');
  const wrap = document.getElementById('up-progress');
  const status = document.getElementById('up-status');
  const preview = document.getElementById('up-preview');
  const pillarSel = document.getElementById('up-pillar').value;
  const typeSel = document.getElementById('up-type').value;
  wrap.style.display = 'block';

  const arr = [...files];
  let done = 0;
  for (const file of arr) {
    status.textContent = `Uploading ${file.name}… (${done+1}/${arr.length})`;
    // Local preview card
    const card = document.createElement('div');
    card.className = 'm-card';
    const objUrl = URL.createObjectURL(file);
    const isVid = file.type.startsWith('video/');
    card.innerHTML = `
      ${isVid
        ? `<video src="${objUrl}" style="width:100%;height:140px;object-fit:cover" muted></video>`
        : `<img src="${objUrl}" alt="${file.name}">`}
      <div class="m-card-body">
        <div class="m-card-name">${file.name}</div>
        <div style="font-size:.65rem;color:rgba(255,255,255,.3)" id="card-status-${done}">Uploading…</div>
      </div>`;
    preview.appendChild(card);

    try {
      const fd = new FormData();
      fd.append('file', file);
      // Smart auto-detect from filename if selected
      let pillar = pillarSel;
      if (pillar === 'auto') {
        const n = file.name.toLowerCase();
        if (/wedding|bride|sangeet|mehendi|bhakti|puja|family|radha/.test(n)) pillar = 'radha';
        else if (/corporate|office|party|pool|cocktail|veronica/.test(n)) pillar = 'corporate';
        else if (/tour|travel|concert|trek|beach|mountain/.test(n)) pillar = 'tour';
        else pillar = 'main';
      }
      fd.append('pillar', pillar);
      fd.append('type', isVid ? 'video' : typeSel);
      const res = await fetch('/api/media', {credentials:'include',  method: 'POST', body: fd });
      const d = await res.json();
      const cs = document.getElementById(`card-status-${done}`);
      if (cs) cs.textContent = res.ok ? `✅ Saved (${pillar})` : `❌ ${d.error}`;
    } catch(err) {
      const cs = document.getElementById(`card-status-${done}`);
      if (cs) cs.textContent = '❌ Network error';
    }
    done++;
    bar.style.width = `${(done/arr.length)*100}%`;
  }
  wrap.style.display = 'none';
  status.textContent = `✅ ${done} file(s) uploaded.`;
  refreshStats();
}

// ── Video Editor ─────────────────────────────────────────────
let editMediaId = null;
let videoDuration = 0;
let trimStart = 0, trimEnd = 0;
let dragging = null;

function loadVideoEditor(file) {
  if (!file) return;
  const video = document.getElementById('edit-video');
  video.src = URL.createObjectURL(file);
  video.onloadedmetadata = () => {
    videoDuration = video.duration;
    trimStart = 0; trimEnd = videoDuration;
    document.getElementById('trim-start').value = 0;
    document.getElementById('trim-end').value = videoDuration.toFixed(1);
    updateTimeline();
    document.getElementById('video-editor').style.display = 'block';
  };
}

function updateTimeline() {
  const d = videoDuration || 1;
  const bar = document.getElementById('tl-bar');
  const sh = document.getElementById('tl-start');
  const eh = document.getElementById('tl-end');
  const sp = (trimStart/d)*100, ep = (trimEnd/d)*100;
  bar.style.left = sp+'%'; bar.style.width = (ep-sp)+'%';
  sh.style.left = sp+'%';
  eh.style.left = ep+'%';
}

function seekVideo(e) {
  const tl = document.getElementById('timeline');
  const rect = tl.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  const vid = document.getElementById('edit-video');
  vid.currentTime = pct * videoDuration;
}

function startDrag(handle, e) {
  dragging = handle;
  e.preventDefault();
}
document.addEventListener('mousemove', e => {
  if (!dragging) return;
  const tl = document.getElementById('timeline');
  const rect = tl.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const t = pct * videoDuration;
  if (dragging === 'start') { trimStart = Math.min(t, trimEnd - 0.5); }
  else { trimEnd = Math.max(t, trimStart + 0.5); }
  document.getElementById('trim-start').value = trimStart.toFixed(1);
  document.getElementById('trim-end').value = trimEnd.toFixed(1);
  updateTimeline();
});
document.addEventListener('mouseup', () => { dragging = null; });

function updateTrimFromInput() {
  trimStart = parseFloat(document.getElementById('trim-start').value) || 0;
  trimEnd = parseFloat(document.getElementById('trim-end').value) || videoDuration;
  updateTimeline();
}

function previewTrim() {
  const vid = document.getElementById('edit-video');
  vid.currentTime = trimStart;
  vid.play();
  setTimeout(() => { vid.pause(); }, (trimEnd - trimStart) * 1000);
}

// Update playhead while video plays
document.getElementById && document.addEventListener('DOMContentLoaded', () => {
  const vid = document.getElementById('edit-video');
  if (!vid) return;
  vid.addEventListener('timeupdate', () => {
    const ph = document.getElementById('tl-playhead');
    if (ph && videoDuration) ph.style.left = ((vid.currentTime / videoDuration) * 100) + '%';
    if (vid.currentTime >= trimEnd) vid.pause();
  });
});

async function applyTrim() {
  if (!editMediaId) {
    document.getElementById('trim-status').textContent = '⚠ Upload this video via Smart Upload first, then reopen it from the gallery to trim.';
    return;
  }
  const btn = document.getElementById('trim-btn');
  btn.disabled = true;
  document.getElementById('trim-status').textContent = '⏳ Processing on server…';
  try {
    const r = await fetch('/api/media/trim', {credentials:'include', 
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({id: editMediaId, startTime: trimStart, endTime: trimEnd})
    });
    const d = await r.json();
    if (r.ok) {
      document.getElementById('trim-status').textContent = `✅ Trimmed video saved! ID: ${d.id}`;
      refreshStats();
    } else {
      document.getElementById('trim-status').textContent = `❌ ${d.error}`;
    }
  } catch(e) {
    document.getElementById('trim-status').textContent = '❌ Network error';
  }
  btn.disabled = false;
}

async function loadVideoGallery() {
  const grid = document.getElementById('video-gallery');
  grid.innerHTML = '<div class="empty"><div class="ei">⏳</div><p>Loading…</p></div>';
  try {
    const r = await fetch('/api/media',{credentials:'include'}); const d = await r.json();
    const vids = d.filter(m => m.type === 'video');
    if (!vids.length) { grid.innerHTML = '<div class="empty"><div class="ei">🎬</div><p>No videos yet.</p></div>'; return; }
    grid.innerHTML = vids.map(v => mediaCard(v)).join('');
  } catch(e) { grid.innerHTML = '<div class="empty"><p>Error loading videos.</p></div>'; }
}

// ── Image Enhancer ───────────────────────────────────────────
let origImageData = null;
let enhImg = null;
const defaultFilters = { brightness:100, contrast:100, saturation:100, sharpness:0, exposure:0, hue:0 };
let filters = {...defaultFilters};

const SLIDERS = [
  {key:'brightness', label:'Brightness', min:0, max:200, step:1},
  {key:'contrast',   label:'Contrast',   min:0, max:300, step:1},
  {key:'saturation', label:'Saturation', min:0, max:400, step:1},
  {key:'hue',        label:'Hue Rotate', min:0, max:360, step:1},
  {key:'exposure',   label:'Exposure',   min:-100, max:100, step:1},
  {key:'sharpness',  label:'Sharpness',  min:0, max:10, step:0.5},
];

function buildSliders() {
  const cont = document.getElementById('enhance-sliders');
  cont.innerHTML = SLIDERS.map(s => `
    <div class="slider-group">
      <div class="slider-label"><span>${s.label}</span><span id="val-${s.key}">${filters[s.key]}</span></div>
      <input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${filters[s.key]}"
             oninput="setFilter('${s.key}',this.value)">
    </div>`).join('');
}

function setFilter(key, val) {
  filters[key] = parseFloat(val);
  document.getElementById(`val-${key}`).textContent = val;
  applyFilters();
}

function applyFilters() {
  const canvas = document.getElementById('enh-canvas');
  const ctx = canvas.getContext('2d');
  if (!enhImg) return;
  canvas.width = enhImg.naturalWidth; canvas.height = enhImg.naturalHeight;
  ctx.filter = buildCSSFilter();
  ctx.drawImage(enhImg, 0, 0);
  // Sharpness via unsharp mask (manual convolution)
  if (filters.sharpness > 0) applySharpen(ctx, canvas, filters.sharpness);
}

function buildCSSFilter() {
  const br = filters.brightness + filters.exposure;
  return [
    `brightness(${Math.max(0,br)}%)`,
    `contrast(${filters.contrast}%)`,
    `saturate(${filters.saturation}%)`,
    `hue-rotate(${filters.hue}deg)`,
  ].join(' ');
}

function applySharpen(ctx, canvas, amount) {
  const imgd = ctx.getImageData(0,0,canvas.width,canvas.height);
  const d = imgd.data; const w = canvas.width;
  const kernel = [0,-amount,0,-amount,1+4*amount,-amount,0,-amount,0];
  const out = new Uint8ClampedArray(d);
  for (let y=1;y<canvas.height-1;y++){
    for (let x=1;x<w-1;x++){
      let r=0,g=0,b=0;
      for (let ky=-1;ky<=1;ky++){for (let kx=-1;kx<=1;kx++){
        const idx=((y+ky)*w+(x+kx))*4;
        const ki=(ky+1)*3+(kx+1);
        r+=d[idx]*kernel[ki]; g+=d[idx+1]*kernel[ki]; b+=d[idx+2]*kernel[ki];
      }}
      const i=(y*w+x)*4;
      out[i]=Math.min(255,Math.max(0,r)); out[i+1]=Math.min(255,Math.max(0,g)); out[i+2]=Math.min(255,Math.max(0,b)); out[i+3]=d[i+3];
    }
  }
  ctx.putImageData(new ImageData(out, canvas.width, canvas.height),0,0);
}

const PRESETS = {
  auto:       {brightness:110,contrast:110,saturation:120,sharpness:1,exposure:5,hue:0},
  vivid:      {brightness:110,contrast:130,saturation:200,sharpness:2,exposure:0,hue:0},
  cinematic:  {brightness:90, contrast:140,saturation:80, sharpness:1,exposure:-10,hue:5},
  portrait:   {brightness:105,contrast:105,saturation:110,sharpness:2,exposure:5,hue:0},
  hdr:        {brightness:95, contrast:160,saturation:150,sharpness:3,exposure:0,hue:0},
  bw:         {brightness:100,contrast:130,saturation:0,  sharpness:1,exposure:0,hue:0},
  warm:       {brightness:105,contrast:105,saturation:130,sharpness:0,exposure:5,hue:20},
  cool:       {brightness:100,contrast:110,saturation:110,sharpness:0,exposure:0,hue:200},
};
function applyPreset(name) {
  filters = {...PRESETS[name]};
  buildSliders();
  applyFilters();
  document.getElementById('enh-status').textContent = `Applied preset: ${name}`;
}

function loadEnhancer(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const orig = document.getElementById('orig-img');
  orig.src = url;
  enhImg = new Image();
  enhImg.onload = () => {
    filters = {...defaultFilters};
    buildSliders();
    applyFilters();
    document.getElementById('enhancer-ui').style.display = 'block';
  };
  enhImg.src = url;
}

function resetEnhancer() { filters = {...defaultFilters}; buildSliders(); applyFilters(); }

function downloadEnhanced() {
  const canvas = document.getElementById('enh-canvas');
  canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `enhanced_${Date.now()}.png`;
    a.click();
  }, 'image/png');
}

async function saveEnhancedToGallery() {
  const canvas = document.getElementById('enh-canvas');
  const st = document.getElementById('enh-status');
  st.textContent = '⏳ Saving…';
  canvas.toBlob(async blob => {
    const fd = new FormData();
    fd.append('file', blob, `enhanced_${Date.now()}.png`);
    fd.append('pillar', 'main'); fd.append('type', 'image');
    try {
      const r = await fetch('/api/media', {credentials:'include', method:'POST',body:fd});
      st.textContent = r.ok ? '✅ Saved to gallery!' : '❌ Save failed';
      if (r.ok) refreshStats();
    } catch(e){ st.textContent='❌ Network error'; }
  }, 'image/png');
}

// ── Gallery ───────────────────────────────────────────────────
async function loadGallery(filter) {
  const grids = {all:'gallery-grid','radha':'gallery-grid-radha','veronica':'gallery-grid-veronica','tour':'gallery-grid-tour'};
  const gid = grids[filter];
  const grid = document.getElementById(gid);
  if (!grid) return;
  grid.innerHTML = '<div class="empty"><div class="ei">⏳</div><p>Loading…</p></div>';
  try {
    const r = await fetch('/api/media',{credentials:'include'}); const data = await r.json();
    const filtered = filter === 'all' ? data
      : filter === 'radha' ? data.filter(m=>m.pillar==='radha'||m.pillar==='sangeet')
      : filter === 'veronica' ? data.filter(m=>m.pillar==='corporate')
      : data.filter(m=>m.pillar===filter);
    if (!filtered.length) { grid.innerHTML = '<div class="empty"><div class="ei">🖼</div><p>No media yet.</p></div>'; return; }
    grid.innerHTML = filtered.map(m=>mediaCard(m)).join('');
  } catch(e){ grid.innerHTML = '<div class="empty"><p>Error loading. Is the server running?</p></div>'; }
}

function mediaCard(m) {
  const isVid = m.type === 'video';
  const thumb = isVid
    ? `<video src="${m.url}" style="width:100%;height:140px;object-fit:cover" muted preload="metadata"></video>`
    : `<img src="${m.url}" alt="${m.name||''}" loading="lazy">`;
  return `<div class="m-card">
    ${thumb}
    <div class="m-card-body">
      <div class="m-card-name">${m.originalName||m.name||'media'}</div>
      <div style="font-size:.65rem;color:rgba(255,255,255,.3);margin-bottom:.4rem">${m.pillar||''} · ${m.type||''}</div>
      <div class="m-card-actions">
        ${isVid ? `<button class="m-action" onclick="openVideoTrim(${m.id},'${m.url}')">✂ Trim</button>` : `<button class="m-action" onclick="openEnhanceFromGallery('${m.url}')">✨ Enhance</button>`}
        <button class="m-action" onclick="deleteMedia(${m.id},this)" style="color:#ff8080">🗑</button>
      </div>
    </div>
  </div>`;
}

function openVideoTrim(id, url) {
  editMediaId = id;
  showPanel('videos', document.querySelector('.side-btn:nth-child(2)'));
  const vid = document.getElementById('edit-video');
  vid.src = url;
  vid.onloadedmetadata = () => {
    videoDuration = vid.duration;
    trimStart = 0; trimEnd = videoDuration;
    document.getElementById('trim-start').value = 0;
    document.getElementById('trim-end').value = videoDuration.toFixed(1);
    updateTimeline();
    document.getElementById('video-editor').style.display = 'block';
  };
}

function openEnhanceFromGallery(url) {
  showPanel('enhance', null);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    enhImg = img;
    document.getElementById('orig-img').src = url;
    filters = {...defaultFilters};
    buildSliders();
    applyFilters();
    document.getElementById('enhancer-ui').style.display = 'block';
  };
  img.src = url;
}

async function deleteMedia(id, btn) {
  if (!confirm('Delete this media?')) return;
  btn.textContent = '⏳'; btn.disabled = true;
  try {
    await fetch(`/api/media/${id}`,{method:'DELETE'});
    btn.closest('.m-card').remove();
    refreshStats();
  } catch(e){ btn.textContent='❌'; }
}

// ── Voice Commands ────────────────────────────────────────────
let voiceRecog = null;
let voiceActive = false;

function toggleVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const overlay = document.getElementById('voice-overlay');
  const btn = document.getElementById('voice-btn');

  if (!SR) { alert('Voice not supported in this browser. Try Chrome.'); return; }
  if (!voiceRecog) {
    voiceRecog = new SR();
    voiceRecog.lang = 'en-IN';
    voiceRecog.interimResults = true;
    voiceRecog.continuous = true;
    voiceRecog.addEventListener('result', e => {
      const t = [...e.results].map(r=>r[0].transcript).join(' ').toLowerCase();
      document.getElementById('voice-transcript').textContent = t;
      if (e.results[e.results.length-1].isFinal) processVoiceCommand(t);
    });
    voiceRecog.addEventListener('end', () => {
      if (voiceActive) voiceRecog.start();
    });
  }

  if (voiceActive) {
    voiceActive = false;
    voiceRecog.stop();
    overlay.classList.remove('open');
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed','false');
  } else {
    voiceActive = true;
    voiceRecog.start();
    overlay.classList.add('open');
    btn.classList.add('active');
    btn.setAttribute('aria-pressed','true');
    document.getElementById('voice-transcript').textContent = 'Listening…';
  }
}

function processVoiceCommand(text) {
  const cmds = [
    [/upload|smart upload/,            ()=>showPanel('upload',null)],
    [/video|editor|trim|cut/,          ()=>showPanel('videos',null)],
    [/enhance|image|photo/,            ()=>showPanel('enhance',null)],
    [/bifurcat|classify|sort/,         ()=>showPanel('bifurcate',null)],
    [/radha|wedding|sangeet/,          ()=>showPanel('gallery-radha',null)],
    [/veronica|corporate|party/,       ()=>showPanel('gallery-veronica',null)],
    [/tour|travel|concert/,            ()=>showPanel('gallery-tour',null)],
    [/gallery|all media/,              ()=>showPanel('gallery',null)],
    [/vivid/,                          ()=>applyPreset('vivid')],
    [/cinematic|cinema/,               ()=>applyPreset('cinematic')],
    [/hdr/,                            ()=>applyPreset('hdr')],
    [/black.?and.?white|b.?w/,         ()=>applyPreset('bw')],
    [/warm/,                           ()=>applyPreset('warm')],
    [/cool|cold/,                      ()=>applyPreset('cool')],
    [/portrait/,                       ()=>applyPreset('portrait')],
    [/auto/,                           ()=>applyPreset('auto')],
    [/download/,                       ()=>downloadEnhanced()],
    [/save/,                           ()=>saveEnhancedToGallery()],
    [/close|stop|cancel/,              ()=>toggleVoice()],
  ];
  for (const [pattern, action] of cmds) {
    if (pattern.test(text)) { action(); break; }
  }
}

// ── God Logs ────────────────────────────────────────────────
async function fetchLogs() {
  const container = document.getElementById('logs-container');
  if (!container) return;
  container.innerHTML = '<div style="color:var(--c)">Fetching logs from server...</div>';
  try {
    const r = await fetch('/api/admin/logs',{credentials:'include'});
    if (!r.ok) throw new Error('Unauthorized or Server Error');
    const logs = await r.json();
    
    let html = '';
    for (const [file, content] of Object.entries(logs)) {
      html += `
        <div style="background:#050505;border:1px solid rgba(255,255,255,0.1);border-radius:0.5rem;overflow:hidden;">
          <div style="background:rgba(255,255,255,0.05);padding:0.5rem 1rem;font-size:0.75rem;font-weight:600;color:rgba(255,255,255,0.5);border-bottom:1px solid rgba(255,255,255,0.1);">${file.toUpperCase()}</div>
          <div style="padding:0.75rem;font-size:0.72rem;font-family:monospace;max-height:200px;overflow-y:auto;color:rgba(255,255,255,0.6);">
            ${Array.isArray(content) ? content.slice(0,50).map(row => {
              const time = row.timestamp ? new Date(row.timestamp).toLocaleString('en-IN') : '';
              const label = row.url || row.eventName || '';
              const pillar = row.pillar ? ` [${row.pillar}]` : '';
              return `<div>${time} — ${label}${pillar}</div>`;
            }).join('') : JSON.stringify(content).slice(0,500)}
          </div>
        </div>`;
    }
    container.innerHTML = html || '<div style="color:rgba(255,255,255,0.4);">No logs found.</div>';
  } catch(e) {
    if (container) container.innerHTML = `<div style="color:#ff6b6b;">Error: ${e.message}</div>`;
  }
}
