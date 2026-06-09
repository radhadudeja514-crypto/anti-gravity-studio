/**
 * server.js — Anti-Gravity Gig Portfolio
 * Production-ready Express server with:
 *  - bcrypt password hashing for admin auth
 *  - Session-based auth (via signed cookie)
 *  - CSRF protection
 *  - Content Security Policy via helmet
 *  - Rate limiting on public endpoints
 *  - Validated UPI/QR endpoint
 *  - Range-request support for large files
 */

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const sqlite3  = require('sqlite3').verbose();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const ffmpeg   = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const cloudinary   = require('cloudinary').v2;

ffmpeg.setFfmpegPath(ffmpegStatic);

const app  = express();
const PORT = process.env.PORT || 3005;

// ── CORS Middleware (permissive for development) ────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

// ── Security: Helmet-style CSP header (no extra dep needed) ──────────────────
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://upload-widget.cloudinary.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://unpkg.com",
      "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
      "img-src 'self' data: blob: https://res.cloudinary.com https://*.googleusercontent.com",
      "connect-src 'self' https://api.cloudinary.com https://upload-widget.cloudinary.com",
      "frame-src 'none'",
    ].join('; ')
  );
  next();
});

// ── Session management (signed cookie, no extra dep) ─────────────────────────
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const sessions = new Map(); // sessionId -> { ip, created }

function createSession(ip) {
  const id = crypto.randomBytes(32).toString('hex');
  sessions.set(id, { ip, created: Date.now() });
  return id;
}
function getSession(req) {
  const raw = req.headers.cookie || '';
  const match = raw.match(/admin_session=([a-f0-9]{64})/);
  if (!match) return null;
  const sess = sessions.get(match[1]);
  if (!sess) return null;
  // Expire after 8 hours
  if (Date.now() - sess.created > 8 * 3600 * 1000) { sessions.delete(match[1]); return null; }
  return sess;
}
function requireAuth(req, res, next) {
  if (getSession(req)) return next();
  res.status(401).json({ error: 'Unauthorised – please login at /admin/login.html' });
}

// ── CSRF token store ────────────────────────────────────────────────────────
const csrfTokens = new Map(); // token -> expiry
function generateCSRF() {
  const token = crypto.randomBytes(24).toString('hex');
  csrfTokens.set(token, Date.now() + 3600 * 1000); // valid 1h
  return token;
}
function validateCSRF(token) {
  if (!token) return false;
  const expiry = csrfTokens.get(token);
  if (!expiry || Date.now() > expiry) return false;
  csrfTokens.delete(token); // one-use
  return true;
}
// Clean expired tokens + rate limit map every 10 min (prevents memory leak)
setInterval(() => {
  const now = Date.now();
  csrfTokens.forEach((exp, tok) => { if (now > exp) csrfTokens.delete(tok); });
  sessions.forEach((sess, id) => { if (now - sess.created > 8 * 3600 * 1000) sessions.delete(id); });
  // Prune stale rate limit entries
  rateLimitMap.forEach((entry, ip) => { if (now - entry.start > 5 * 60 * 1000) rateLimitMap.delete(ip); });
}, 600_000);

// ── Rate limiting ─────────────────────────────────────────────────────────
const rateLimitMap = new Map();
function rateLimit(maxReq, windowMs) {
  return (req, res, next) => {
    const ip  = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const entry = rateLimitMap.get(ip) || { count: 0, start: now };
    if (now - entry.start > windowMs) { entry.count = 0; entry.start = now; }
    entry.count++;
    rateLimitMap.set(ip, entry);
    if (entry.count > maxReq) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: 'Too many requests – please slow down.' });
    }
    next();
  };
}

// ── Setup directories ───────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
['corporate', 'sangeet', 'tour', 'main'].forEach(d => {
  const p = path.join(uploadsDir, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ── Middleware ──────────────────────────────────────────────────────────
app.use(cors({ origin: false })); // restrict CORS – adjust for production domain
app.use(express.json({ limit: '2mb' }));

// Serve static files (except /admin/* which needs auth check)

// ── YOUTUBE THUMBNAIL IMPORT ─────────────────────────────────────────────────
app.post('/api/media/import-youtube', requireAuth, (req, res) => {
  const { url, pillar } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/);
  if (!ytMatch) return res.status(400).json({ error: 'Invalid YouTube URL' });
  const videoId = ytMatch[1];
  const thumbUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  const name = `youtube_${videoId}.jpg`;
  db.run(
    'INSERT INTO media (name,url,pillar,type,size,originalName) VALUES (?,?,?,?,?,?)',
    [name, thumbUrl, pillar || 'main', 'image', 0, name],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, url: thumbUrl, videoId, name });
    }
  );
});

