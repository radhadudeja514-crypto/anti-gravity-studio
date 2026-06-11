// scripts/generate_placeholders.js
// Ensures each media folder (instagram profiles and google-photos) has at least 5 images/videos.
// Fills with STUNNING futuristic premium aesthetics assets (Royalty-free curated Unsplash / Mixkit Loops).

const fs = require('fs');
const path = require('path');

const CUSTOM_ASSETS = {
  RadhaDudeja: {
    images: [
      'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?q=80&w=800&auto=format&fit=crop', // luxury wedding event decor
      'https://images.unsplash.com/photo-1583939003579-730e3918a45a?q=80&w=800&auto=format&fit=crop', // bride and sangeet dancing
      'https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=800&auto=format&fit=crop', // indian wedding ceremony
      'https://images.unsplash.com/photo-1607190074257-dd4b7af0309f?q=80&w=800&auto=format&fit=crop', // traditional lights and flowers
      'https://images.unsplash.com/photo-1549417229-aa67d3263c09?q=80&w=800&auto=format&fit=crop'  // traditional drums and celebration
    ],
    videos: [
      'https://assets.mixkit.co/videos/preview/mixkit-celebration-with-sparklers-at-a-party-40018-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-background-1611-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-celebration-with-sparklers-at-a-party-40018-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-background-1611-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-celebration-with-sparklers-at-a-party-40018-large.mp4'
    ]
  },
  veronicaemcee: {
    images: [
      'https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=800&auto=format&fit=crop', // tech conference stage
      'https://images.unsplash.com/photo-1515187029135-18ee286d815b?q=80&w=800&auto=format&fit=crop', // corporate summit networking
      'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?q=80&w=800&auto=format&fit=crop', // speaker on stage holding microphone
      'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?q=80&w=800&auto=format&fit=crop', // audience watching presentation
      'https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=800&auto=format&fit=crop'  // professional corporate celebration
    ],
    videos: [
      'https://assets.mixkit.co/videos/preview/mixkit-hand-holding-a-microphone-at-a-concert-41712-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-background-1611-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-hand-holding-a-microphone-at-a-concert-41712-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-background-1611-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-hand-holding-a-microphone-at-a-concert-41712-large.mp4'
    ]
  },
  thetrailcurator: {
    images: [
      'https://images.unsplash.com/photo-1472214222541-d510753a4707?q=80&w=800&auto=format&fit=crop', // beautiful mountain valley
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=800&auto=format&fit=crop', // luxury hiking trek
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=800&auto=format&fit=crop', // sunrise travel adventure
      'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=800&auto=format&fit=crop', // ancient historic ruins
      'https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=800&auto=format&fit=crop'  // travel backpacker exploring
    ],
    videos: [
      'https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-thick-forest-and-river-42880-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-background-1611-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-thick-forest-and-river-42880-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-background-1611-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-thick-forest-and-river-42880-large.mp4'
    ]
  },
  'google-photos': {
    images: [
      'https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=800&auto=format&fit=crop', // sunset travel lake
      'https://images.unsplash.com/photo-1469371670807-013ccf25f16a?q=80&w=800&auto=format&fit=crop', // elegant evening party decoration
      'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?q=80&w=800&auto=format&fit=crop', // corporate mic
      'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?q=80&w=800&auto=format&fit=crop', // luxury celebration event
      'https://images.unsplash.com/photo-1506012787146-f92b2d7d6d96?q=80&w=800&auto=format&fit=crop'  // adventure travel scenery
    ],
    videos: [
      'https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-background-1611-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-celebration-with-sparklers-at-a-party-40018-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-hand-holding-a-microphone-at-a-concert-41712-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-thick-forest-and-river-42880-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-background-1611-large.mp4'
    ]
  }
};

function padArray(arr, targetLength, customList) {
  const result = [...arr];
  let customIdx = 0;
  while (result.length < targetLength) {
    result.push(customList[customIdx % customList.length]);
    customIdx++;
  }
  return result.slice(0, targetLength);
}

function processFolder(folderPath, folderKey) {
  const metaPath = path.join(folderPath, 'media.json');
  if (!fs.existsSync(metaPath)) {
    console.warn(`No media.json in ${folderPath}, skipping.`);
    return;
  }
  
  const folderAssets = CUSTOM_ASSETS[folderKey] || CUSTOM_ASSETS['google-photos'];
  const data = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  
  const images = padArray(data.images || [], 5, folderAssets.images);
  const videos = padArray(data.videos || [], 5, folderAssets.videos);
  
  const out = { images, videos };
  fs.writeFileSync(metaPath, JSON.stringify(out, null, 2));
  console.log(`Patched folder ${folderPath} (${folderKey}) with premium dynamic assets.`);
}

// Instagram profiles
const instaBase = path.join('assets', 'media', 'instagram');
fs.readdirSync(instaBase, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory())
  .forEach(dirent => {
    processFolder(path.join(instaBase, dirent.name), dirent.name);
  });

// Google Photos
processFolder(path.join('assets', 'media', 'google-photos'), 'google-photos');

console.log('Premium dynamic placeholder generation completed successfully! 🌟');
