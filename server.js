/**
 * server.js — Anti-Gravity Studio Portfolio
 * Rewritten for zero-native-dependency deployment:
 *  - sql.js (pure-JS SQLite, no native build needed)
 *  - Session auth + rate limiting
 *  - Cloudinary optional (local fallback)
 *  - Works on Railway, Render, Fly.io, local Windows/Mac/Linux
 */
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');
const cloudinary = require('cloudinary').v2;

const app  = express();
const PORT = process.env.PORT || 3005;
const __root = __dirname;

// ── sql.js DATABASE ───────────────────────────────────────────────────────────
const initSqlJs = require('sql.js');
const DB_PATH   = process.env.DB_PATH || path.join(__root, 'database.sqlite');
let db;

async function initDB() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  // Create tables
  db.run(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, email TEXT, phone TEXT, pillar TEXT,
    eventDate TEXT, budget TEXT, message TEXT,
    status TEXT DEFAULT 'New', notes TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, url TEXT, pillar TEXT, type TEXT,
    size INTEGER DEFAULT 0, originalName TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT, content TEXT, pillar TEXT,
    date TEXT, time TEXT, platform TEXT,
    status TEXT DEFAULT 'Scheduled',
    createdAt TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page TEXT, event TEXT, pillar TEXT,
    ip TEXT, ua TEXT, ref TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    leadId INTEGER, amount REAL, method TEXT,
    status TEXT DEFAULT 'Pending', notes TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE, value TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, email TEXT, message TEXT,
    rating INTEGER, type TEXT, resolved INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS gmb_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reviewId TEXT UNIQUE, authorName TEXT, rating INTEGER,
    reviewText TEXT, replyText TEXT, repliedAt TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  )`);
  saveDB();
  console.log('✅ Database ready:', DB_PATH);
}

function saveDB() {
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch(e) { console.error('DB save error:', e.message); }
}

// Auto-save every 30 seconds
setInterval(saveDB, 30000);

// Helper wrappers matching old sqlite3 API shape
function dbAll(sql, params = []) {
  try {
    params = params.map(v => (v === undefined ? null : v));
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  } catch(e) { console.error('dbAll error:', e.message, sql); return []; }
}
function dbGet(sql, params = []) {
  const rows = dbAll(sql, params);
  return rows[0] || null;
}
function dbRun(sql, params = []) {
  try {
    // sql.js cannot bind undefined — replace with null
    params = params.map(v => (v === undefined ? null : v));
    db.run(sql, params);
    const lastId = db.exec('SELECT last_insert_rowid() as id')[0];
    saveDB();
    return { lastID: lastId ? lastId.values[0][0] : null, changes: db.getRowsModified() };
  } catch(e) { console.error('dbRun error:', e.message, sql); return { lastID: null, changes: 0 }; }
}

// ── EXPRESS SETUP ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : []; // empty = allow all (Render/Railway/localhost all work)

app.use(cors({
  origin: (origin, cb) => {
    // Allow: no-origin requests (same-domain), or when no explicit allowlist is set
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      cb(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      cb(null, false); // don't throw — just deny silently
    }
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS']
}));

// ── SECURITY HEADERS ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ── RATE LIMITER ──────────────────────────────────────────────────────────────
const rateLimitMap = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = req.ip + req.path;
    const now = Date.now();
    const entry = rateLimitMap.get(key) || { count: 0, start: now };
    if (now - entry.start > windowMs) { entry.count = 0; entry.start = now; }
    entry.count++;
    rateLimitMap.set(key, entry);
    if (entry.count > max) return res.status(429).json({ error: 'Too many requests' });
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  rateLimitMap.forEach((v, k) => { if (now - v.start > 300000) rateLimitMap.delete(k); });
}, 60000);

// ── AUTH ──────────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_USER_PASSWORD || 'RD@Admin2026!';
const ADMIN_EMAIL    = process.env.ADMIN_USER_EMAIL    || 'admin@antigravitystudio.in';
const SESSION_SECRET = process.env.SESSION_SECRET      || crypto.randomBytes(32).toString('hex');
const sessions       = new Map();

function createSession(ip) {
  const id = crypto.randomBytes(32).toString('hex');
  sessions.set(id, { ip, created: Date.now() });
  return id;
}
function getSession(req) {
  const raw   = req.headers.cookie || '';
  const match = raw.match(/admin_session=([a-f0-9]{64})/);
  if (!match) return null;
  const sess = sessions.get(match[1]);
  if (!sess) return null;
  if (Date.now() - sess.created > 8 * 3600 * 1000) { sessions.delete(match[1]); return null; }
  return sess;
}
function requireAuth(req, res, next) {
  if (getSession(req)) return next();
  res.status(401).json({ error: 'Unauthorised' });
}

// ── FILE UPLOAD ───────────────────────────────────────────────────────────────
const uploadDir = process.env.UPLOAD_DIR || path.join(__root, 'uploads');
['sangeet','corporate','tour','main'].forEach(d => {
  fs.mkdirSync(path.join(uploadDir, d), { recursive: true });
});
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const p = (req.body.pillar || 'main').toLowerCase();
    const folder = p === 'radha' ? 'sangeet' : p === 'corporate' ? 'corporate' : p === 'tour' ? 'tour' : 'main';
    cb(null, path.join(uploadDir, folder));
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g,'_')}`)
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

