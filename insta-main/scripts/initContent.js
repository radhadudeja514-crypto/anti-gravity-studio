// initContent.js – run on server start to ensure content table and defaults
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(DB_PATH);

const defaultContent = [
  { key: 'heroTitle', value: 'One Voice.<br/><span class="gradient-text-radha">Three Worlds.</span>' },
  { key: 'heroSubtitle', value: 'Elevating high-ticket corporate summits, luxury weddings, and immersive cultural tours.' },
  { key: 'radhaDesc', value: 'Grounded, warm, and deeply human. Transforming celebrations into lifelong memories through rhythm, emotion, and tradition.' },
  { key: 'veronicaDesc', value: 'High-voltage, sharp, and commanding. The voice that controls the room — from C-suite boardrooms to 10,000‑seat auditoriums.' },
  { key: 'tourDesc', value: 'Stories hidden in every stone. Immersive experiences that transform travel into a deep, unforgettable cultural conversation.' },
  { key: 'footerCopy', value: 'Three worlds. One extraordinary artist. Crafting moments that live forever in memory and emotion.' },
  // Social links (used by footer UI)
  { key: 'instagramLink', value: 'https://www.instagram.com/anchor_radha_dudeja/' },
  { key: 'facebookLink', value: 'https://www.facebook.com/139423866731395?ref=NONE_xav_ig_profile_page_web' },
  { key: 'whatsappLink', value: 'https://wa.me/8279526273' }
];

function init() {
  db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS content (key TEXT PRIMARY KEY, value TEXT)', err => {
      if (err) console.error('Failed to create content table', err);
    });
    const insertStmt = db.prepare('INSERT OR IGNORE INTO content (key, value) VALUES (?, ?)');
    defaultContent.forEach(row => insertStmt.run(row.key, row.value));
    insertStmt.finalize();
    console.log('Content table initialized with default keys');
  });
}

module.exports = { init };