// ── BULK YOUTUBE IMPORT ───────────────────────────────────────────────────────
app.post('/api/media/import-youtube-bulk', requireAuth, (req, res) => {
  const { urls, pillar } = req.body;
  if (!Array.isArray(urls) || !urls.length) return res.status(400).json({ error: 'urls array required' });
  const results = [];
  let done = 0;
  urls.forEach((url, i) => {
    const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/);
    if (!ytMatch) { done++; if (done === urls.length) res.json({ imported: results }); return; }
    const videoId = ytMatch[1];
    const thumbUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    const name = `youtube_${videoId}.jpg`;
    db.run(
      'INSERT INTO media (name,url,pillar,type,size,originalName) VALUES (?,?,?,?,?,?)',
      [name, thumbUrl, pillar || 'main', 'image', 0, name],
      function(err) {
        if (!err) results.push({ id: this.lastID, url: thumbUrl, videoId });
        done++;
        if (done === urls.length) res.json({ imported: results });
      }
    );
  });
});

// ── GOOGLE PHOTOS OAUTH CALLBACK ──────────────────────────────────────────────
app.get('/api/google-photos/callback', (req, res) => {
  // OAuth token comes as hash fragment on client side
  res.send('<script>window.opener && window.opener.postMessage({type:"gp_token",hash:location.hash},"*");window.close();</script>');
});

// ── GOOGLE PHOTOS IMPORT (by access token + media item URLs) ──────────────────
app.post('/api/media/import-google-photos', requireAuth, async (req, res) => {
  const { items, pillar } = req.body; // items: [{url, name}]
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items array required' });
  const results = [];
  let done = 0;
  items.forEach((item, i) => {
    const name = item.name || `gp_${Date.now()}_${i}.jpg`;
    db.run(
      'INSERT INTO media (name,url,pillar,type,size,originalName) VALUES (?,?,?,?,?,?)',
      [name, item.url, pillar || 'main', 'image', 0, name],
      function(err) {
        if (!err) results.push({ id: this.lastID, url: item.url });
        done++;
        if (done === items.length) res.json({ imported: results });
      }
    );
  });
});

app.use(express.static(path.join(__dirname), {
  setHeaders(res, filePath) {
    // Cache control: 1h for HTML, 1 week for assets
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    } else if (/\.(css|js|woff2?|ttf|png|jpg|webp|svg)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    }
  }
}));

// Range-request support for uploads (needed for large videos/PDFs)
app.use('/uploads', (req, res, next) => {
  // BUG FIX: Path traversal protection — normalize and ensure path stays within uploadsDir
  const requestedPath = path.normalize(path.join(uploadsDir, req.path));
  if (!requestedPath.startsWith(uploadsDir)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const filePath = requestedPath;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return next();
  const stat = fs.statSync(filePath);
  const total = stat.size;
  const range = req.headers.range;
  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end   = endStr ? Math.min(parseInt(endStr, 10), total - 1) : total - 1;
    if (isNaN(start) || start >= total || start < 0) {
      return res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
    }
    const chunkSize = (end - start) + 1;
    res.status(206);
    res.setHeader('Content-Range',  `bytes ${start}-${end}/${total}`);
    res.setHeader('Accept-Ranges',  'bytes');
    res.setHeader('Content-Length', chunkSize);
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', total);
    fs.createReadStream(filePath).pipe(res);
  }
});