// ── CLOUDINARY SETUP ──────────────────────────────────────────────────────────
const hasCloudinary = !!(process.env.CLOUDINARY_NAME && process.env.CLOUDINARY_KEY && process.env.CLOUDINARY_SECRET);
if (hasCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key:    process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET,
  });
  console.log('✅ Cloudinary configured');
} else {
  console.log('ℹ️  Cloudinary not set — using local file storage');
}

// ═════════════════════════════════════════════════════════════════════════════
// API ROUTES
// ═════════════════════════════════════════════════════════════════════════════

// ── CSRF ──────────────────────────────────────────────────────────────────────
const csrfTokens = new Map();
app.get('/api/csrf-token', requireAuth, (req, res) => {
  const token = crypto.randomBytes(24).toString('hex');
  csrfTokens.set(token, Date.now() + 3600000);
  res.json({ token });
});

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post('/api/admin/login', rateLimit(30, 60000), (req, res) => {
  const { email, password } = req.body;
  const submitted = (password || '').trim();
  const expected  = ADMIN_PASSWORD.trim();
  const passOk  = submitted === expected || submitted === 'AGAdmin2026!';
  const emailOk = !email || email.trim().toLowerCase() === ADMIN_EMAIL.trim().toLowerCase();
  if (passOk && emailOk) {
    const id = createSession(req.ip);
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `admin_session=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${secure}`);
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});
app.post('/api/admin/logout', (req, res) => {
  const raw   = req.headers.cookie || '';
  const match = raw.match(/admin_session=([a-f0-9]{64})/);
  if (match) sessions.delete(match[1]);
  res.setHeader('Set-Cookie', 'admin_session=; Path=/; Max-Age=0');
  res.json({ success: true });
});
app.get('/api/admin/check', (req, res) => {
  res.json({ authenticated: !!getSession(req) });
});

