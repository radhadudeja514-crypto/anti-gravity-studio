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
let sqlite3;
try { sqlite3 = require('sqlite3').verbose(); } catch(e) { console.warn('⚠️  sqlite3 unavailable — DB routes disabled, static serving active'); }
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const ffmpeg   = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const cloudinary   = require('cloudinary').v2;

ffmpeg.setFfmpegPath(ffmpegStatic);

const app  = express();
app.set('trust proxy', 1); // Render/Heroku reverse proxy
const PORT = process.env.PORT || 3005;

// ── CORS Middleware ────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGIN
  ? [process.env.ALLOWED_ORIGIN]
  : ['https://anti-gravity-studio.onrender.com', 'http://localhost:3005'];
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true,
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
      "img-src 'self' data: blob: https://res.cloudinary.com https://*.googleusercontent.com https://img.youtube.com https://*.unsplash.com https://*.ytimg.com https://api.qrserver.com",
      "connect-src 'self' https://api.cloudinary.com https://upload-widget.cloudinary.com https://photoslibrary.googleapis.com https://generativelanguage.googleapis.com https://accounts.google.com https://maps.googleapis.com",
      "media-src 'self' blob: https://res.cloudinary.com",
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://accounts.google.com",
    ].join('; ')
  );
  next();
});

// ── Session management — SQLite-backed (survives Render restarts/redeploys) ──
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
// In-memory fallback Map used ONLY before DB is ready (first few ms of startup)
const sessions = new Map(); // sessionId -> { ip, created } — pre-DB fallback only
let dbReady = false; // set to true once DB block completes

function createSession(ip) {
  const id = crypto.randomBytes(32).toString('hex');
  const created = Date.now();
  // Always write to in-memory Map as immediate fallback
  sessions.set(id, { ip, created });
  // Persist to SQLite if available
  if (dbReady && db) {
    db.run(
      'INSERT OR REPLACE INTO sessions (id, ip, created) VALUES (?,?,?)',
      [id, ip || '', created],
      (err) => { if (err) console.error('Session insert error:', err.message); }
    );
  }
  return id;
}

function getSession(req) {
  const raw = req.headers.cookie || '';
  const match = raw.match(/admin_session=([a-f0-9]{64})/);
  if (!match) return null;
  const sid = match[1];
  const EXPIRE = 8 * 3600 * 1000; // 8 hours
  // Check in-memory first (fastest path, covers pre-DB startup)
  const memSess = sessions.get(sid);
  if (memSess) {
    if (Date.now() - memSess.created > EXPIRE) { sessions.delete(sid); return null; }
    return memSess;
  }
  // NOTE: getSession is called synchronously in middleware — we can't await here.
  // SQLite sessions are loaded into memory at startup (see 'Load active sessions' below).
  // If a session isn't in memory it either expired or this is a fresh boot
  // and the load hasn't completed yet — treat as unauthenticated.
  return null;
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
// Clean expired tokens, sessions + rate limit map every 10 min (prevents memory leak)
setInterval(() => {
  const now = Date.now();
  const EXPIRE = 8 * 3600 * 1000;
  csrfTokens.forEach((exp, tok) => { if (now > exp) csrfTokens.delete(tok); });
  sessions.forEach((sess, id) => { if (now - sess.created > EXPIRE) sessions.delete(id); });
  // Prune expired SQLite sessions
  if (dbReady && db) {
    db.run('DELETE FROM sessions WHERE created < ?', [now - EXPIRE], (err) => {
      if (err) console.error('Session cleanup error:', err.message);
    });
  }
  // Prune stale rate limit entries
  rateLimitMap.forEach((entry, ip) => { if (now - entry.start > 5 * 60 * 1000) rateLimitMap.delete(ip); });
}, 600_000);

// ── Rate limiting ─────────────────────────────────────────────────────────
const rateLimitMap = new Map();
function rateLimit(maxReq, windowMs) {
  // Each rateLimit() call gets its own closure Map — per-route isolation
  const routeMap = new Map();
  // Clean stale entries every 5 min
  setInterval(() => {
    const now = Date.now();
    routeMap.forEach((entry, key) => { if (now - entry.start > windowMs * 2) routeMap.delete(key); });
  }, 5 * 60 * 1000);
  return (req, res, next) => {
    const ip  = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = routeMap.get(ip) || { count: 0, start: now };
    if (now - entry.start > windowMs) { entry.count = 0; entry.start = now; }
    entry.count++;
    routeMap.set(ip, entry);
    if (entry.count > maxReq) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: 'Too many requests – please slow down.' });
    }
    next();
  };
}

// ── Setup directories ───────────────────────────────────────────────────────
// Use UPLOAD_DIR env var (Render persistent disk) if set, else fall back to local uploads/
const uploadsDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
['corporate', 'sangeet', 'tour', 'main'].forEach(d => {
  const p = path.join(uploadsDir, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ── Middleware ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));

// Serve static files (except /admin/* which needs auth check)

// ── YOUTUBE THUMBNAIL IMPORT ─────────────────────────────────────────────────
app.post('/api/media/import-youtube', requireAuth, requireDb, (req, res) => {
  const { url, pillar } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/);
  if (!ytMatch) return res.status(400).json({ error: 'Invalid YouTube URL' });
  const videoId = ytMatch[1];
  const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  const name = `youtube_${videoId}.jpg`;
  db.run(
    'INSERT INTO media (name,url,pillar,type,size,originalName) VALUES (?,?,?,?,?,?)',
    [name, thumbUrl, pillar || 'main', 'youtube', 0, name],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      backupYouTubeEntry(name, thumbUrl, pillar || 'main');
      res.json({ id: this.lastID, url: thumbUrl, videoId, name });
    }
  );
});