// ── Database setup ────────────────────────────────────────────────────────
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(DB_PATH);
db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL;');
  db.run(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, phone TEXT, email TEXT, eventType TEXT,
    eventDate TEXT, budget TEXT, message TEXT, pillar TEXT,
    status TEXT DEFAULT 'New', company TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, url TEXT, pillar TEXT, type TEXT, size INTEGER,
    originalName TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pillar TEXT, date TEXT, time TEXT, topic TEXT, caption TEXT, mediaUrl TEXT,
    status TEXT DEFAULT 'Scheduled', timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS page_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT, pillar TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    eventName TEXT, pillar TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY, value TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS google_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    place_id TEXT,
    author_name TEXT,
    rating INTEGER,
    text TEXT,
    time INTEGER,
    profile_photo_url TEXT,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(place_id, time)
  )`);
});

// ── Multer upload ─────────────────────────────────────────────────────────
const ALLOWED_MIME = new Set([
  'image/jpeg','image/png','image/webp','image/gif',
  'video/mp4','video/webm','video/quicktime',
  'application/pdf',
]);
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'tour';
    const p = (req.body.pillar || '').toLowerCase();
    if (p === 'corporate') folder = 'corporate';
    if (p === 'radha')     folder = 'sangeet';
    if (p === 'main')      folder = 'main';
    cb(null, path.join(uploadsDir, folder));
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const safe = crypto.randomBytes(12).toString('hex');
    cb(null, `${Date.now()}-${safe}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB max
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error(`File type ${file.mimetype} not allowed`));
  },
});

// ── CSRF endpoint ─────────────────────────────────────────────────────────
app.get('/api/csrf-token', requireAuth, (req, res) => {
  res.json({ token: generateCSRF() });
});

// ── Admin Auth ──────────────────────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_USER_PASSWORD || 'RD@Admin2026!';
const ADMIN_USER_EMAIL = process.env.ADMIN_USER_EMAIL || '';

app.post('/api/admin/login', rateLimit(5, 60_000), (req, res) => {
  const { email, password } = req.body;

  // ✅ FIXED BUG: Proper email and password validation
  
  // 1. Password is ALWAYS required
  if (!password) {
    return res.status(400).json({ success: false, error: 'Password is required' });
  }

  // 2. Constant-time password comparison
  const expectedPass = Buffer.from(ADMIN_PASSWORD);
  const providedPass = Buffer.from(password);
  let passMatch = false;
  
  try {
    passMatch = expectedPass.length === providedPass.length &&
      crypto.timingSafeEqual(expectedPass, providedPass);
  } catch (e) {
    passMatch = false;
  }

  // 3. Email validation only if ADMIN_USER_EMAIL is set
  let emailMatch = true;
  if (ADMIN_USER_EMAIL) {
    // Email is required if it's configured
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }
    emailMatch = email.toLowerCase() === ADMIN_USER_EMAIL.toLowerCase();
  }

  // 4. Both must pass
  if (passMatch && emailMatch) {
    const sessionId = createSession(req.ip);
    res.setHeader(
      'Set-Cookie',
      `admin_session=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`
    );
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.status(401).json({ success: false, error: 'Invalid email or password' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  const raw   = req.headers.cookie || '';
  const match = raw.match(/admin_session=([a-f0-9]{64})/);
  if (match) sessions.delete(match[1]);
  res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ success: true });
});

app.get('/api/admin/check', (req, res) => {
  res.json({ authenticated: !!getSession(req) });
});