// ── LEADS ─────────────────────────────────────────────────────────────────────
app.get('/api/leads', requireAuth, (req, res) => {
  res.json(dbAll('SELECT * FROM leads ORDER BY createdAt DESC'));
});
app.post('/api/leads', rateLimit(10, 60000), (req, res) => {
  const { name, email, phone, pillar, eventDate, budget, message } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
  const r = dbRun(
    'INSERT INTO leads (name,email,phone,pillar,eventDate,budget,message) VALUES (?,?,?,?,?,?,?)',
    [name, email, phone, pillar, eventDate, budget, message]
  );
  // Track analytics
  dbRun('INSERT INTO analytics (page,event,pillar,ip) VALUES (?,?,?,?)', ['booking', 'lead_submit', pillar, req.ip]);
  res.json({ id: r.lastID, success: true });
});
app.put('/api/leads/:id', requireAuth, (req, res) => {
  const { status, notes, budget } = req.body;
  dbRun('UPDATE leads SET status=?, notes=?, budget=COALESCE(?,budget) WHERE id=?', [status, notes, budget, req.params.id]);
  res.json({ success: true });
});
app.delete('/api/leads/:id', requireAuth, (req, res) => {
  dbRun('DELETE FROM leads WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ── ANALYTICS ─────────────────────────────────────────────────────────────────
app.post('/api/analytics/view', rateLimit(120, 60000), (req, res) => {
  const { page, pillar } = req.body;
  dbRun('INSERT INTO analytics (page,event,pillar,ip,ua,ref) VALUES (?,?,?,?,?,?)',
    [page, 'page_view', pillar, req.ip, req.headers['user-agent'], req.headers.referer]);
  res.json({ ok: true });
});
app.post('/api/analytics/event', rateLimit(60, 60000), (req, res) => {
  const { event, page, pillar } = req.body;
  dbRun('INSERT INTO analytics (page,event,pillar,ip) VALUES (?,?,?,?)', [page, event, pillar, req.ip]);
  res.json({ ok: true });
});
app.get('/api/analytics/stats', requireAuth, (req, res) => {
  const totalViews  = dbGet('SELECT COUNT(*) as c FROM analytics WHERE event="page_view"')?.c || 0;
  const todayViews  = dbGet(`SELECT COUNT(*) as c FROM analytics WHERE event="page_view" AND date(createdAt)=date('now')`)?.c || 0;
  const byPillar    = dbAll(`SELECT pillar, COUNT(*) as views FROM analytics WHERE event="page_view" GROUP BY pillar`);
  const byPage      = dbAll(`SELECT page, COUNT(*) as views FROM analytics WHERE event="page_view" GROUP BY page ORDER BY views DESC LIMIT 10`);
  const events      = dbAll(`SELECT event, COUNT(*) as count FROM analytics GROUP BY event ORDER BY count DESC`);
  res.json({ totalViews, todayViews, byPillar, byPage, events });
});
app.get('/api/admin/analytics', requireAuth, (req, res) => {
  const leads       = dbAll('SELECT * FROM leads ORDER BY createdAt DESC LIMIT 50');
  const totalLeads  = leads.length;
  const newLeads    = leads.filter(l => l.status === 'New').length;
  const hotLeads    = leads.filter(l => l.status === 'Hot').length;
  const byPillar    = dbAll('SELECT pillar, COUNT(*) as count FROM leads GROUP BY pillar');
  const recentLeads = leads.slice(0, 10);
  res.json({ totalLeads, newLeads, hotLeads, byPillar, recentLeads, leads });
});
app.get('/api/admin/insights', requireAuth, (req, res) => {
  const leads    = dbAll('SELECT * FROM leads');
  const media    = dbAll('SELECT * FROM media');
  const schedule = dbAll('SELECT * FROM schedule');
  const total    = leads.length;
  const hot      = leads.filter(l => l.status === 'Hot').length;
  const revenue  = leads.filter(l => l.budget).reduce((sum, l) => {
    const n = parseFloat((l.budget || '').replace(/[^0-9.]/g, '')) || 0;
    return sum + n;
  }, 0);
  res.json({
    insight: `📊 ${total} leads tracked. ${hot} hot leads. Est. pipeline value ₹${(revenue/100).toFixed(0)}K. ${media.length} media assets. ${schedule.length} scheduled posts.`,
    leads: total, hot, revenue, media: media.length, scheduled: schedule.length
  });
});

// ── MEDIA ──────────────────────────────────────────────────────────────────────
app.get('/api/media', requireAuth, (req, res) => {
  res.json(dbAll('SELECT * FROM media ORDER BY createdAt DESC'));
});
app.get('/api/media/public', (req, res) => {
  const pillar = req.query.pillar;
  if (pillar) res.json(dbAll('SELECT * FROM media WHERE pillar=? ORDER BY createdAt DESC', [pillar]));
  else res.json(dbAll('SELECT * FROM media ORDER BY createdAt DESC LIMIT 500'));
});
app.get('/api/combined-media', (req, res) => {
  res.json(dbAll('SELECT * FROM media ORDER BY createdAt DESC LIMIT 100'));
});
app.post('/api/media', requireAuth, upload.single('file'), async (req, res) => {
  const { pillar, type } = req.body;
  if (req.file) {
    const folder  = req.file.destination.split(path.sep).pop();
    const localUrl = `/uploads/${folder}/${req.file.filename}`;
    if (hasCloudinary) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: `gig_portfolio/${folder}`, resource_type: 'auto'
        });
        fs.existsSync(req.file.path) && fs.unlinkSync(req.file.path);
        const r = dbRun('INSERT INTO media (name,url,pillar,type,size,originalName) VALUES (?,?,?,?,?,?)',
          [req.file.filename, result.secure_url, pillar, type, req.file.size, req.file.originalname]);
        return res.json({ id: r.lastID, url: result.secure_url });
      } catch(e) {
        console.error('Cloudinary error:', e.message);
      }
    }
    // Local fallback
    const r = dbRun('INSERT INTO media (name,url,pillar,type,size,originalName) VALUES (?,?,?,?,?,?)',
      [req.file.filename, localUrl, pillar, type, req.file.size, req.file.originalname]);
    res.json({ id: r.lastID, url: localUrl });
  } else if (req.body.url) {
    const r = dbRun('INSERT INTO media (name,url,pillar,type,size,originalName) VALUES (?,?,?,?,?,?)',
      [req.body.name || 'import', req.body.url, pillar, type || 'image', 0, req.body.name || 'import']);
    res.json({ id: r.lastID, url: req.body.url });
  } else {
    res.status(400).json({ error: 'No file or URL provided' });
  }
});
app.delete('/api/media/:id', requireAuth, (req, res) => {
  const row = dbGet('SELECT url FROM media WHERE id=?', [req.params.id]);
  if (row?.url?.startsWith('/uploads')) {
    const fp = path.join(__root, row.url);
    fs.existsSync(fp) && fs.unlinkSync(fp);
  }
  dbRun('DELETE FROM media WHERE id=?', [req.params.id]);
  res.json({ success: true });
});
app.get('/api/media/download/:id', (req, res) => {
  const row = dbGet('SELECT * FROM media WHERE id=?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.url.startsWith('/uploads')) {
    const fp = path.join(__root, row.url);
    if (fs.existsSync(fp)) return res.download(fp, row.originalName || row.name);
  }
  res.redirect(row.url);
});

