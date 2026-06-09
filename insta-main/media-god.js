const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const { execSync } = require('child_process');

ffmpeg.setFfmpegPath(ffmpegStatic);

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const LOG_FILE = path.join(__dirname, 'media-god.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(line.trim());
  fs.appendFileSync(LOG_FILE, line);
}

function getFiles(dir, skipDirs = ['backups']) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      // BUG FIX: skip the backups directory to avoid compressing DB backup files
      if (skipDirs.includes(file)) return;
      results = results.concat(getFiles(fullPath, skipDirs));
    } else {
      results.push(fullPath);
    }
  });
  return results;
}

// Ensure the log file exists
if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '=== MEDIA GOD INIT ===\n');

log('Starting Media God Compressor Daemon...');

function processVideo(filePath) {
  return new Promise((resolve, reject) => {
    const ext = path.extname(filePath);
    if (!['.mp4', '.mov', '.webm'].includes(ext.toLowerCase())) return resolve(false);
    if (filePath.includes('_compressed')) return resolve(false);

    const stat = fs.statSync(filePath);
    if (stat.size < 5 * 1024 * 1024) return resolve(false); // Skip if under 5MB

    const outPath = filePath.replace(ext, `_compressed.mp4`);
    log(`Compressing video: ${path.basename(filePath)} (${(stat.size/1024/1024).toFixed(1)}MB)`);

    ffmpeg(filePath)
      .outputOptions([
        '-c:v libx264',
        '-crf 28',        // Good balance of quality/size
        '-preset fast',   // Speed
        '-c:a aac',
        '-b:a 128k',
        '-movflags +faststart' // Web optimized
      ])
      .save(outPath)
      .on('end', () => {
        const newStat = fs.statSync(outPath);
        log(`Success: ${path.basename(outPath)} (${(newStat.size/1024/1024).toFixed(1)}MB)`);
        
        // Replace original
        fs.unlinkSync(filePath);
        fs.renameSync(outPath, filePath);
        resolve(true);
      })
      .on('error', (err) => {
        log(`Error compressing ${path.basename(filePath)}: ${err.message}`);
        if(fs.existsSync(outPath)) fs.unlinkSync(outPath);
        resolve(false); // don't reject, just move on
      });
  });
}

async function sweepMedia() {
  log('Starting media directory sweep...');
  if (!fs.existsSync(UPLOADS_DIR)) {
    log('No uploads directory found.');
    return;
  }

  const files = getFiles(UPLOADS_DIR);
  let processedCount = 0;

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    
    // Video Compression
    if (['.mp4', '.mov', '.webm'].includes(ext)) {
      const didProcess = await processVideo(file);
      if (didProcess) processedCount++;
    }
  }

  log(`Media Sweep complete. Processed ${processedCount} heavy files.`);
}

function backupDatabase() {
  const dbFile = path.join(__dirname, 'database.sqlite');
  if (!fs.existsSync(dbFile)) return;
  const backupDir = path.join(UPLOADS_DIR, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `db_backup_${timestamp}.sqlite`);
  
  try {
    fs.copyFileSync(dbFile, backupFile);
    log(`Database auto-backed up to: ${path.basename(backupFile)}`);
    
    // Cleanup old backups (keep last 5)
    const backups = fs.readdirSync(backupDir).sort().reverse();
    if (backups.length > 5) {
      for (let i = 5; i < backups.length; i++) {
        fs.unlinkSync(path.join(backupDir, backups[i]));
      }
    }
  } catch (err) {
    log(`Error backing up database: ${err.message}`);
  }
}

async function runSweep() {
  log('Starting full maintenance sweep (Media + DB)...');
  await sweepMedia();
  backupDatabase();
  log('Maintenance sweep complete.');
}

// Run immediately, then every 6 hours
runSweep();
setInterval(runSweep, 6 * 60 * 60 * 1000);