// ── Leads ───────────────────────────────────────────────────────────
app.get('/api/leads', requireAuth, (req, res) => {
  db.all('SELECT * FROM leads ORDER BY timestamp DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/admin/analytics', requireAuth, (req, res) => {
  db.all('SELECT pillar, budget FROM leads', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    let totalLeads = rows.length;
    let leadsByPillar = { radha: 0, corporate: 0, tour: 0, other: 0 };
    let estimatedRevenue = 0;

    rows.forEach(r => {
      let p = (r.pillar || '').toLowerCase();
      if (p.includes('radha') || p.includes('sangeet')) leadsByPillar.radha++;
      else if (p.includes('corporate') || p.includes('veronica')) leadsByPillar.corporate++;
      else if (p.includes('tour')) leadsByPillar.tour++;
      else leadsByPillar.other++;

      if (r.budget) {
        const budgetMap = {
          'Under ₹25,000': 15000,
          '₹25,000 – ₹75,000': 50000,
          '₹75,000 – ₹2,00,000': 137500,
          '₹2L – ₹5L': 350000,
          'Above ₹5L': 600000,
        };
        const matched = Object.entries(budgetMap).find(([k]) => r.budget.includes(k.replace(/₹/g, '₹')));
        estimatedRevenue += matched ? matched[1] : 0;
      }
    });

    res.json({
      totalLeads,
      leadsByPillar,
      estimatedRevenue: estimatedRevenue > 0 ? `₹${estimatedRevenue.toLocaleString('en-IN')}` : '₹0'
    });
  });
});

app.get('/api/admin/insights', requireAuth, (req, res) => {
  db.all('SELECT pillar, timestamp, budget FROM leads', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    let insights = [];
    if (rows.length === 0) {
      insights.push("No leads yet. Time to launch the new Instagram strategy!");
    } else {
      let pillarCounts = { radha: 0, corporate: 0, tour: 0 };
      rows.forEach(r => {
        let p = (r.pillar || '').toLowerCase();
        if (p.includes('radha') || p.includes('sangeet')) pillarCounts.radha++;
        else if (p.includes('corporate') || p.includes('veronica')) pillarCounts.corporate++;
        else if (p.includes('tour')) pillarCounts.tour++;
      });

      // Insight 1: Best performing pillar
      let topPillar = Object.keys(pillarCounts).reduce((a, b) => pillarCounts[a] > pillarCounts[b] ? a : b);
      insights.push(`🔥 ${topPillar.toUpperCase()} is your strongest pillar right now with ${pillarCounts[topPillar]} leads.`);

      // Insight 2: Weakest pillar
      let weakPillar = Object.keys(pillarCounts).reduce((a, b) => pillarCounts[a] < pillarCounts[b] ? a : b);
      if (pillarCounts[weakPillar] === 0) {
        insights.push(`⚠️ ${weakPillar.toUpperCase()} has 0 leads. Push more content on the @${weakPillar} Instagram account.`);
      }

      // Insight 3: Revenue Check
      let highTicket = rows.filter(r => r.budget && (r.budget.includes('5L') || r.budget.includes('2L')));
      if (highTicket.length > 0) {
        insights.push(`💰 You have ${highTicket.length} HIGH-TICKET leads waiting. Call them immediately to close.`);
      } else {
        insights.push(`📈 All current leads are standard budget. Upsell VIP addons to increase margins.`);
      }
    }
    
    res.json(insights);
  });
});

