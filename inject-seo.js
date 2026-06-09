/**
 * inject-seo.js
 * Run once after HTML changes: node inject-seo.js
 * Injects: meta tags, OG/Twitter, canonical, hreflang, JSON-LD, PWA links, and stylesheet/font imports
 */

const fs   = require('fs');
const path = require('path');

const SITE = {
  name:        'Anti Gravity Studio',
  url:         'https://antigravitystudio.in',
  description: 'Premium media studio for weddings, corporate events & tours — Three Pillars, One Vision.',
  twitter:     '@AntiGravityStudio',
  locale:      'en_IN',
  themeColor:  '#0a0a0f',
};

const PAGES = [
  {
    file:        'index.html',
    title:       'Anti Gravity Studio | Premium Media for Weddings, Corporate & Tours',
    description: 'Transform your moments into legacy. Three specialised pillars — Radha (Weddings), Veronica (Corporate), Tour — crafted with cinema-grade precision.',
    type:        'website',
    schema:      localBusinessSchema(),
    stylesheets: ['assets/css/global.css', 'assets/css/index.css', 'assets/css/style.css', 'assets/css/vfx.css']
  },
  {
    file:        'booking.html',
    title:       'Book Your Shoot | Anti Gravity Studio',
    description: 'Reserve your date. Pay securely via UPI QR. We confirm within 24 hours.',
    type:        'website',
    schema:      null,
    stylesheets: ['assets/css/global.css', 'assets/css/style.css', 'assets/css/vfx.css']
  },
  {
    file:        'pillar-radha.html',
    title:       'Radha — Wedding & Sangeet Pillar | Anti Gravity Studio',
    description: 'Cinematic wedding films, sangeet reels, and heirloom photo albums. Eternally yours.',
    type:        'website',
    schema:      serviceSchema('Wedding & Sangeet Photography', 'Radha Pillar'),
    stylesheets: ['assets/css/global.css', 'assets/css/index.css', 'assets/css/style.css', 'assets/css/vfx.css', 'assets/css/pillar-radha.css']
  },
  {
    file:        'pillar-veronica.html',
    title:       'Veronica — Corporate Media Pillar | Anti Gravity Studio',
    description: 'Corporate videos, product shoots, and brand campaigns. Sophisticated. Strategic. Impactful.',
    type:        'website',
    schema:      serviceSchema('Corporate Media Production', 'Veronica Pillar'),
    stylesheets: ['assets/css/global.css', 'assets/css/index.css', 'assets/css/style.css', 'assets/css/vfx.css', 'assets/css/pillar-veronica.css']
  },
  {
    file:        'pillar-tour.html',
    title:       'Tour — Travel & Events Pillar | Anti Gravity Studio',
    description: 'Concert coverage, travel documentaries, and live-event capture. Feel every beat.',
    type:        'website',
    schema:      serviceSchema('Tour & Events Coverage', 'Tour Pillar'),
    stylesheets: ['assets/css/global.css', 'assets/css/index.css', 'assets/css/style.css', 'assets/css/vfx.css', 'assets/css/pillar-tour.css']
  },
  {
    file:        'media-kit.html',
    title:       'Media Kit | Anti Gravity Studio',
    description: 'Download our brand assets, rate cards, and portfolio decks.',
    type:        'website',
    schema:      null,
    stylesheets: ['assets/css/global.css', 'assets/css/style.css', 'assets/css/vfx.css']
  },
];

function localBusinessSchema() {
  return {
    '@context':   'https://schema.org',
    '@type':      'LocalBusiness',
    name:         SITE.name,
    url:          SITE.url,
    description:  SITE.description,
    image:        `${SITE.url}/assets/media/og-cover.jpg`,
    priceRange:   '₹₹₹',
    address: {
      '@type':           'PostalAddress',
      addressCountry:    'IN',
    },
    sameAs: [
      'https://instagram.com/antigravitystudio',
    ],
  };
}

function serviceSchema(serviceName, pillar) {
  return {
    '@context': 'https://schema.org',
    '@type':    'Service',
    name:       serviceName,
    provider: {
      '@type': 'LocalBusiness',
      name:    SITE.name,
      url:     SITE.url,
    },
    description: `${pillar} — premium media services by ${SITE.name}.`,
    areaServed:  'IN',
  };
}

function buildHead(page) {
  const pageUrl = `${SITE.url}/${page.file}`;
  const schemaTag = page.schema
    ? `<script type="application/ld+json">${JSON.stringify(page.schema, null, 2)}</script>`
    : '';

  const stylesheetTags = (page.stylesheets || [])
    .map(href => `<link rel="stylesheet" href="${href}">`)
    .join('\n  ');

  return `<meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.title}</title>
  <meta name="description" content="${page.description}">
  <meta name="theme-color" content="${SITE.themeColor}">
  <meta name="robots" content="index, follow">

  <!-- Canonical & hreflang -->
  <link rel="canonical" href="${pageUrl}">
  <link rel="alternate" hreflang="en" href="${pageUrl}">
  <link rel="alternate" hreflang="x-default" href="${pageUrl}">

  <!-- Open Graph -->
  <meta property="og:type"        content="${page.type}">
  <meta property="og:title"       content="${page.title}">
  <meta property="og:description" content="${page.description}">
  <meta property="og:url"         content="${pageUrl}">
  <meta property="og:image"       content="${SITE.url}/assets/media/og-cover.jpg">
  <meta property="og:site_name"   content="${SITE.name}">
  <meta property="og:locale"      content="${SITE.locale}">

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:site"        content="${SITE.twitter}">
  <meta name="twitter:title"       content="${page.title}">
  <meta name="twitter:description" content="${page.description}">
  <meta name="twitter:image"       content="${SITE.url}/assets/media/og-cover.jpg">

  <!-- PWA -->
  <link rel="manifest" href="/manifest.json">
  <link rel="apple-touch-icon" href="/assets/media/icon-192.png">

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Inter:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">

  <!-- Styles -->
  ${stylesheetTags}

  <!-- JSON-LD Structured Data -->
  ${schemaTag}`;
}

let updated = 0;
PAGES.forEach(page => {
  const filePath = path.join(__dirname, page.file);
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠  Skipping (not found): ${page.file}`);
    return;
  }

  let html = fs.readFileSync(filePath, 'utf8');

  // Ensure <html lang="en">
  html = html.replace(/<html(?![^>]*lang)[^>]*>/, '<html lang="en">');

  // Replace everything between <head> and </head>
  html = html.replace(
    /(<head>)([\s\S]*?)(<\/head>)/i,
    `<head>\n  ${buildHead(page)}\n$3`
  );

  // Remove duplicate charset/viewport if injected more than once
  html = deduplicateMetaTags(html);

  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`✅ SEO & Styles injected: ${page.file}`);
  updated++;
});

function deduplicateMetaTags(html) {
  let charsetCount = 0;
  let viewportCount = 0;
  return html
    .replace(/<meta charset="[^"]*">/g, m => (++charsetCount === 1 ? m : ''))
    .replace(/<meta name="viewport"[^>]*>/g, m => (++viewportCount === 1 ? m : ''));
}

console.log(`\n🚀 SEO & Stylesheet injection complete — ${updated}/${PAGES.length} pages updated.`);