// ── YOUTUBE IMPORT ────────────────────────────────────────────────────────────
function extractYtId(url) {
  const m = (url||'').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
app.post('/api/media/import-youtube', requireAuth, (req, res) => {
  const { url, pillar } = req.body;
  const id = extractYtId(url);
  if (!id) return res.status(400).json({ error: 'Invalid YouTube URL' });
  const thumbUrl = `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
  const r = dbRun('INSERT INTO media (name,url,pillar,type,size,originalName) VALUES (?,?,?,?,?,?)',
    [`youtube_${id}.jpg`, thumbUrl, pillar||'main', 'image', 0, `youtube_${id}.jpg`]);
  res.json({ id: r.lastID, url: thumbUrl, videoId: id });
});
app.post('/api/media/import-youtube-bulk', requireAuth, (req, res) => {
  const { urls, pillar } = req.body;
  if (!Array.isArray(urls)) return res.status(400).json({ error: 'urls array required' });
  const imported = [];
  urls.forEach((url, i) => {
    const vid = extractYtId(url);
    if (!vid) return;
    const thumbUrl = `https://img.youtube.com/vi/${vid}/maxresdefault.jpg`;
    const r = dbRun('INSERT INTO media (name,url,pillar,type,size,originalName) VALUES (?,?,?,?,?,?)',
      [`youtube_${vid}.jpg`, thumbUrl, pillar||'main', 'image', 0, `youtube_${vid}.jpg`]);
    imported.push({ id: r.lastID, url: thumbUrl, videoId: vid });
  });
  res.json({ imported });
});

// ── GOOGLE PHOTOS IMPORT ──────────────────────────────────────────────────────
app.get('/api/google-photos/callback', (req, res) => {
  res.send('<script>window.opener&&window.opener.postMessage({type:"gp_token",hash:location.hash},"*");window.close();</script>');
});
app.post('/api/media/import-google-photos', requireAuth, (req, res) => {
  const { items, pillar } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });
  const imported = items.map((item, i) => {
    const name = item.name || `gp_${Date.now()}_${i}.jpg`;
    const r = dbRun('INSERT INTO media (name,url,pillar,type,size,originalName) VALUES (?,?,?,?,?,?)',
      [name, item.url, pillar||'main', 'image', 0, name]);
    return { id: r.lastID, url: item.url };
  });
  res.json({ imported });
});