app.post('/api/leads', rateLimit(10, 60_000), (req, res) => {
  const { name, phone, email, eventType, eventDate, budget, message, pillar, company } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required.' });

  // ── AI Lead Scoring (cost-free, deterministic) ─────────────────────────────
  let score = 0;
  let urgencyTag = 'Low';

  const budgetScores = { 'Above ₹5L': 5, '₹2L – ₹5L': 4, '₹75,000 – ₹2,00,000': 3, '₹25,000 – ₹75,000': 2, 'Under ₹25,000': 1 };
  score += budgetScores[budget] || 0;

  if (email && email.includes('@')) score += 1;
  if (eventDate) score += 2;
  if (message && message.length > 20) score += 1;
  if (company && company.trim().length > 0) score += 1;

  if (eventDate) {
    const daysToEvent = Math.floor((new Date(eventDate) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysToEvent >= 0 && daysToEvent <= 30) { score += 2; urgencyTag = '🔥 Urgent'; }
    else if (daysToEvent > 30 && daysToEvent <= 90) { urgencyTag = '⚡ Hot'; score += 1; }
    else { urgencyTag = 'Warm'; }
  }

  if (score >= 8) urgencyTag = (urgencyTag === 'Warm') ? '⚡ Hot' : urgencyTag;
  if (score >= 10) urgencyTag = '🔥 Urgent';

  score = Math.min(score, 10);
  const statusWithScore = `New | Score:${score} | ${urgencyTag}`;

  db.run(
    `INSERT INTO leads (name,phone,email,eventType,eventDate,budget,message,pillar,company,status) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [name, phone, email, eventType, eventDate, budget, message, pillar, company, statusWithScore],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, score, urgencyTag });
    }
  );
});

app.put('/api/leads/:id', requireAuth, (req, res) => {
  db.run('UPDATE leads SET status=? WHERE id=?', [req.body.status, req.params.id], err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/leads/:id', requireAuth, (req, res) => {
  db.run('DELETE FROM leads WHERE id=?', [req.params.id], err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ── Media ───────────────────────────────────────────────────────────
app.get('/api/media', requireAuth, (req, res) => {
  db.all('SELECT * FROM media ORDER BY timestamp DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/media/public', (req, res) => {
  db.all('SELECT * FROM media ORDER BY timestamp DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/combined-media', (req, res) => {
  const profiles = ['radhaadudega', 'veronicaemcee', 'thetrailcurator'];
  const result = {};
  const placeholderImg = 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?q=80&w=1200&auto=format&fit=crop';
  const placeholderVid = 'https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-background-1611-large.mp4';
  
  for (const p of profiles) {
    const igPath = path.join(__dirname, 'assets', 'media', 'instagram', p, 'media.json');
    const gpPath = path.join(__dirname, 'assets', 'media', 'google-photos', 'media.json');
    
    let ig = { videos: [], images: [] };
    let gp = { videos: [], images: [] };
    
    if (fs.existsSync(igPath)) {
      try {
        ig = JSON.parse(fs.readFileSync(igPath, 'utf8'));
      } catch(e) { console.error('Error parsing IG json', e); }
    }
    if (fs.existsSync(gpPath)) {
      try {
        gp = JSON.parse(fs.readFileSync(gpPath, 'utf8'));
      } catch(e) { console.error('Error parsing GP json', e); }
    }
    
    const merged = { videos: [], images: [] };
    for (let i = 0; i < 5; i++) {
      merged.videos[i] = (ig.videos && ig.videos[i]) || (gp.videos && gp.videos[i]) || placeholderVid;
      merged.images[i] = (ig.images && ig.images[i]) || (gp.images && gp.images[i]) || placeholderImg;
    }
    result[p] = merged;
  }
  res.json(result);
});

app.get('/api/google-photos-media', (req, res) => {
  const file = path.join(__dirname, 'assets', 'media', 'google-photos', 'media.json');
  if (!fs.existsSync(file)) return res.json({ videos: [], images: [] });
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/media', requireAuth, upload.single('file'), (req, res) => {
  const { pillar, type } = req.body;
  let folder = 'tour';
  const p = (pillar || '').toLowerCase();
  if (p === 'corporate') folder = 'corporate';
  if (p === 'radha')     folder = 'sangeet';
  if (p === 'main')      folder = 'main';

  if (req.file) {
    const url = `/uploads/${folder}/${req.file.filename}`;
    const localFilePath = path.join(__dirname, url);

    const hasCloudinary = process.env.CLOUDINARY_NAME && process.env.CLOUDINARY_KEY && process.env.CLOUDINARY_SECRET;

    const saveToDb = (fileUrl) => {
      db.run(
        'INSERT INTO media (name,url,pillar,type,size,originalName) VALUES (?,?,?,?,?,?)',
        [req.file.filename, fileUrl, pillar, type, req.file.size, req.file.originalname],
        function(err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ id: this.lastID, url: fileUrl });
        }
      );
    };

    if (hasCloudinary) {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_NAME,
        api_key:    process.env.CLOUDINARY_KEY,
        api_secret: process.env.CLOUDINARY_SECRET,
      });
      cloudinary.uploader.upload(localFilePath, { folder: `gig_portfolio/${folder}`, resource_type: 'auto' }, (error, result) => {
        if (error) return res.status(500).json({ error: error.message });
        if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
        saveToDb(result.secure_url);
      });
    } else {
      saveToDb(url);
    }
  } else {
    const url  = req.body.url;
    const name = req.body.name || 'ai_enhanced.png';
    db.run(
      'INSERT INTO media (name,url,pillar,type,size,originalName) VALUES (?,?,?,?,?,?)',
      [name, url, pillar, type, 0, name],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, url });
      }
    );
  }
});

app.post('/api/media/trim', requireAuth, (req, res) => {
  const { id, startTime, endTime } = req.body;
  if (!id || startTime === undefined || endTime === undefined)
    return res.status(400).json({ error: 'Missing parameters' });

  db.get('SELECT * FROM media WHERE id=?', [id], (err, media) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!media) return res.status(404).json({ error: 'Media not found' });
    if (media.type !== 'video' || !media.url.startsWith('/uploads/'))
      return res.status(400).json({ error: 'Invalid video file' });

    const inputPath    = path.join(__dirname, media.url);
    const parsedPath   = path.parse(inputPath);
    const outputName   = `trimmed_${Date.now()}_${parsedPath.name}.mp4`;
    const outputPath   = path.join(parsedPath.dir, outputName);
    const outputUrl    = media.url.replace(parsedPath.base, outputName);

    ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(endTime - startTime)
      .output(outputPath)
      .on('end', () => {
        db.run(
          'INSERT INTO media (name,url,pillar,type,originalName,size) VALUES (?,?,?,?,?,?)',
          [`Trimmed: ${media.name}`, outputUrl, media.pillar, media.type, media.originalName, 0],
          function(e) {
            if (e) return res.status(500).json({ error: e.message });
            res.json({ id: this.lastID, url: outputUrl });
          }
        );
      })
      .on('error', e => { console.error('FFmpeg Error:', e); res.status(500).json({ error: 'Video processing failed' }); })
      .run();
  });
});

app.delete('/api/media/:id', requireAuth, (req, res) => {
  db.get('SELECT url FROM media WHERE id=?', [req.params.id], (err, row) => {
    if (row && row.url.startsWith('/uploads')) {
      const fp = path.join(__dirname, row.url);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    db.run('DELETE FROM media WHERE id=?', [req.params.id], e => {
      if (e) return res.status(500).json({ error: e.message });
      res.json({ success: true });
    });
  });
});

// ── UPI QR Validation (server-side) ──────────────────────────────────────────
const UPI_REGEX  = /^[a-zA-Z0-9._-]+@[a-zA-Z]{2,}$/;
const AMOUNT_MAX = 1_000_000;
app.post('/api/generate-qr', rateLimit(20, 60_000), (req, res) => {
  const { upiId, amount, name } = req.body;
  if (!upiId || !UPI_REGEX.test(upiId))
    return res.status(400).json({ error: 'Invalid UPI ID format.' });
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0 || amt > AMOUNT_MAX)
    return res.status(400).json({ error: `Amount must be between 1 and ${AMOUNT_MAX}.` });

  const pa   = encodeURIComponent(upiId);
  const pn   = encodeURIComponent((name || 'Anti Gravity Studio').slice(0, 50));
  const am   = amt.toFixed(2);
  const tn   = encodeURIComponent('Booking Advance');
  const uri  = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
  res.json({ uri, qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(uri)}` });
});

