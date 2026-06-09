#!/usr/bin/env node
/**
 * inject-media.js — Seeds all gallery photos into the Anti-Gravity Studio database
 * Run ONCE with:  node inject-media.js
 * Works alongside the running server (safe to run while server is up)
 */

const path = require('path');
const fs   = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');

// ── Try sql.js first (matches server), fallback to better-sqlite3 ─────────────
let db;
try {
  const initSqlJs = require('sql.js');
  initSqlJs().then(SQL => {
    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }
    run(db, (updatedDb) => {
      const data = updatedDb.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
      console.log('\n✅  Database saved to', DB_PATH);
    });
  });
} catch(e) {
  console.error('sql.js not found, trying better-sqlite3...');
  try {
    const Database = require('better-sqlite3');
    db = new Database(DB_PATH);
    runSync(db);
  } catch(e2) {
    console.error('❌  No SQLite module found. Run: npm install  then try again.');
    process.exit(1);
  }
}

// ── Media records ─────────────────────────────────────────────────────────────
const radhaPhotos = Array.from({length: 27}, (_, i) =>
  `/assets/media/gallery/radha/radha-${String(i+1).padStart(2,'0')}.jpg`
);

const mediaRecords = [
  // ── Radha — Weddings (27 real photos) ──────────────────────────────────────
  ...radhaPhotos.map((url, i) => ({
    name: `Radha Wedding Gallery ${i+1}`,
    url,
    pillar: 'radha',
    type: 'image',
    size: 250000,
    originalName: path.basename(url)
  })),
  // ── Veronica — Corporate ────────────────────────────────────────────────────
  { name: 'Corporate Event Banner',   url: '/assets/media/gallery-corp-1.png',  pillar: 'corporate', type: 'image', size: 180000, originalName: 'gallery-corp-1.png' },
  { name: 'Veronica Hero Shot',       url: '/assets/media/veronica-hero.png',   pillar: 'corporate', type: 'image', size: 220000, originalName: 'veronica-hero.png'  },
  { name: 'Corporate Gallery 1',      url: '/assets/media/gallery/radha/radha-10.jpg', pillar: 'corporate', type: 'image', size: 250000, originalName: 'radha-10.jpg' },
  { name: 'Corporate Gallery 2',      url: '/assets/media/gallery/radha/radha-11.jpg', pillar: 'corporate', type: 'image', size: 250000, originalName: 'radha-11.jpg' },
  { name: 'Corporate Gallery 3',      url: '/assets/media/gallery/radha/radha-12.jpg', pillar: 'corporate', type: 'image', size: 250000, originalName: 'radha-12.jpg' },
  { name: 'Corporate Gallery 4',      url: '/assets/media/gallery/radha/radha-13.jpg', pillar: 'corporate', type: 'image', size: 250000, originalName: 'radha-13.jpg' },
  { name: 'Corporate Gallery 5',      url: '/assets/media/gallery/radha/radha-14.jpg', pillar: 'corporate', type: 'image', size: 250000, originalName: 'radha-14.jpg' },
  // ── Tour ────────────────────────────────────────────────────────────────────
  { name: 'Heritage Tour Banner',     url: '/assets/media/gallery-tour-1.png',  pillar: 'tour', type: 'image', size: 180000, originalName: 'gallery-tour-1.png' },
  { name: 'Tour Hero',                url: '/assets/media/tour-hero.png',        pillar: 'tour', type: 'image', size: 220000, originalName: 'tour-hero.png'      },
  { name: 'Tour Gallery 1',           url: '/assets/media/gallery/radha/radha-19.jpg', pillar: 'tour', type: 'image', size: 250000, originalName: 'radha-19.jpg' },
  { name: 'Tour Gallery 2',           url: '/assets/media/gallery/radha/radha-20.jpg', pillar: 'tour', type: 'image', size: 250000, originalName: 'radha-20.jpg' },
  { name: 'Tour Gallery 3',           url: '/assets/media/gallery/radha/radha-21.jpg', pillar: 'tour', type: 'image', size: 250000, originalName: 'radha-21.jpg' },
  { name: 'Tour Gallery 4',           url: '/assets/media/gallery/radha/radha-22.jpg', pillar: 'tour', type: 'image', size: 250000, originalName: 'radha-22.jpg' },
  { name: 'Tour Gallery 5',           url: '/assets/media/gallery/radha/radha-23.jpg', pillar: 'tour', type: 'image', size: 250000, originalName: 'radha-23.jpg' },
  // ── Main site ───────────────────────────────────────────────────────────────
  { name: 'OG Cover',                 url: '/assets/media/og-cover.jpg',         pillar: 'main', type: 'image', size: 180000, originalName: 'og-cover.jpg'       },
  { name: 'Radha Hero',               url: '/assets/media/radha-hero.png',        pillar: 'main', type: 'image', size: 220000, originalName: 'radha-hero.png'     },
];

// ── sql.js runner (async) ─────────────────────────────────────────────────────
function run(db, onDone) {
  // Ensure table exists
  db.run(`CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, url TEXT, pillar TEXT, type TEXT,
    size INTEGER, originalName TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  )`);

  let inserted = 0, skipped = 0;
  mediaRecords.forEach(m => {
    const exists = db.exec(
      `SELECT id FROM media WHERE url = '${m.url.replace(/'/g,"''")}'`
    );
    if (exists.length && exists[0].values.length) {
      skipped++;
      return;
    }
    db.run(
      `INSERT INTO media (name, url, pillar, type, size, originalName) VALUES (?,?,?,?,?,?)`,
      [m.name, m.url, m.pillar, m.type, m.size, m.originalName]
    );
    inserted++;
    console.log(`  ✓ [${m.pillar.padEnd(10)}] ${m.name}`);
  });

  console.log(`\n  ${inserted} inserted, ${skipped} already existed`);
  onDone(db);
}

// ── better-sqlite3 runner (sync fallback) ─────────────────────────────────────
function runSync(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, url TEXT, pillar TEXT, type TEXT,
    size INTEGER, originalName TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  )`);

  const insert = db.prepare(
    `INSERT OR IGNORE INTO media (name, url, pillar, type, size, originalName) VALUES (?,?,?,?,?,?)`
  );
  let inserted = 0;
  const tx = db.transaction(() => {
    mediaRecords.forEach(m => {
      const r = insert.run(m.name, m.url, m.pillar, m.type, m.size, m.originalName);
      if (r.changes) { inserted++; console.log(`  ✓ [${m.pillar.padEnd(10)}] ${m.name}`); }
    });
  });
  tx();
  console.log(`\n✅  ${inserted} records inserted into ${DB_PATH}`);
  db.close();
}