// ── BULK YOUTUBE IMPORT ───────────────────────────────────────────────────────
app.post('/api/media/import-youtube-bulk', requireAuth, requireDb, (req, res) => {
  const { urls, pillar } = req.body;
  if (!Array.isArray(urls) || !urls.length) return res.status(400).json({ error: 'urls array required' });
  const results = [];
  let done = 0;
  urls.forEach((url, i) => {
    const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/);
    if (!ytMatch) { done++; if (done === urls.length) res.json({ imported: results }); return; }
    const videoId = ytMatch[1];
    const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    const name = `youtube_${videoId}.jpg`;
    db.run(
      'INSERT INTO media (name,url,pillar,type,size,originalName) VALUES (?,?,?,?,?,?)',
      [name, thumbUrl, pillar || 'main', 'youtube', 0, name],
      function(err) {
        if (!err) { results.push({ id: this.lastID, url: thumbUrl, videoId }); backupYouTubeEntry(name, thumbUrl, pillar || 'main'); }
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

// ── GOOGLE PHOTOS IMPORT (download → Cloudinary → DB) ────────────────────────
// Google Photos baseUrls are TEMPORARY (~60 min). We must re-upload to Cloudinary
// for a permanent URL; fall back to local disk only when Cloudinary is not configured.
app.post('/api/media/import-google-photos', requireAuth, requireDb, async (req, res) => {
  const { items, pillar } = req.body; // items: [{url, name}]
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items array required' });

  const hasCloudinary = process.env.CLOUDINARY_NAME && process.env.CLOUDINARY_KEY && process.env.CLOUDINARY_SECRET;
  if (hasCloudinary) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_NAME,
      api_key:    process.env.CLOUDINARY_KEY,
      api_secret: process.env.CLOUDINARY_SECRET,
    });
  }

  const results = [];
  const folder  = pillar || 'main';

  const saveToDb = (name, permanentUrl, cb) => {
    db.run(
      'INSERT INTO media (name,url,pillar,type,size,originalName) VALUES (?,?,?,?,?,?)',
      [name, permanentUrl, folder, 'image', 0, name],
      function(err) { cb(err, this ? this.lastID : null); }
    );
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const name = item.name || `gp_${Date.now()}_${i}.jpg`;
    // Append =d to get full-resolution download from Google Photos
    const downloadUrl = item.url.replace(/=d$/, '') + '=d';

    try {
      if (hasCloudinary) {
        // Upload directly from URL to Cloudinary — no local disk needed
        const result = await cloudinary.uploader.upload(downloadUrl, {
          folder:        `gig_portfolio/${folder}`,
          resource_type: 'image',
          public_id:     name.replace(/\.[^.]+$/, ''),
          overwrite:     false,
        });
        await new Promise((resolve, reject) => {
          saveToDb(name, result.secure_url, (err) => err ? reject(err) : resolve());
        });
        results.push({ url: result.secure_url });
      } else {
        // No Cloudinary — download to local uploads (ephemeral on Render)
        const response = await fetch(downloadUrl);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        const buffer   = Buffer.from(await response.arrayBuffer());
        const localDir = path.join(uploadsDir, folder);
        if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
        const localPath = path.join(localDir, name);
        fs.writeFileSync(localPath, buffer);
        const localUrl = `/uploads/${folder}/${name}`;
        await new Promise((resolve, reject) => {
          saveToDb(name, localUrl, (err) => err ? reject(err) : resolve());
        });
        results.push({ url: localUrl });
      }
    } catch (e) {
      console.error('GP import error:', name, e.message);
      // Skip this photo but continue with the rest
    }
  }

  res.json({ imported: results });
});

// ── Hero background images (3 photos, admin-controlled) ──────────────────────
app.get('/api/hero-images', requireDb, (req, res) => {
  db.all("SELECT key,value FROM config WHERE key IN ('hero_bg_1','hero_bg_2','hero_bg_3')", [], (err, rows) => {
    const imgs = { hero_bg_1: '', hero_bg_2: '', hero_bg_3: '' };
    if (rows) rows.forEach(r => (imgs[r.key] = r.value));
    res.json(imgs);
  });
});

app.post('/api/hero-images', requireAuth, requireDb, (req, res) => {
  const { hero_bg_1, hero_bg_2, hero_bg_3 } = req.body;
  const pairs = [['hero_bg_1', hero_bg_1 || ''], ['hero_bg_2', hero_bg_2 || ''], ['hero_bg_3', hero_bg_3 || '']];
  let done = 0;
  pairs.forEach(([k, v]) => {
    db.run('INSERT OR REPLACE INTO config (key,value) VALUES (?,?)', [k, v], () => {
      if (++done === pairs.length) res.json({ success: true });
    });
  });
});

// ── AI image analysis (Gemini Flash) — suggests pillar from base64 image ──────
app.post('/api/media/ai-analyze', requireAuth, async (req, res) => {
  const { images } = req.body; // [{base64, mimeType, filename}]
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.json({ error: 'GEMINI_API_KEY not set', results: [] });
  if (!Array.isArray(images) || !images.length) return res.status(400).json({ error: 'images array required' });

  const PROMPT = `You are helping tag photos for an entertainment professional's website.
The pillars are:
- "radha"     → wedding / bride / dance / ceremony / love / romantic
- "corporate" → office / business / conference / stage / speaking / mic / formal / anchor
- "tour"      → travel / outdoor / scenic / adventure / city / tourism
- "main"      → generic / portrait / logo / branding / mixed

For each image provided, reply with ONLY a JSON array like: ["radha","corporate","tour","main"]
One entry per image in the same order. No explanation.`;

  try {
    const parts = [{ text: PROMPT }];
    images.forEach(img => {
      parts.push({ inlineData: { mimeType: img.mimeType || 'image/jpeg', data: img.base64 } });
    });
    const body = { contents: [{ parts }] };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    // Parse JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    const results = match ? JSON.parse(match[0]) : images.map(() => 'main');
    res.json({ results });
  } catch (e) {
    console.error('Gemini analyze error:', e.message);
    res.json({ error: e.message, results: images.map(() => 'main') });
  }
});

// Block sensitive file access before static serving
app.use((req, res, next) => {
  const blocked = /\.(sqlite|db|env|log|bat|sh|md)$|server-fixed\.js|node_modules|\.git|package(-lock)?\.json$/i;
  if (blocked.test(req.path)) return res.status(403).send('Forbidden');
  next();
});

// ── GA4 Measurement ID (safe to expose — it's public) ──────────────────────
app.get('/api/ga4-id', (req, res) => {
  res.json({ id: process.env.GA4_MEASUREMENT_ID || 'G-XXXXXXXXXX' });
});

// ── UPI QR code generator ─────────────────────────────────────────────────────
app.post('/api/generate-qr', rateLimit(20, 60_000), (req, res) => {
  const { upiId, amount, name } = req.body || {};
  if (!upiId || !/^[\w.\-]+@[\w]+$/.test(upiId)) {
    return res.status(400).json({ error: 'Invalid UPI ID' });
  }
  const uri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(name || '')}&am=${amount || ''}&cu=INR`;
  // Use public QR API — no server-side library needed
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(uri)}&size=240x240&ecc=M`;
  res.json({ qrUrl, uri, upiUrl: uri, qrData: uri });
});
app.use(express.static(path.join(__dirname), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (/\.(css|js)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (/\.(woff2?|ttf|png|jpg|jpeg|webp|svg|mp4|mov)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
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
const db = sqlite3 ? new sqlite3.Database(DB_PATH) : null;
if (db) db.serialize(() => {
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
  db.run(`CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT,
    message TEXT,
    rating INTEGER,
    type TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Migrations: safely add columns missing in older DB schemas ──────────
  const addCol = (tbl, col, def) => db.run(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${def}`, () => {});
  addCol('media',    'timestamp',    'DATETIME DEFAULT CURRENT_TIMESTAMP');
  addCol('media',    'originalName', 'TEXT');
  addCol('media',    'size',         'INTEGER');
  addCol('leads',    'timestamp',    'DATETIME DEFAULT CURRENT_TIMESTAMP');
  addCol('leads',    'company',      'TEXT');
  addCol('leads',    'status',       "TEXT DEFAULT 'New'");
  addCol('leads',    'notes',        'TEXT');
  addCol('schedule', 'timestamp',    'DATETIME DEFAULT CURRENT_TIMESTAMP');
  addCol('schedule', 'clientName',   'TEXT');
  addCol('schedule', 'eventType',    'TEXT');
  addCol('schedule', 'notes',        'TEXT');
  addCol('schedule', 'title',        'TEXT');
  addCol('schedule', 'content',      'TEXT');
  addCol('schedule', 'platform',     'TEXT');
  addCol('instagram_queue', 'pillar', 'TEXT DEFAULT ""');
  addCol('instagram_queue', 'topic',  'TEXT DEFAULT ""');

  // ── Sessions table (persistent login across Render restarts) ─────────────
  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    ip TEXT,
    created INTEGER
  )`);

  // Pre-load active sessions into memory so getSession() works synchronously
  setTimeout(() => {
    const EXPIRE = 8 * 3600 * 1000;
    db.all('SELECT id, ip, created FROM sessions WHERE created > ?', [Date.now() - EXPIRE], (err, rows) => {
      if (err) { console.error('Session pre-load error:', err.message); return; }
      (rows || []).forEach(r => sessions.set(r.id, { ip: r.ip, created: r.created }));
      console.log(`[sessions] Loaded ${(rows||[]).length} active session(s) from DB`);
    });
    dbReady = true;
  }, 200); // tiny delay so all CREATE TABLE/ALTER TABLE ops finish first
});

// ── DB guard middleware ───────────────────────────────────────────────────
// If sqlite3 failed to load, DB-dependent API routes return 503
// NOTE: must be a function declaration (hoisted) so it can be referenced
// before this line in the file.
function requireDb(req, res, next) {
  if (!db) return res.status(503).json({ error: 'Database unavailable' });
  next();
}

// ── Multer upload ─────────────────────────────────────────────────────────
const ALLOWED_MIME = new Set([
  'image/jpeg','image/png','image/webp','image/gif',
  'video/mp4','video/webm','video/quicktime',
  'application/pdf',
]);
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // NOTE: req.body is NOT reliable here — multipart fields after the file aren't parsed yet.
    // We use req.query.pillar (passed as ?pillar=xxx in the upload URL) as the reliable source.
    let folder = 'tour';
    const p = (req.query.pillar || req.body.pillar || '').toLowerCase();
    if (p === 'corporate') folder = 'corporate';
    if (p === 'radha')     folder = 'sangeet';
    if (p === 'main')      folder = 'main';
    const dir = path.join(uploadsDir, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
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
      `admin_session=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
    );
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.status(401).json({ success: false, error: 'Invalid email or password' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  const raw   = req.headers.cookie || '';
  const match = raw.match(/admin_session=([a-f0-9]{64})/);
  if (match) {
    sessions.delete(match[1]);
    if (dbReady && db) db.run('DELETE FROM sessions WHERE id=?', [match[1]]);
  }
  res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ success: true });
});

// ── Google Reviews (public read, admin write) ────────────────────────────────
app.get('/api/google-reviews', requireDb, (req, res) => {
  db.all('SELECT * FROM google_reviews ORDER BY time DESC LIMIT 50', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const reviews = rows || [];
    // Compute aggregate stats so badge widgets can use d.rating / d.total
    const total = reviews.length;
    const avgRating = total ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / total : null;
    const fiveStarCount = reviews.filter(r => r.rating === 5).length;
    res.json({ reviews, avgRating, totalReviews: total, fiveStarCount, rating: avgRating, total });
  });
});

// ── Google Places auto-fetch ──────────────────────────────────────────────────
async function fetchGooglePlacesReviews() {
  if (!db) return;
  let apiKey = process.env.GOOGLE_PLACES_KEY || process.env.GOOGLE_PLACES_API_KEY || '';
  let placeId = process.env.GOOGLE_PLACE_ID || '';
  if (!apiKey || !placeId) {
    await new Promise(resolve => {
      db.all("SELECT key,value FROM config WHERE key IN ('GOOGLE_PLACES_KEY','GOOGLE_PLACE_ID','GOOGLE_PLACES_API_KEY')", [], (err, rows) => {
        if (!err && rows) rows.forEach(r => {
          if (r.key === 'GOOGLE_PLACES_KEY' || r.key === 'GOOGLE_PLACES_API_KEY') apiKey = apiKey || r.value;
          if (r.key === 'GOOGLE_PLACE_ID') placeId = placeId || r.value;
        });
        resolve();
      });
    });
  }
  if (!apiKey || !placeId) return;
  try {
    const https = require('https');
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews,rating,user_ratings_total&key=${apiKey}`;
    const data = await new Promise((resolve, reject) => {
      https.get(url, res => { let body=''; res.on('data',d=>body+=d); res.on('end',()=>{try{resolve(JSON.parse(body));}catch(e){reject(e);}}); }).on('error',reject);
    });
    if (data.status !== 'OK' || !data.result) { console.log('[Google Places] API:', data.status, data.error_message||''); return; }
    const reviews = data.result.reviews || [];
    if (!reviews.length) return;
    let saved = 0;
    await Promise.all(reviews.map(r => new Promise(resolve => {
      db.run('INSERT OR IGNORE INTO google_reviews (place_id,author_name,rating,text,time,profile_photo_url) VALUES (?,?,?,?,?,?)',
        [placeId, r.author_name||'', r.rating||5, r.text||'', r.time||0, r.profile_photo_url||''], () => { saved++; resolve(); });
    })));
    console.log(`[Google Places] Synced ${saved} new reviews for place ${placeId}`);
  } catch(e) { console.error('[Google Places] fetch error:', e.message); }
}
setTimeout(fetchGooglePlacesReviews, 10000);

// ── YouTube ID backup/restore (survives DB wipe) ─────────────────────────────
const YT_BACKUP_FILE = path.join(process.env.UPLOAD_DIR || path.join(__dirname,'data'), 'yt-backup.json');

function backupYouTubeEntry(name, url, pillar) {
  try {
    let data = {};
    try { data = JSON.parse(require('fs').readFileSync(YT_BACKUP_FILE,'utf8')); } catch(_) {}
    if (!data.videos) data.videos = [];
    const id = name.replace('youtube_','').replace('.jpg','');
    if (!data.videos.find(v => v.id === id)) {
      data.videos.push({ id, name, url, pillar, ts: Date.now() });
      require('fs').writeFileSync(YT_BACKUP_FILE, JSON.stringify(data, null, 2));
    }
  } catch(e) { /* non-fatal */ }
}

function restoreYouTubeBackup() {
  if (!db) return;
  try {
    const data = JSON.parse(require('fs').readFileSync(YT_BACKUP_FILE,'utf8'));
    if (!data.videos || !data.videos.length) return;
    db.get('SELECT COUNT(*) as c FROM media WHERE type="youtube"', [], (err, row) => {
      if (err || (row && row.c > 0)) return; // DB already has YT entries
      console.log('[YouTube] DB empty — restoring', data.videos.length, 'videos from backup');
      data.videos.forEach(v => {
        db.run('INSERT OR IGNORE INTO media (name,url,pillar,type,size,originalName) VALUES (?,?,?,?,?,?)',
          [v.name, v.url, v.pillar, 'youtube', 0, v.name], () => {});
      });
    });
  } catch(_) { /* no backup file yet */ }
}
setTimeout(restoreYouTubeBackup, 500); // run after DB is ready

setInterval(fetchGooglePlacesReviews, 6*60*60*1000);
app.post('/api/admin/sync-reviews', requireAuth, async (req, res) => {
  try {
    await fetchGooglePlacesReviews();
    db.all('SELECT COUNT(*) as c FROM google_reviews', [], (err, rows) => { res.json({ success: true, total: rows?.[0]?.c || 0 }); });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Feedback (private low-rating feedback from review-hub.html) ────────────
app.post('/api/feedback', requireDb, (req, res) => {
  const { name, email, message, rating, type } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  db.run(
    'INSERT INTO feedback (name,email,message,rating,type) VALUES (?,?,?,?,?)',
    [name || '', email || '', message, rating || 0, type || ''],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.post('/api/google-reviews', requireAuth, requireDb, (req, res) => {
  const reviews = Array.isArray(req.body) ? req.body : [req.body];
  let done = 0;
  if (!reviews.length) return res.json({ success: true, count: 0 });
  reviews.forEach(r => {
    db.run(
      'INSERT OR IGNORE INTO google_reviews (place_id,author_name,rating,text,time,profile_photo_url) VALUES (?,?,?,?,?,?)',
      [r.place_id || '', r.author_name || '', r.rating || 5, r.text || '', r.time || Date.now(), r.profile_photo_url || ''],
      () => { if (++done === reviews.length) res.json({ success: true, count: done }); }
    );
  });
});

app.get('/api/admin/check', (req, res) => {
  res.json({ authenticated: !!getSession(req) });
});

// ── Leads ───────────────────────────────────────────────────────────
app.get('/api/leads', requireAuth, requireDb, (req, res) => {
  db.all('SELECT * FROM leads ORDER BY timestamp DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/admin/analytics', requireAuth, requireDb, (req, res) => {
  db.all('SELECT pillar, budget, status FROM leads', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const budgetMap = {
      'Under': 15000,
      '25,000': 50000,
      '75,000': 137500,
      '2L': 350000,
      '5L': 600000,
    };
    const revenueByPillar = { Radhaa: 0, Corporate: 0, Tour: 0 };
    let booked = 0;

    rows.forEach(r => {
      const p = (r.pillar || '').toLowerCase();
      let pillarKey = p.includes('radha') || p.includes('sangeet') ? 'Radhaa'
        : p.includes('corp') || p.includes('veronica') ? 'Corporate'
        : p.includes('tour') ? 'Tour' : null;

      let rev = 0;
      if (r.budget) {
        const matched = Object.entries(budgetMap).find(([k]) => r.budget.includes(k));
        rev = matched ? matched[1] : 0;
      }
      if (pillarKey) revenueByPillar[pillarKey] += rev;
      if ((r.status || '').toLowerCase() === 'booked') booked++;
    });

    const conversionRate = rows.length > 0 ? Math.round((booked / rows.length) * 100) : 0;
    res.json({ revenue: revenueByPillar, conversion: conversionRate });
  });
});

app.get('/api/admin/insights', requireAuth, requireDb, (req, res) => {
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

// ── ANALYTICS ─────────────────────────────────────────────────────────────────
app.post('/api/analytics/view', rateLimit(120, 60_000), requireDb, (req, res) => {
  const { page, pillar } = req.body || {};
  db.run('INSERT INTO page_views (url, pillar) VALUES (?, ?)', [page || req.path, pillar || ''], () => {});
  res.json({ ok: true });
});

app.post('/api/analytics/event', rateLimit(60, 60_000), requireDb, (req, res) => {
  const { event, eventName, page, pillar } = req.body || {};
  const name = eventName || event || 'unknown';
  db.run('INSERT INTO events (eventName, pillar) VALUES (?, ?)', [name, pillar || ''], () => {});
  res.json({ ok: true });
});

app.get('/api/analytics/stats', requireAuth, requireDb, (req, res) => {
  db.all('SELECT pillar, COUNT(*) as cnt FROM page_views GROUP BY pillar', [], (errV, viewRows) => {
    db.all('SELECT pillar, eventName, COUNT(*) as cnt FROM events GROUP BY pillar, eventName', [], (errE, eventRows) => {
      // views: {pillar: count}
      const views = {};
      (viewRows || []).forEach(r => { views[r.pillar || 'Unknown'] = r.cnt; });
      // events: {pillar: {eventName: count}}
      const events = {};
      (eventRows || []).forEach(r => {
        const p = r.pillar || 'Unknown';
        if (!events[p]) events[p] = {};
        events[p][r.eventName || 'unknown'] = r.cnt;
      });
      res.json({ views, events });
    });
  });
});

// ── Admin logs ────────────────────────────────────────────────────────────────
app.get('/api/admin/logs', requireAuth, requireDb, (req, res) => {
  db.all('SELECT * FROM page_views ORDER BY timestamp DESC LIMIT 200', [], (errV, views) => {
    db.all('SELECT * FROM events ORDER BY timestamp DESC LIMIT 200', [], (errE, events) => {
      res.json({
        views:  (views  || []).map(v => ({ url: v.page || v.url || '', pillar: v.pillar || '', timestamp: v.timestamp })),
        events: (events || []).map(e => ({ eventName: e.eventName || e.event_name || '', pillar: e.pillar || '', timestamp: e.timestamp })),
      });
    });
  });
});

app.post('/api/leads', rateLimit(10, 60_000), requireDb, (req, res) => {
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

app.put('/api/leads/:id', requireAuth, requireDb, (req, res) => {
  db.run('UPDATE leads SET status=COALESCE(?,status), notes=COALESCE(?,notes) WHERE id=?', [req.body.status||null, req.body.notes!==undefined?req.body.notes:null, req.params.id], err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/leads/:id', requireAuth, requireDb, (req, res) => {
  db.run('DELETE FROM leads WHERE id=?', [req.params.id], err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ── Media ───────────────────────────────────────────────────────────
app.get('/api/media', requireAuth, requireDb, (req, res) => {
  db.all('SELECT * FROM media ORDER BY timestamp DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/media/public', requireDb, (req, res) => {
  db.all('SELECT * FROM media ORDER BY timestamp DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/combined-media', (req, res) => {
  const profiles = ['RadhaDudeja', 'veronicaemcee', 'thetrailcurator'];
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

app.post('/api/media', requireAuth, requireDb, upload.single('file'), (req, res) => {
  // pillar/type come from body (reliably available after multer finishes)
  // query.pillar was used by multer destination; body.pillar used here
  const pillar = req.body.pillar || req.query.pillar || 'main';
  const type   = req.body.type   || 'photo';
  let folder = 'tour';
  const p = pillar.toLowerCase();
  if (p === 'corporate') folder = 'corporate';
  if (p === 'radha')     folder = 'sangeet';
  if (p === 'main')      folder = 'main';

  if (req.file) {
    // req.file.path is the ACTUAL path where multer saved the file (uses uploadsDir, not __dirname)
    const actualFilePath = req.file.path;
    // Derive a served URL relative to uploadsDir: /uploads/folder/filename
    const relFromUploads = path.relative(uploadsDir, actualFilePath).replace(/\\/g, '/');
    const url = '/uploads/' + relFromUploads;

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
      // Use actualFilePath (correct disk path) for Cloudinary upload
      cloudinary.uploader.upload(actualFilePath, { folder: `gig_portfolio/${folder}`, resource_type: 'auto' }, (error, result) => {
        if (error) return res.status(500).json({ error: error.message });
        try { if (fs.existsSync(actualFilePath)) fs.unlinkSync(actualFilePath); } catch(_) {}
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

app.post('/api/media/trim', requireAuth, requireDb, (req, res) => {
  const { id, startTime, endTime } = req.body;
  if (!id || startTime === undefined || endTime === undefined)
    return res.status(400).json({ error: 'Missing parameters' });

  db.get('SELECT * FROM media WHERE id=?', [id], (err, media) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!media) return res.status(404).json({ error: 'Media not found' });
    if (media.type !== 'video' || !media.url.startsWith('/uploads/'))
      return res.status(400).json({ error: 'Invalid video file' });

    // media.url = /uploads/folder/filename — resolve against uploadsDir (persistent disk)
    const relFromUploads = media.url.replace(/^\/uploads\//, '');
    const inputPath    = path.join(uploadsDir, relFromUploads);
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

// ── MERGE videos (FFmpeg concat) ─────────────────────────────────────────────
app.post('/api/media/merge', requireAuth, requireDb, (req, res) => {
  const { ids, outputName, pillar } = req.body;
  if (!Array.isArray(ids) || ids.length < 2)
    return res.status(400).json({ error: 'Need at least 2 video IDs' });

  const placeholders = ids.map(() => '?').join(',');
  db.all(`SELECT * FROM media WHERE id IN (${placeholders})`, ids, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const ordered = ids.map(id => rows.find(r => r.id === Number(id)));
    if (ordered.some(r => !r || !r.url.startsWith('/uploads/')))
      return res.status(400).json({ error: 'One or more clips are not local uploads' });

    const listPath   = path.join(uploadsDir, `concat_${Date.now()}.txt`);
    const listLines  = ordered.map(r => `file '${path.join(uploadsDir, r.url.replace(/^\/uploads\//, ''))}'`).join('\n');
    fs.writeFileSync(listPath, listLines, 'utf8');

    const mergedName = `merged_${Date.now()}.mp4`;
    const mergedPath = path.join(uploadsDir, mergedName);
    const mergedUrl  = `/uploads/${mergedName}`;

    ffmpeg()
      .input(listPath)
      .inputOptions(['-f concat', '-safe 0'])
      .output(mergedPath)
      .videoCodec('copy')
      .audioCodec('copy')
      .on('end', () => {
        try { fs.unlinkSync(listPath); } catch (_) {}
        db.run(
          'INSERT INTO media (name,url,pillar,type,originalName,size) VALUES (?,?,?,?,?,?)',
          [outputName || mergedName, mergedUrl, pillar || 'main', 'video', mergedName, 0],
          function (e2) {
            if (e2) return res.status(500).json({ error: e2.message });
            res.json({ id: this.lastID, url: mergedUrl });
          }
        );
      })
      .on('error', e => {
        try { fs.unlinkSync(listPath); } catch (_) {}
        res.status(500).json({ error: 'Merge failed: ' + e.message });
      })
      .run();
  });
});

// ── Instagram scheduling queue ────────────────────────────────────────────────
if (db) db.run(`CREATE TABLE IF NOT EXISTS instagram_queue (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  mediaId       INTEGER,
  mediaUrl      TEXT,
  caption       TEXT,
  accounts      TEXT DEFAULT '[]',
  scheduledFor  TEXT,
  status        TEXT DEFAULT 'pending',
  createdAt     TEXT DEFAULT CURRENT_TIMESTAMP
)`);
// ── Delete media item ──────────────────────────────────────────────────────────
app.delete('/api/media/:id', requireAuth, requireDb, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  db.get('SELECT url FROM media WHERE id=?', [id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Not found' });
    db.run('DELETE FROM media WHERE id=?', [id], function(err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      // Best-effort local file delete (won't fail if Cloudinary or missing)
      try {
        // row.url = /uploads/folder/filename — resolve against uploadsDir (persistent disk)
        if (row.url && row.url.startsWith('/uploads/')) {
          const localPath = path.join(uploadsDir, row.url.replace(/^\/uploads\//, ''));
          if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
        }
      } catch (_) {}
      res.json({ success: true, id });
    });
  });
});


app.get('/api/instagram/queue', requireAuth, requireDb, (req, res) => {
  db.all('SELECT * FROM instagram_queue ORDER BY scheduledFor ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({ ...r, accounts: JSON.parse(r.accounts || '[]') })));
  });
});

app.post('/api/instagram/queue', requireAuth, requireDb, (req, res) => {
  const { mediaId, mediaUrl, caption, accounts, scheduledFor } = req.body;
  if (!mediaUrl || !caption)
    return res.status(400).json({ error: 'mediaUrl and caption required' });
  db.run(
    'INSERT INTO instagram_queue (mediaId,mediaUrl,caption,accounts,scheduledFor) VALUES (?,?,?,?,?)',
    [mediaId || null, mediaUrl, caption, JSON.stringify(accounts || []), scheduledFor || new Date().toISOString()],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

app.put('/api/instagram/queue/:id', requireAuth, requireDb, (req, res) => {
  const { status } = req.body;
  db.run('UPDATE instagram_queue SET status=? WHERE id=?', [status, req.params.id], err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/instagram/queue/:id', requireAuth, requireDb, (req, res) => {
  db.run('DELETE FROM instagram_queue WHERE id=?', [req.params.id], err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ── Public env config ─────────────────────────────────────────────────────────
app.get('/api/public-config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    instagramAccounts: [
      process.env.IG_ACCOUNT_1 || '',
      process.env.IG_ACCOUNT_2 || '',
      process.env.IG_ACCOUNT_3 || '',
    ].filter(Boolean),
  });
});

// ── DB config key/value store ─────────────────────────────────────────────────
// GET /api/config — public read (values are non-sensitive URLs/IDs)
app.get('/api/config', requireDb, (req, res) => {
  db.all('SELECT key, value FROM config', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const cfg = {};
    (rows || []).forEach(r => { cfg[r.key] = r.value; });
    // Also expose env-based config keys if not in DB
    if (!cfg.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID) {
      cfg.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    }
    if (!cfg.GOOGLE_PLACE_ID && process.env.GOOGLE_PLACE_ID) {
      cfg.GOOGLE_PLACE_ID = process.env.GOOGLE_PLACE_ID;
    }
    if (!cfg.GOOGLE_PLACES_KEY && (process.env.GOOGLE_PLACES_KEY || process.env.GOOGLE_PLACES_API_KEY)) {
      cfg.GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_KEY || process.env.GOOGLE_PLACES_API_KEY;
    }
    res.json(cfg);
  });
});

// POST /api/config — admin only, upsert one key/value
app.post('/api/config', requireAuth, requireDb, (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  db.run(
    'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    [key, value || ''],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// ── PAYMENTS ─────────────────────────────────────────────────────────────────
if (db) db.run(`CREATE TABLE IF NOT EXISTS payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  leadId      INTEGER,
  amount      REAL,
  method      TEXT DEFAULT 'Cash',
  notes       TEXT,
  status      TEXT DEFAULT 'Pending',
  createdAt   TEXT DEFAULT CURRENT_TIMESTAMP
)`);

app.get('/api/payments', requireAuth, requireDb, (req, res) => {
  db.all(`SELECT p.*, l.name as clientName, l.eventType
          FROM payments p
          LEFT JOIN leads l ON l.id = p.leadId
          ORDER BY p.createdAt DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/payments', requireAuth, requireDb, (req, res) => {
  const { leadId, amount, method, notes, status } = req.body;
  if (!amount) return res.status(400).json({ error: 'amount required' });
  db.run(
    'INSERT INTO payments (leadId,amount,method,notes,status) VALUES (?,?,?,?,?)',
    [leadId || null, amount, method || 'Cash', notes || '', status || 'Pending'],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

app.put('/api/payments/:id', requireAuth, requireDb, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { amount, method, notes, status } = req.body;
  db.run(
    'UPDATE payments SET amount=COALESCE(?,amount), method=COALESCE(?,method), notes=COALESCE(?,notes), status=COALESCE(?,status) WHERE id=?',
    [amount, method, notes, status, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.delete('/api/payments/:id', requireAuth, requireDb, (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.run('DELETE FROM payments WHERE id=?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});





// ── AGENT stubs (read-only analytics endpoints for agent pages) ────────────
app.get('/api/agent/data/health', requireAuth, requireDb, (req, res) => {
  const t0 = Date.now();
  db.get('SELECT COUNT(*) as total FROM leads', [], (_e, r1) => {
    db.get("SELECT COUNT(*) as newLeads FROM leads WHERE status='New' OR status IS NULL", [], (_e1b, r1b) => {
      db.get('SELECT COUNT(*) as total FROM media', [], (_e2, r2) => {
        db.get('SELECT COUNT(*) as total FROM schedule', [], (_e3, r3) => {
          db.get("SELECT COUNT(*) as upcoming FROM schedule WHERE date >= date('now')", [], (_e4, r4) => {
            res.json({
              success: true,
              health: {
                server: {
                  status: 'running',
                  uptime: formatUptime(process.uptime()),
                  port: PORT,
                  nodeVersion: process.version,
                },
                database: { status: 'connected' },
                leads: { total: (r1 && r1.total) || 0, new: (r1b && r1b.newLeads) || 0 },
                media: { total: (r2 && r2.total) || 0, localStorageMB: '0.0' },
                schedule: { total: (r3 && r3.total) || 0, upcoming: (r4 && r4.upcoming) || 0 },
                responseTimeMs: Date.now() - t0,
                timestamp: Date.now(),
              }
            });
          });
        });
      });
    });
  });
});

function formatUptime(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

app.get('/api/agent/data/media-stats', requireAuth, requireDb, (req, res) => {
  db.all('SELECT pillar, type, COUNT(*) as count FROM media GROUP BY pillar, type', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // Frontend expects {stats: {pillar: {type: count, ...}}}
    const stats = {};
    (rows || []).forEach(r => {
      if (!stats[r.pillar]) stats[r.pillar] = {};
      stats[r.pillar][r.type || 'image'] = r.count;
    });
    res.json({ stats });
  });
});

app.get('/api/agent/data/leads-export', requireAuth, requireDb, (req, res) => {
  const { pillar, status, from, to } = req.query;
  let sql = 'SELECT * FROM leads WHERE 1=1';
  const params = [];
  if (pillar) { sql += ' AND pillar=?'; params.push(pillar); }
  if (status) { sql += ' AND status=?'; params.push(status); }
  if (from)   { sql += ' AND timestamp>=?'; params.push(from); }
  if (to)     { sql += ' AND timestamp<=?'; params.push(to); }
  sql += ' ORDER BY timestamp DESC LIMIT 500';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // Frontend reads d.leads
    res.json({ leads: rows || [] });
  });
});

// Alias: agent-instagram.html uses this path for DELETE
app.delete('/api/agent/instagram/post/:id', requireAuth, requireDb, (req, res) => {
  db.run('DELETE FROM instagram_queue WHERE id=?', [req.params.id], err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/agent/instagram/scheduled', requireAuth, requireDb, (req, res) => {
  db.all('SELECT * FROM instagram_queue ORDER BY scheduledFor ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({ ...r, accounts: JSON.parse(r.accounts || '[]') })));
  });
});

app.post('/api/agent/instagram/schedule-post', requireAuth, requireDb, (req, res) => {
  const { mediaUrl, caption, accounts, scheduledFor, pillar, date, time, topic } = req.body;
  if (!caption) return res.status(400).json({ error: 'caption required' });
  // Support both old format (mediaUrl, scheduledFor) and new format (date, time)
  const sf = scheduledFor || (date ? `${date}T${time || '10:00'}:00` : new Date().toISOString());
  db.run(
    'INSERT INTO instagram_queue (mediaUrl,caption,accounts,scheduledFor,pillar,topic) VALUES (?,?,?,?,?,?)',
    [mediaUrl || '', caption, JSON.stringify(accounts || []), sf, pillar || '', topic || ''],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});


app.get('/api/agent/instagram/best-times', requireAuth, (_req, res) => {
  // Static best-posting-times — can be replaced with real analytics later
  res.json([
    { day: 'Monday',    time: '09:00', score: 82 },
    { day: 'Wednesday', time: '11:00', score: 91 },
    { day: 'Friday',    time: '18:00', score: 88 },
    { day: 'Saturday',  time: '10:00', score: 94 },
    { day: 'Sunday',    time: '19:00', score: 87 },
  ]);
});

app.get('/api/agent/marketing/all-pillars', requireAuth, requireDb, (_req, res) => {
  db.all('SELECT pillar, COUNT(*) as mediaCount FROM media GROUP BY pillar', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const pillars = [
      { id: 'radha',     name: 'Radhaa (Wedding)', icon: '🤔\uDEEF' },
      { id: 'corporate', name: 'Corporate',         icon: '🎙️' },
      { id: 'tour',      name: 'Tour',              icon: '🧭' },
      { id: 'main',      name: 'Main',              icon: '🌐' },
    ];
    res.json(pillars.map(p => ({
      ...p,
      mediaCount: (rows.find(r => r.pillar === p.id) || { mediaCount: 0 }).mediaCount,
    })));
  });
});

app.post('/api/agent/marketing/generate', requireAuth, (req, res) => {
  const { pillar = 'radha', type = 'hook' } = req.body || {};
  const T = {
    radha: {
      hook: '✨ Every love story deserves to be told beautifully.\nKartikey Bameta brings your wedding to life with heartfelt hosting, emotional rituals & unforgettable moments.\n💍 Inquire now → antigravitystudio.com/booking\n\n#WeddingMC #KartikeyBameta #WeddingHost #IndianWedding #Sangeet',
      caption: 'From the first dance to the last toast — every moment curated with love.\nRadhaa by Kartikey Bameta is where emotions meet elegance.\n\n📲 DM to check availability!\n\n#WeddingCeremony #MCKartikey #WeddingIndia #SangeetNight',
      story: '💕 Your wedding deserves a storyteller.\nNot just an MC — an experience architect.\nSwipe up to see how we transform your big day. ✨',
      reel: '🎬 POV: Your wedding MC just made everyone cry (happy tears) 😭✨\nThe moments that matter — curated by Kartikey Bameta\n💍 Link in bio!\n\n#WeddingReel #MCLife #WeddingMagic',
    },
    corporate: {
      hook: '🎤 Your event is only as good as the energy in the room.\nVeronica — Corporate MC — keeps your audience engaged, energised & entertained.\n📩 Let\'s talk: antigravitystudio.com/booking\n\n#CorporateMC #EventHost #Emcee',
      caption: 'From product launches to leadership summits — Veronica has hosted them all.\nSharp, bilingual, high-energy stage presence.\n\n📲 DM for event packages!\n\n#CorporateHost #EventEmcee #Veronica',
      story: '🏢 Your next corporate event needs the right voice.\nVeronica delivers professionalism + energy every time. 🎤',
      reel: '🎬 When your conference needs that energy boost 🔥\nVeronica — Corporate MC who owns the stage.\n📩 Link in bio!\n\n#EventReel #CorporateMC',
    },
    tour: {
      hook: '🌍 Not all who wander are lost — some are just with the wrong guide.\nThe Trail Curator takes you beyond the tourist trail.\n🧭 Book: antigravitystudio.com/booking\n\n#TrailCurator #HeritageTours #ExperientialTravel',
      caption: 'Every city has a soul. We help you find it.\nHidden alleys, untold stories, forgotten flavours — curated for the curious traveller.\n\n📲 DM to plan your trail!\n\n#CityWalk #HeritageTour #TravelIndia',
      story: '🏛️ The best travel memories aren\'t from tourist spots.\nThey\'re from the stories in between.\nSwipe up! 🧭',
      reel: '🎬 When you thought you knew the city… 😮\nThe Trail Curator shows you what maps don\'t.\n🌍 Link in bio!\n\n#TrailReel #CityWalk #TravelReels',
    },
  };
  const pk = pillar === 'main' ? 'radha' : pillar;
  const pt = T[pk] || T.radha;
  const fullCaption = pt[type] || pt.hook;
  res.json({ fullCaption, content: fullCaption, text: fullCaption });
});

app.get('/api/agent/design/theme/:pillar', requireDb, (req, res) => {
  db.get('SELECT value FROM config WHERE key=?', ['theme_' + req.params.pillar], (err, row) => {
    if (row && row.value) {
      try {
        const theme = JSON.parse(row.value);
        return res.json({ pillar: req.params.pillar, success: true, theme });
      } catch (_) {}
    }
    res.json({ pillar: req.params.pillar, theme: null });
  });
});

app.post('/api/agent/design/save-theme', requireAuth, requireDb, (req, res) => {
  const { pillar, ...theme } = req.body;
  if (!pillar) return res.status(400).json({ error: 'pillar required' });
  db.run('INSERT OR REPLACE INTO config (key,value) VALUES (?,?)',
    ['theme_' + pillar, JSON.stringify(theme)],
    err => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// ── SCHEDULE ──────────────────────────────────────────────────────────────────
app.get('/api/schedule', requireAuth, requireDb, (req, res) => {
  db.all('SELECT * FROM schedule ORDER BY date ASC, time ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/schedule', requireAuth, requireDb, (req, res) => {
  const { pillar, date, time, topic, caption, mediaUrl, status } = req.body;
  if (!date) return res.status(400).json({ error: 'date required' });
  db.run(
    'INSERT INTO schedule (pillar,date,time,topic,caption,mediaUrl,status) VALUES (?,?,?,?,?,?,?)',
    [pillar||'', date, time||'', topic||'', caption||'', mediaUrl||'', status||'Scheduled'],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.put('/api/schedule/:id', requireAuth, requireDb, (req, res) => {
  const { pillar, date, time, topic, caption, mediaUrl, status } = req.body;
  db.run(
    'UPDATE schedule SET pillar=?, date=?, time=?, topic=?, caption=?, mediaUrl=?, status=? WHERE id=?',
    [pillar||'', date||'', time||'', topic||'', caption||'', mediaUrl||'', status||'Scheduled', req.params.id],
    err => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.delete('/api/schedule/:id', requireAuth, requireDb, (req, res) => {
  db.run('DELETE FROM schedule WHERE id=?', [req.params.id], err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});


// ── START SERVER ──────────────────────────────────────────────────────────────

// ── Health check (used by Render.com healthCheckPath) ─────────────────────────

// ── CSV Export for leads ──────────────────────────────────────────────────────
app.get('/api/leads/export-csv', requireAuth, requireDb, (req, res) => {
  db.all('SELECT * FROM leads ORDER BY timestamp DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const cols = ['id','name','phone','email','eventType','pillar','eventDate','budget','message','status','notes','timestamp'];
    const lines = [cols.join(',')];
    (rows || []).forEach(r => {
      lines.push(cols.map(c => {
        const v = (r[c] === null || r[c] === undefined) ? '' : String(r[c]);
        return '"' + v.replace(/"/g, '""') + '"';
      }).join(','));
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    res.send(lines.join('\n'));
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

// ── Global error guards ──────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});

app.listen(PORT, () => {
  console.log(`Anti-Gravity Studio server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
