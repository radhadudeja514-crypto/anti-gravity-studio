#!/usr/bin/env node
/**
 * seed-media.js
 * Adds sample media to the SQLite database
 * Run with: node seed-media.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './database.sqlite';

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Failed to open database:', err.message);
    process.exit(1);
  }
  console.log('✓ Connected to database');
});

// Sample media entries (URLs or local paths)
const sampleMedia = [
  {
    name: 'Radha Corporate Presentation - HortiLife Genetics',
    url: 'https://res.cloudinary.com/demo/image/fetch/w_400/https://via.placeholder.com/400x600?text=Radha+HortiLife',
    pillar: 'corporate',
    type: 'image',
    originalName: 'radha-hortilife-delegates.jpg',
    size: 245000
  },
  {
    name: 'Veronica Portfolio - Pool Photoshoot',
    url: 'https://res.cloudinary.com/demo/image/fetch/w_400/https://via.placeholder.com/400x600?text=Veronica+Pool',
    pillar: 'radha',
    type: 'image',
    originalName: 'veronica-pool-portrait.jpg',
    size: 312000
  },
  {
    name: 'Wedding Highlight - Sangeeth Night',
    url: 'https://res.cloudinary.com/demo/image/fetch/w_400/https://via.placeholder.com/800x600?text=Wedding+Highlight',
    pillar: 'radha',
    type: 'image',
    originalName: 'wedding-sangeeth-highlight.jpg',
    size: 456000
  },
  {
    name: 'Corporate Event - Conference Setup',
    url: 'https://res.cloudinary.com/demo/image/fetch/w_400/https://via.placeholder.com/800x600?text=Corporate+Event',
    pillar: 'corporate',
    type: 'image',
    originalName: 'corporate-conference-setup.jpg',
    size: 512000
  },
  {
    name: 'Tour Experience - Heritage Walk',
    url: 'https://res.cloudinary.com/demo/image/fetch/w_400/https://via.placeholder.com/800x600?text=Heritage+Tour',
    pillar: 'tour',
    type: 'image',
    originalName: 'tour-heritage-walk.jpg',
    size: 378000
  }
];

// Insert sample media
db.serialize(() => {
  let inserted = 0;
  let failed = 0;

  sampleMedia.forEach((media, index) => {
    db.run(
      `INSERT INTO media (name, url, pillar, type, size, originalName, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [media.name, media.url, media.pillar, media.type, media.size, media.originalName],
      function(err) {
        if (err) {
          console.error(`❌ Failed to insert media ${index + 1}:`, err.message);
          failed++;
        } else {
          console.log(`✓ Inserted: "${media.name}" (ID: ${this.lastID})`);
          inserted++;
        }

        // Close db after all inserts
        if (index === sampleMedia.length - 1) {
          setTimeout(() => {
            db.close((err) => {
              if (err) console.error('Error closing db:', err.message);
              console.log(`\n✓ Seeding complete: ${inserted} inserted, ${failed} failed`);
              process.exit(failed > 0 ? 1 : 0);
            });
          }, 100);
        }
      }
    );
  });
});