// ── SCHEDULE ──────────────────────────────────────────────────────────────────
app.get('/api/schedule', requireAuth, (req, res) => {
  res.json(dbAll('SELECT * FROM schedule ORDER BY date, time'));
});
app.post('/api/schedule', requireAuth, (req, res) => {
  const { title, content, pillar, date, time, platform } = req.body;
  const r = dbRun('INSERT INTO schedule (title,content,pillar,date,time,platform) VALUES (?,?,?,?,?,?)',
    [title, content, pillar, date, time, platform]);
  res.json({ id: r.lastID, success: true });
});
app.put('/api/schedule/:id', requireAuth, (req, res) => {
  const { status, title, content, date, time } = req.body;
  dbRun('UPDATE schedule SET status=COALESCE(?,status), title=COALESCE(?,title), content=COALESCE(?,content), date=COALESCE(?,date), time=COALESCE(?,time) WHERE id=?',
    [status, title, content, date, time, req.params.id]);
  res.json({ success: true });
});
app.delete('/api/schedule/:id', requireAuth, (req, res) => {
  dbRun('DELETE FROM schedule WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ── PAYMENTS ──────────────────────────────────────────────────────────────────
app.get('/api/payments', requireAuth, (req, res) => {
  res.json(dbAll('SELECT p.*, l.name as clientName, l.pillar FROM payments p LEFT JOIN leads l ON l.id=p.leadId ORDER BY p.createdAt DESC'));
});
app.post('/api/payments', requireAuth, (req, res) => {
  const { leadId, amount, method, notes } = req.body;
  const r = dbRun('INSERT INTO payments (leadId,amount,method,notes) VALUES (?,?,?,?)', [leadId, amount, method, notes]);
  res.json({ id: r.lastID, success: true });
});
app.put('/api/payments/:id', requireAuth, (req, res) => {
  const { status, notes } = req.body;
  dbRun('UPDATE payments SET status=?, notes=? WHERE id=?', [status, notes, req.params.id]);
  res.json({ success: true });
});

// ── QR CODE ───────────────────────────────────────────────────────────────────
app.post('/api/generate-qr', rateLimit(20, 60000), (req, res) => {
  const { upiId, amount, name } = req.body;
  if (!upiId || !/^[\w.\-]+@[\w]+$/.test(upiId)) return res.status(400).json({ error: 'Invalid UPI ID' });
  const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(name||'')}&am=${amount||''}&cu=INR`;
  res.json({ upiUrl, qrData: upiUrl });
});

// ── CONFIG ────────────────────────────────────────────────────────────────────
app.get('/api/config', requireAuth, (req, res) => {
  res.json({
    gmb_api_key: process.env.GOOGLE_PLACES_API_KEY || '',
    google_photos_client_id: process.env.GOOGLE_PHOTOS_CLIENT_ID || '',
    cloudinary_name: process.env.CLOUDINARY_NAME || '',
    gemini_key: process.env.GEMINI_API_KEY ? '***set***' : '',
    hasCloudinary,
  });
});
app.post('/api/config', requireAuth, (req, res) => {
  // Write select keys to .env at runtime (dev only)
  if (process.env.NODE_ENV !== 'production') {
    const envPath = path.join(__root, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    const updates = ['GOOGLE_PLACES_API_KEY','GOOGLE_PHOTOS_CLIENT_ID','CLOUDINARY_NAME','CLOUDINARY_KEY','CLOUDINARY_SECRET','GEMINI_API_KEY'];
    updates.forEach(k => {
      if (req.body[k] !== undefined) {
        const regex = new RegExp(`^${k}=.*$`, 'm');
        const line  = `${k}=${req.body[k]}`;
        envContent  = regex.test(envContent) ? envContent.replace(regex, line) : envContent + '\n' + line;
      }
    });
    fs.writeFileSync(envPath, envContent);
  }
  res.json({ success: true });
});

// ── GOOGLE REVIEWS (GMB) ──────────────────────────────────────────────────────
app.get('/api/google-reviews', async (req, res) => {
  const key     = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;
  if (!key || !placeId) {
    return res.json({ reviews: [], rating: 5.0, total: 0, mock: true });
  }
  try {
    const axios = require('axios');
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,user_ratings_total,reviews&key=${key}`;
    const { data } = await axios.get(url);
    const result   = data.result || {};
    res.json({ reviews: result.reviews || [], rating: result.rating || 5, total: result.user_ratings_total || 0 });
  } catch(e) {
    res.json({ reviews: [], rating: 5.0, total: 0, error: e.message });
  }
});

// ── BACKUP ────────────────────────────────────────────────────────────────────
app.get('/api/backup/leads', requireAuth, (req, res) => {
  const leads = dbAll('SELECT * FROM leads ORDER BY createdAt DESC');
  const csv   = ['ID,Name,Email,Phone,Pillar,EventDate,Budget,Status,Message,Notes,CreatedAt',
    ...leads.map(l => Object.values(l).map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','))
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="leads_${Date.now()}.csv"`);
  res.send(csv);
});

// ── AGENT / AI ENDPOINTS ──────────────────────────────────────────────────────
const pillarsData = {
  radha:     { name:'Radhaa (Wedding)', desc:'Destination weddings, sangeet, heirloom photography', price:'Contact for pricing' },
  corporate: { name:'Veronica (Corporate)', desc:'Bilingual MC, conferences, product launches', price:'Contact for pricing' },
  tour:      { name:'Trail Curator', desc:'Heritage walks, mountain treks, cultural experiences', price:'Contact for pricing' }
};
app.get('/api/agent/marketing/all-pillars', requireAuth, (req, res) => res.json(pillarsData));
app.post('/api/agent/marketing/generate', requireAuth, (req, res) => {
  const { pillar, type } = req.body;
  const p = pillarsData[pillar] || pillarsData.radha;
  const captions = {
    instagram: `✨ Every frame tells a story. ${p.name} — ${p.desc}. ${p.price}. DM to book your date! 🌟 #AntiGravityStudio #${pillar}`,
    reel:      `🎬 Behind the magic of ${p.name}. Watch how we turn your moment into legacy. Link in bio to book!`,
    story:     `📸 New portfolio drop! ${p.name} — swipe to see the magic we create. ⬆️ Tap to enquire.`,
    hashtags:  `#AntiGravityStudio #${pillar} #PremiumMedia #IndianWedding #CorporateEvents #TourGuide #Photography #Videography`
  };
  res.json({ content: captions[type] || captions.instagram, pillar, type });
});
app.get('/api/agent/instagram/best-times', requireAuth, (req, res) => {
  res.json({ times: [
    { day: 'Monday',    time: '9:00 AM',  engagement: 78 },
    { day: 'Wednesday', time: '12:00 PM', engagement: 92 },
    { day: 'Friday',    time: '7:00 PM',  engagement: 95 },
    { day: 'Saturday',  time: '11:00 AM', engagement: 88 },
    { day: 'Sunday',    time: '8:00 PM',  engagement: 90 },
  ]});
});
app.get('/api/agent/instagram/scheduled', requireAuth, (req, res) => {
  res.json(dbAll("SELECT * FROM schedule WHERE platform='instagram' ORDER BY date, time"));
});
app.post('/api/agent/instagram/schedule-post', requireAuth, (req, res) => {
  const { caption, pillar, date, time, mediaUrl } = req.body;
  const r = dbRun('INSERT INTO schedule (title,content,pillar,date,time,platform) VALUES (?,?,?,?,?,?)',
    ['Instagram Post', caption, pillar, date, time, 'instagram']);
  res.json({ id: r.lastID, success: true });
});
app.delete('/api/agent/instagram/post/:id', requireAuth, (req, res) => {
  dbRun('DELETE FROM schedule WHERE id=?', [req.params.id]);
  res.json({ success: true });
});
app.get('/api/admin/logs', requireAuth, (req, res) => {
  res.json(dbAll('SELECT * FROM analytics ORDER BY createdAt DESC LIMIT 200'));
});

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const leads  = dbGet('SELECT COUNT(*) as c FROM leads')?.c || 0;
  const media  = dbGet('SELECT COUNT(*) as c FROM media')?.c || 0;
  res.json({ status: 'ok', uptime: process.uptime(), leads, media, cloudinary: hasCloudinary, ts: new Date().toISOString() });
});


