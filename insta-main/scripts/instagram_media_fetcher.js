// scripts/instagram_media_fetcher.js
// Puppeteer script to log into Instagram, search for media, and download up to 5 videos per profile.
// Run: `node scripts/instagram_media_fetcher.js`

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const accounts = [
  { username: process.env.INSTAGRAM_USERNAME_VERONICA, password: process.env.INSTAGRAM_PASSWORD_VERONICA },
  { username: process.env.INSTAGRAM_USERNAME_THETRAIL, password: process.env.INSTAGRAM_PASSWORD_THETRAIL },
  // Add radha credentials if needed
];

const searches = {
  veronicaemcee: ['sangeet', 'married', 'corporate'],
  thetrailcurator: ['trail curator'],
  // RadhaDudeja will just use recent posts
};

async function fetchMedia(page, profile, terms) {
  const media = { videos: [], images: [] };
  const profileUrl = `https://www.instagram.com/${profile}/`;
  await page.goto(profileUrl, { waitUntil: 'networkidle2' });
  await page.waitForTimeout(2000);
  for (const term of terms) {
    await page.goto(`https://www.instagram.com/explore/tags/${encodeURIComponent(term)}/`, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(1500);
  }
  const links = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('article a'));
    return anchors.map(a => a.href).slice(0, 20);
  });
  for (const link of links) {
    await page.goto(link, { waitUntil: 'networkidle2' });
    const video = await page.evaluate(() => document.querySelector('video')?.src || null);
    if (video && media.videos.length < 5) media.videos.push(video);
    const img = await page.evaluate(() => document.querySelector('article img')?.src || null);
    if (img && media.images.length < 5) media.images.push(img);
    if (media.videos.length >= 5 && media.images.length >= 5) break;
  }
  return media;
}

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  for (const acc of accounts) {
    const profile = acc.username.replace(/^@/, '');
    // Login
    await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[name="username"]');
    await page.type('input[name="username"]', acc.username, { delay: 30 });
    await page.type('input[name="password"]', acc.password, { delay: 30 });
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    // Dismiss pop‑ups
    try { await page.waitForSelector('button:contains("Not Now")', { timeout: 3000 }); await page.click('button:contains("Not Now")'); } catch (_) {}
    const media = await fetchMedia(page, profile, searches[profile] || []);
    const outDir = path.join('assets', 'media', 'instagram', profile);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'media.json'), JSON.stringify(media, null, 2));
    console.log(`Fetched ${media.videos.length} videos for ${profile}`);
  }
  await browser.close();
})();
