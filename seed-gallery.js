/**
 * seed-gallery.js
 * Run once: node seed-gallery.js
 * Inserts all local gallery photos + videos into the SQLite DB
 * so they appear on /api/media/public and in the gallery page.
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');

// ── Media catalogue ────────────────────────────────────────────────────────────
const GALLERY = [
  // ── Radha (sangeet / wedding / family) ──────────────────────────
  // Photos
  { url: '/assets/media/gallery/photos/FB_IMG_1682789867128.jpg',             pillar: 'radha',     type: 'image', name: 'Sangeet Celebration' },
  { url: '/assets/media/gallery/photos/FB_IMG_1682789911317.jpg',             pillar: 'radha',     type: 'image', name: 'Family Gathering' },
  { url: '/assets/media/gallery/photos/IMG-20230316-WA0027.jpg',              pillar: 'radha',     type: 'image', name: 'Wedding Moment' },
  { url: '/assets/media/gallery/photos/IMG-20230322-WA0069.jpg',              pillar: 'radha',     type: 'image', name: 'Sangeet Night' },
  { url: '/assets/media/gallery/photos/IMG20221010221048.jpg',                pillar: 'radha',     type: 'image', name: 'Celebration 2022' },
  { url: '/assets/media/gallery/photos/IMG20240814151201.jpg',                pillar: 'radha',     type: 'image', name: 'Event 2024' },
  { url: '/assets/media/gallery/photos/IMG20241117132110_BURST001.jpg',       pillar: 'radha',     type: 'image', name: 'Performance Burst' },
  { url: '/assets/media/gallery/photos/IMG20241121115211.jpg',                pillar: 'corporate', type: 'image', name: 'Corporate Event' },
  { url: '/assets/media/gallery/photos/IMG20241121115246.jpg',                pillar: 'corporate', type: 'image', name: 'Corporate Moment' },
  { url: '/assets/media/gallery/photos/IMG20260509214426.jpg',                pillar: 'radha',     type: 'image', name: 'Show 2026' },
  { url: '/assets/media/gallery/photos/IMG20260509214438.jpg',                pillar: 'radha',     type: 'image', name: 'Stage 2026' },
  { url: '/assets/media/gallery/photos/IMG_20180310_175841.jpg',              pillar: 'corporate', type: 'image', name: 'Corporate 2018' },
  { url: '/assets/media/gallery/photos/IMG_20181018_165753.jpg',              pillar: 'tour',      type: 'image', name: 'Trail 2018' },
  { url: '/assets/media/gallery/photos/IMG_20230717_115452_381.webp',         pillar: 'radha',     type: 'image', name: 'Summer Event' },
  { url: '/assets/media/gallery/photos/original_1f2f93a5-9873-4a6a-8b3d-5b42c183ab0c_IMG-20230624-WA0052.jpg', pillar: 'radha', type: 'image', name: 'Sangeet June 2023' },
  { url: '/assets/media/gallery/photos/Screenshot_2023-07-17-10-31-15-61.jpg',pillar: 'radha',     type: 'image', name: 'Performance 2023' },
  // Videos
  { url: '/assets/media/gallery/videos/VID20230422112652.mp4',  pillar: 'radha',     type: 'video', name: 'Sangeet Performance Apr 2023' },
  { url: '/assets/media/gallery/videos/VID20230425153446.mp4',  pillar: 'radha',     type: 'video', name: 'Sangeet Reel Apr 2023' },
  { url: '/assets/media/gallery/videos/VID20211120123205.mp4',  pillar: 'radha',     type: 'video', name: 'Family Event Nov 2021' },
  { url: '/assets/media/gallery/videos/VID20211120163552.mp4',  pillar: 'radha',     type: 'video', name: 'Evening Celebration 2021' },
  { url: '/assets/media/gallery/videos/VID20210920120648.mp4',  pillar: 'corporate', type: 'video', name: 'Corporate Reel Sep 2021' },
  { url: '/assets/media/gallery/videos/video_20180310_175726.mp4', pillar: 'corporate', type: 'video', name: 'Corporate Event 2018' },
  { url: '/assets/media/gallery/videos/VID20210816112816.mp4',  pillar: 'radha',     type: 'video', name: 'Performance Aug 2021' },
  { url: '/assets/media/gallery/videos/VID20260204184449.mp4',  pillar: 'corporate', type: 'video', name: 'Corporate Show 2026' },
  { url: '/assets/media/gallery/videos/VID20260506161939.mp4',  pillar: 'radha',     type: 'video', name: 'Stage Performance May 2026' },
  { url: '/assets/media/gallery/videos/VID20250220124953.mp4',  pillar: 'tour',      type: 'video', name: 'Trail Walk Feb 2025' },
  { url: '/assets/media/gallery/videos/VID20230623205127.mp4',  pillar: 'radha',     type: 'video', name: 'Evening Show Jun 2023' },
  { url: '/assets/media/gallery/videos/VID20250220123919~2.mp4',pillar: 'tour',      type: 'video', name: 'Heritage Trail Feb 2025' },
  // Radha gallery photos
  ...Array.from({length: 27}, (_, i) => ({
    url: `/assets/media/gallery/radha/radha-${String(i+1).padStart(2,'0')}.jpg`,
    pillar: 'radha', type: 'image',
    name: `Radha Gallery ${i+1}`
  })),
];

async function seed() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  let db;
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
    console.log('📂 Opened existing DB:', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('🆕 Created new DB:', DB_PATH);
  }

  // Ensure media table exists
  db.run(`CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, url TEXT, pillar TEXT, type TEXT,
    size INTEGER DEFAULT 0, originalName TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  )`);

  // Check existing
  const existing = db.exec('SELECT url FROM media');
  const existingUrls = new Set(
    existing[0]?.values?.map(r => r[0]) || []
  );

  let inserted = 0, skipped = 0;
  for (const item of GALLERY) {
    if (existingUrls.has(item.url)) { skipped++; continue; }
    db.run(
      'INSERT INTO media (name,url,pillar,type,size,originalName) VALUES (?,?,?,?,?,?)',
      [item.name, item.url, item.pillar, item.type, 0, item.name]
    );
    inserted++;
    console.log(`  ✓ ${item.pillar.padEnd(10)} ${item.type.padEnd(5)} ${item.name}`);
  }

  // Save DB
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  db.close();

  console.log(`\n✅ Done! Inserted: ${inserted}  Skipped (already existed): ${skipped}`);
  console.log('   Now run: node server.js');
}

seed().catch(e => { console.error('Seed failed:', e); process.exit(1); });