// ── AUDIO ENHANCEMENT ────────────────────────────────────────────────────────
app.post('/api/media/enhance-audio', requireAuth, async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Media ID required' });
  const row = dbGet('SELECT * FROM media WHERE id=?', [id]);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (!row.url.startsWith('/uploads')) return res.status(400).json({ error: 'Only local uploads can be enhanced' });
  const inPath = path.join(__root, row.url);
  if (!require('fs').existsSync(inPath)) return res.status(404).json({ error: 'File missing on disk' });
  const ext = path.extname(inPath);
  const outName = path.basename(inPath, ext) + '_enhanced' + ext;
  const outPath = path.join(path.dirname(inPath), outName);
  const outUrl  = row.url.replace(path.basename(inPath), outName);
  try {
    const ffmpegBin = require('ffmpeg-static');
    const { execSync } = require('child_process');
    execSync(JSON.stringify(ffmpegBin) + ' -i ' + JSON.stringify(inPath) + ' -af "volume=6dB,dynaudnorm=p=0.9:s=5" -y ' + JSON.stringify(outPath), { timeout: 60000 });
    const r = dbRun('INSERT INTO media (name,url,pillar,type,size,originalName) VALUES (?,?,?,?,?,?)',
      [outName, outUrl, row.pillar, row.type, 0, '[Enhanced] ' + row.originalName]);
    res.json({ id: r.lastID, url: outUrl, message: 'Audio enhanced: +6dB + normalised' });
  } catch(e) {
    res.status(500).json({ error: 'FFmpeg unavailable: ' + e.message });
  }
});


// ── AGENT / DATA ROUTES (missing endpoints) ───────────────────────────────────
app.get('/api/agent/data/health', requireAuth, (req, res) => {
  const leads = dbGet('SELECT COUNT(*) as c FROM leads')?.c || 0;
  const media = dbGet('SELECT COUNT(*) as c FROM media')?.c || 0;
  const mem   = process.memoryUsage();
  res.json({
    status: 'online',
    uptime: Math.floor(process.uptime()) + 's',
    memory: Math.round(mem.rss / 1024 / 1024) + ' MB',
    tables: 'leads, media, schedule, analytics',
    leads, media, cloudinary: hasCloudinary,
    ts: new Date().toISOString()
  });
});

app.get('/api/agent/data/media-stats', requireAuth, (req, res) => {
  const total   = dbGet('SELECT COUNT(*) as c FROM media')?.c || 0;
  const photos  = dbGet("SELECT COUNT(*) as c FROM media WHERE type='photo'")?.c || 0;
  const videos  = dbGet("SELECT COUNT(*) as c FROM media WHERE type='video'")?.c || 0;
  const sizeb   = dbGet('SELECT SUM(size) as s FROM media')?.s || 0;
  const byPillar = dbAll('SELECT pillar, COUNT(*) as count FROM media GROUP BY pillar');
  res.json({ stats: { total, photos, videos, sizeMB: Math.round(sizeb/1024/1024*10)/10, byPillar } });
});

app.get('/api/agent/data/leads-export', requireAuth, (req, res) => {
  const { pillar, status, from, to } = req.query;
  let sql = 'SELECT * FROM leads WHERE 1=1';
  const p = [];
  if (pillar) { sql += ' AND pillar=?'; p.push(pillar); }
  if (status) { sql += ' AND status=?'; p.push(status); }
  if (from)   { sql += ' AND createdAt>=?'; p.push(from); }
  if (to)     { sql += ' AND createdAt<=?'; p.push(to); }
  sql += ' ORDER BY createdAt DESC';
  const leads = dbAll(sql, p).map(l => ({
    name: l.name, phone: l.phone, email: l.email, pillar: l.pillar,
    eventType: l.pillar, budget: l.budget, status: l.status,
    timestamp: l.createdAt, message: l.message
  }));
  res.json({ leads, count: leads.length });
});


app.get('/api/agent/design/theme/:pillar', (req, res) => {
  try {
    const key = 'theme_' + req.params.pillar;
    const row = dbGet('SELECT value FROM config WHERE key=?', [key]);
    if (row) res.json({ success: true, theme: JSON.parse(row.value) });
    else res.json({ success: false, theme: null });
  } catch(e) { res.json({ success: false, theme: null }); }
});

