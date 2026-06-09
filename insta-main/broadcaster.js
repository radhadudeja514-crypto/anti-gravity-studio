const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'database.sqlite');
const LOG_FILE = path.join(__dirname, 'broadcast.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(line.trim());
  fs.appendFileSync(LOG_FILE, line);
}

if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '=== AI BROADCASTER INIT ===\n');

log('Starting AI Social Broadcaster Daemon...');

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    log(`ERROR: Could not connect to database - ${err.message}`);
    process.exit(1);
  }
});

function checkSchedule() {
  const now = new Date();
  const currentDate = now.toISOString().split('T')[0];
  const currentHour = now.getHours(); // 0-23
  
  // Create a time string matching 'HH:00' format for basic hourly matching
  const timeStr = `${currentHour.toString().padStart(2, '0')}:00`;

  log(`Checking schedule for ${currentDate} ${timeStr}...`);

  db.all(
    `SELECT * FROM schedule WHERE date = ? AND time LIKE ? AND status = 'Scheduled'`,
    [currentDate, `${currentHour.toString().padStart(2, '0')}%`],
    (err, rows) => {
      if (err) {
        log(`DB Error: ${err.message}`);
        return;
      }

      if (rows.length === 0) {
        log('No pending posts for this hour.');
        return;
      }

      rows.forEach(post => {
        log(`BROADCASTING: [${post.pillar}] -> ${post.topic}`);
        log(`Caption: ${post.caption}`);
        log(`Media: ${post.mediaUrl}`);
        
        // Mark as posted
        db.run(`UPDATE schedule SET status = 'Posted' WHERE id = ?`, [post.id], (updateErr) => {
          if (updateErr) log(`Failed to update status for post ${post.id}: ${updateErr.message}`);
          else log(`✅ Post ${post.id} successfully marked as Posted.`);
        });
      });
    }
  );
}

// Run immediately, then check every hour
checkSchedule();
setInterval(checkSchedule, 60 * 60 * 1000);
