// scripts/google_photos_fetcher.js
// Puppeteer script to log into Google Photos, scrape a handful of recent photos and short videos,
// and store the URLs (or download the files) under assets/media/google-photos.
// Run: `node scripts/google_photos_fetcher.js`

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Expected env vars: GOOGLE_PHOTOS_EMAIL, GOOGLE_PHOTOS_PASSWORD
const EMAIL = process.env.GOOGLE_PHOTOS_EMAIL;
const PASS  = process.env.GOOGLE_PHOTOS_PASSWORD;

if (!EMAIL || !PASS) {
  console.error('Google Photos credentials missing. Set GOOGLE_PHOTOS_EMAIL and GOOGLE_PHOTOS_PASSWORD in .env');
  process.exit(1);
}

async function fetchMedia(page) {
  const media = { videos: [], images: [] };
  // Navigate to the Photos library (grid view)
  await page.goto('https://photos.google.com/', { waitUntil: 'networkidle2' });
  await page.waitForTimeout(3000);
  // Scroll a few times to load content
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(1000);
  }
  // Grab thumbnail elements – they contain a data URL or a link to the full size in the DOM
  const items = await page.$$('[data-id]'); // generic selector for media items
  for (let i = 0; i < Math.min(items.length, 20); i++) {
    const el = items[i];
    const src = await el.evaluate(node => node.getAttribute('src') || node.style.backgroundImage.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, ''));
    if (!src) continue;
    // Heuristic: if src ends with .mp4 or contains 'video' assume video, else image
    if (src.includes('.mp4') || src.toLowerCase().includes('video')) {
      if (media.videos.length < 5) media.videos.push(src);
    } else {
      if (media.images.length < 5) media.images.push(src);
    }
    if (media.videos.length >= 5 && media.images.length >= 5) break;
  }
  return media;
}

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // Login flow
  await page.goto('https://accounts.google.com/ServiceLogin', { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', EMAIL, { delay: 30 });
  await page.click('#identifierNext');
  // Wait for password field with longer timeout and use name attribute
  await page.waitForSelector('input[name="password"]', { timeout: 20000 });
  await page.type('input[name="password"]', PASS, { delay: 30 });
  await page.click('#passwordNext');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  const media = await fetchMedia(page);
  const outDir = path.join('assets', 'media', 'google-photos');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'media.json'), JSON.stringify(media, null, 2));
  console.log('Google Photos media collected:', media);

  await browser.close();
})();