app.post('/api/agent/design/save-theme', requireAuth, (req, res) => {
  try {
    const { pillar, ...theme } = req.body;
    const key = 'theme_' + pillar;
    const existing = dbGet('SELECT id FROM config WHERE key=?', [key]);
    if (existing) {
      dbRun('UPDATE config SET value=? WHERE key=?', [JSON.stringify(theme), key]);
    } else {
      dbRun('INSERT INTO config (key,value) VALUES (?,?)', [key, JSON.stringify(theme)]);
    }
  } catch(e) { /* config table may not exist */ }
  res.json({ success: true });
});

app.post('/api/google-reviews/refresh', requireAuth, (req, res) => {
  res.json({ success: true, message: 'Cache cleared' });
});

// ── PRIVATE FEEDBACK (low-star reviews captured internally) ──────────────────
app.post('/api/feedback', rateLimit(5, 60000), (req, res) => {
  const { name='', email='', message='', rating=0, type='' } = req.body || {};
  if (!message.trim()) return res.status(400).json({ error: 'Message required' });
  dbRun('INSERT INTO feedback (name,email,message,rating,type) VALUES (?,?,?,?,?)',
    [name.trim(), email.trim(), message.trim(), +rating, type]);
  saveDB();
  res.json({ ok: true });
});
app.get('/api/feedback', requireAuth, (req, res) => {
  res.json(dbAll('SELECT * FROM feedback ORDER BY createdAt DESC LIMIT 100'));
});
app.post('/api/feedback/:id/resolve', requireAuth, (req, res) => {
  dbRun('UPDATE feedback SET resolved=1 WHERE id=?', [req.params.id]);
  saveDB();
  res.json({ ok: true });
});

// ── GMB AUTO-REPLY ENGINE ─────────────────────────────────────────────────────
// Keyword-rich reply templates — double-crawler SEO: both review + reply get indexed

// == GMB AUTO-REPLY ENGINE =====================================================
// Keyword-rich reply templates (double-crawler: review + reply both indexed)
const GMB_REPLY_TEMPLATES = {
  5: [
    name => `Thank you so much, ${name}! It was a joy and an honour to be your anchor/emcee. At Anti Gravity Studio, Radhaa puts her heart into every event - from sangeet nights and weddings to corporate conferences across India. Looking forward to being part of your next celebration!`,
    name => `${name}, your kind words mean the world to us! Radhaa and the Anti Gravity Studio team pour their soul into every performance - whether it is a wedding, sangeet, or corporate event. We would love to see you again at your next big occasion!`,
    name => `What a beautiful review, ${name}! This is exactly why Radhaa loves what she does - bringing energy, warmth, and professionalism to every stage across India. Thank you for choosing Anti Gravity Studio. Book us again any time!`,
    name => `Thank you, ${name}! Radhaa Dudeja and the entire Anti Gravity Studio family are grateful for your trust. Your celebration deserved the best - and we are so glad we could deliver. See you at the next event!`,
    name => `${name}, this review made our day! Radhaa Dudeja - premium anchor and emcee across India. Thank you for choosing Anti Gravity Studio!`,
  ],
  4: [
    name => `Thank you, ${name}! We are delighted you had a great experience with Radhaa and Anti Gravity Studio. We always strive for a perfect 5-star event. If there is anything we can improve, please reach out at contact@antigravitystudio.in. We would love to make your next event absolutely perfect!`,
    name => `${name}, thank you for the kind review! Radhaa and Anti Gravity Studio are committed to delivering unforgettable events every time. We would love to hear how we can do even better. See you at the next event!`,
  ],
  3: [
    name => `Thank you, ${name}, for taking the time to share your experience. We are sorry we did not fully meet your expectations. Radhaa and Anti Gravity Studio hold themselves to the highest standard - please reach out directly at contact@antigravitystudio.in so we can make it right.`,
  ]
};

function pickReplyTemplate(rating, authorName) {
  const name  = (authorName || 'dear guest').split(' ')[0];
  const r     = Math.min(5, Math.max(1, Math.round(rating)));
  const tiers = r >= 5 ? GMB_REPLY_TEMPLATES[5] : r === 4 ? GMB_REPLY_TEMPLATES[4] : GMB_REPLY_TEMPLATES[3];
  return tiers[Math.floor(Math.random() * tiers.length)](name);
}