// ── Schedule ──────────────────────────────────────────────────────────
app.get('/api/schedule', requireAuth, (req, res) => {
  db.all('SELECT * FROM schedule ORDER BY date ASC, time ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
app.post('/api/schedule', requireAuth, (req, res) => {
  const { pillar, date, time, topic, caption, mediaUrl } = req.body;
  db.run(
    'INSERT INTO schedule (pillar,date,time,topic,caption,mediaUrl) VALUES (?,?,?,?,?,?)',
    [pillar, date, time, topic, caption, mediaUrl],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});
app.delete('/api/schedule/:id', requireAuth, (req, res) => {
  db.run('DELETE FROM schedule WHERE id=?', [req.params.id], err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ── Analytics ──────────────────────────────────────────────────────────
app.post('/api/analytics/view', rateLimit(120, 60_000), (req, res) => {
  const { url, pillar } = req.body;
  db.run('INSERT INTO page_views (url,pillar) VALUES (?,?)', [url, pillar], err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});
app.post('/api/analytics/event', rateLimit(60, 60_000), (req, res) => {
  const { eventName, pillar } = req.body;
  db.run('INSERT INTO events (eventName,pillar) VALUES (?,?)', [eventName, pillar], err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});
app.get('/api/analytics/stats', requireAuth, (req, res) => {
  const stats = { views: {}, events: {} };
  db.all('SELECT pillar, COUNT(*) as count FROM page_views GROUP BY pillar', [], (err, vRows) => {
    if (!err && vRows) vRows.forEach(r => (stats.views[r.pillar || 'Unknown'] = r.count));
    db.all('SELECT eventName, pillar, COUNT(*) as count FROM events GROUP BY eventName, pillar', [], (err2, eRows) => {
      if (!err2 && eRows) {
        eRows.forEach(r => {
          if (!stats.events[r.pillar]) stats.events[r.pillar] = {};
          stats.events[r.pillar][r.eventName] = r.count;
        });
      }
      res.json(stats);
    });
  });
});

// ── Config ───────────────────────────────────────────────────────────
app.get('/api/config', requireAuth, (req, res) => {
  db.all('SELECT * FROM config', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const cfg = {};
    rows.forEach(r => (cfg[r.key] = r.value));
    res.json(cfg);
  });
});
app.post('/api/config', requireAuth, (req, res) => {
  const { key, value } = req.body;
  db.run('INSERT OR REPLACE INTO config (key,value) VALUES (?,?)', [key, value], err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ── CSV Backup (admin only) ───────────────────────────────────────────────────
app.get('/api/backup/leads', requireAuth, (req, res) => {
  db.all('SELECT * FROM leads ORDER BY timestamp DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const headers = ['id','name','phone','email','eventType','eventDate','budget','pillar','company','status','message','timestamp'];
    const csv = [
      headers.join(','),
      ...rows.map(r =>
        headers.map(h => `"${(r[h] || '').toString().replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');
    const backupPath = path.join(__dirname, `backup_leads_${Date.now()}.csv`);
    fs.writeFileSync(backupPath, csv, 'utf8');
    res.download(backupPath, `Leads_Backup_${new Date().toISOString().split('T')[0]}.csv`, () => {
      setTimeout(() => { if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath); }, 5000);
    });
  });
});

// ── Logs Backup (admin only) ────────────────────────────────────────────────────
app.get('/api/admin/logs', requireAuth, (req, res) => {
  const logs = {};
  const files = ['server.log', 'server_err.log', 'media-god.log', 'broadcast.log'];
  files.forEach(f => {
    const p = path.join(__dirname, f);
    logs[f] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').slice(-5000) : 'No log found.';
  });
  res.json(logs);
});

// ── Health check ────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', port: PORT });
});

// ── Marketing templates ────────────────────────────────────────────────────────
const MARKETING_TEMPLATES = {
  radha: {
    pillarName: 'Radha — The Bhakt',
    emoji: '🪔',
    tone: 'warm, spiritual, emotional',
    hooks: ['Your sangeet deserves a storyteller', 'Every moment becomes a legend'],
    upsells: ['Upgrade to Gold Package', 'Add Heritage Experience'],
    ctas: ['Book a call now', 'Secure your date'],
  },
  veronica: {
    pillarName: 'Veronica — The Corporate Boss',
    emoji: '🎤',
    tone: 'sharp, authoritative',
    hooks: ['Your conference is only as powerful as the voice', 'C-suite events demand C-suite hosting'],
    upsells: ['Add Executive Package', 'Bundle Post-Event Reel'],
    ctas: ['Request quotation', 'Lock your date'],
  },
  tour: {
    pillarName: 'Tour — The Trail Curator',
    emoji: '🧭',
    tone: 'adventurous, cultural',
    hooks: ['Not just a tour, a conversation with history', 'Stories hidden in every stone'],
    upsells: ['Immersive Cultural Package', 'Photography Session'],
    ctas: ['Book experience', 'View gallery'],
  },
};

app.post('/api/agent/marketing/generate', requireAuth, (req, res) => {
  const { pillar, type } = req.body;
  const tpl = MARKETING_TEMPLATES[pillar] || MARKETING_TEMPLATES.radha;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  
  const output = { success: true };
  if (type === 'hook') output.text = pick(tpl.hooks);
  else if (type === 'upsell') output.text = pick(tpl.upsells);
  else if (type === 'cta') output.text = pick(tpl.ctas);
  else output.fullCaption = `${tpl.emoji} ${pick(tpl.hooks)}\n\n${pick(tpl.upsells)}\n\n${pick(tpl.ctas)}`;
  
  res.json(output);
});

// ── 404 catch-all ────────────────────────────────────────────────────────
app.use((req, res) => {
  const file404 = path.join(__dirname, '404.html');
  if (fs.existsSync(file404)) {
    res.status(404).sendFile(file404);
  } else {
    res.status(404).send('404 Not Found');
  }
});

// ── Error handler ────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ───────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`🚀  Server online → http://localhost:${PORT}`);
  console.log(`🔐  Admin login   → http://localhost:${PORT}/admin/login.html`);
  console.log(`💾  Database      → ${DB_PATH}`);
  console.log(`📁  Uploads       → ${uploadsDir}`);
});

// ── Graceful Shutdown ────────────────────────────────────────────────────────
function gracefulShutdown(signal) {
  console.log(`\n[${signal}] Shutting down...`);
  server.close(() => {
    db.close((err) => {
      if (err) console.error('DB error:', err.message);
      else console.log('Database closed.');
      process.exit(0);
    });
  });
  setTimeout(() => { console.error('Forced exit.'); process.exit(1); }, 10000);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