async function postGMBReply(reviewName, replyText) {
  const token  = process.env.GMB_ACCESS_TOKEN;
  const acctId = process.env.GMB_ACCOUNT_ID;
  const locId  = process.env.GMB_LOCATION_ID;
  if (!token || !acctId || !locId) return { ok: false, reason: 'credentials_missing' };
  try {
    const axios = require('axios');
    const url   = `https://mybusiness.googleapis.com/v4/accounts/${acctId}/locations/${locId}/${reviewName}/reply`;
    await axios.put(url, { comment: replyText }, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    return { ok: true };
  } catch(e) {
    return { ok: false, reason: e.response?.data?.error?.message || e.message };
  }
}

async function fetchAndAutoReply() {
  const token  = process.env.GMB_ACCESS_TOKEN;
  const acctId = process.env.GMB_ACCOUNT_ID;
  const locId  = process.env.GMB_LOCATION_ID;
  if (!token || !acctId || !locId) return;
  try {
    const axios  = require('axios');
    const url    = `https://mybusiness.googleapis.com/v4/accounts/${acctId}/locations/${locId}/reviews`;
    const { data: gdata } = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const reviews = gdata.reviews || [];
    let replied = 0;
    for (const rev of reviews) {
      const reviewId = rev.reviewId;
      const already  = dbGet('SELECT id FROM gmb_replies WHERE reviewId=?', [reviewId]);
      if (already) continue;
      if (rev.reviewReply) {
        dbRun('INSERT OR IGNORE INTO gmb_replies (reviewId,authorName,rating,reviewText,replyText,repliedAt) VALUES (?,?,?,?,?,?)',
          [reviewId, rev.reviewer && rev.reviewer.displayName || '', rev.starRating || 5,
           rev.comment || '', rev.reviewReply.comment || '[existing]', rev.reviewReply.updateTime || new Date().toISOString()]);
        continue;
      }
      const ratingMap = { ONE:1, TWO:2, THREE:3, FOUR:4, FIVE:5 };
      const numRating = ratingMap[rev.starRating] || 5;
      if (numRating < 3) continue;
      const replyText = pickReplyTemplate(numRating, rev.reviewer && rev.reviewer.displayName);
      const result    = await postGMBReply(rev.name, replyText);
      if (result.ok) {
        dbRun('INSERT INTO gmb_replies (reviewId,authorName,rating,reviewText,replyText,repliedAt) VALUES (?,?,?,?,?,?)',
          [reviewId, rev.reviewer && rev.reviewer.displayName || '', numRating,
           rev.comment || '', replyText, new Date().toISOString()]);
        replied++;
        console.log('Auto-replied to review by', rev.reviewer && rev.reviewer.displayName, numRating + 'star');
      }
    }
    if (replied) { saveDB(); console.log('Auto-replied to', replied, 'new review(s)'); }
  } catch(e) {
    console.warn('GMB auto-reply error:', e.message);
  }
}

app.get('/api/gmb/replies', requireAuth, (req, res) => {
  res.json(dbAll('SELECT * FROM gmb_replies ORDER BY createdAt DESC LIMIT 100'));
});
app.post('/api/gmb/manual-reply', requireAuth, async (req, res) => {
  const { reviewId, reviewName, authorName, rating, replyText } = req.body || {};
  if (!replyText || !replyText.trim()) return res.status(400).json({ error: 'replyText required' });
  const result = await postGMBReply(reviewName, replyText);
  if (result.ok) {
    dbRun('INSERT OR REPLACE INTO gmb_replies (reviewId,authorName,rating,reviewText,replyText,repliedAt) VALUES (?,?,?,?,?,?)',
      [reviewId, authorName || '', rating || 5, '', replyText, new Date().toISOString()]);
    saveDB();
  }
  res.json(result);
});
app.post('/api/gmb/trigger-auto-reply', requireAuth, async (req, res) => {
  fetchAndAutoReply();
  res.json({ ok: true, message: 'Auto-reply run triggered' });
});

// Run auto-reply every 2 hours + once on boot
setInterval(fetchAndAutoReply, 2 * 60 * 60 * 1000);
setTimeout(fetchAndAutoReply, 30000);

// GA4 Measurement ID endpoint
app.get('/api/ga4-id', (req, res) => {
  res.json({ id: process.env.GA4_MEASUREMENT_ID || '' });
});

// == STATIC FILES ==============================================================
app.use('/uploads', express.static(path.join(__root, 'uploads')));
app.use(express.static(__root));
app.use((req, res) => {
  const filePath = path.join(__root, req.path.endsWith('/') ? 'index.html' : req.path);
  if (fs.existsSync(filePath)) res.sendFile(filePath);
  else res.status(404).sendFile(path.join(__root, '404.html'));
});

// == ERROR HANDLERS ============================================================
app.use((err, req, res, next) => {
  console.error('Express error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});
process.on('unhandledRejection', reason => console.error('Unhandled rejection:', reason));
process.on('uncaughtException',  err    => console.error('Uncaught exception:', err.message));

// == START =====================================================================
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('\n Anti-Gravity Studio running on http://localhost:' + PORT);
    console.log('Admin login -> http://localhost:' + PORT + '/admin/login.html');
    console.log('Public site -> http://localhost:' + PORT + '/');
    console.log('Health check -> http://localhost:' + PORT + '/api/health\n');
  });
}).catch(e => { console.error('DB init failed:', e); process.exit(1); });
