#!/usr/bin/env node
/**
 * setup.js — One-time project setup
 * Run: node scripts/setup.js
 */
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

console.log('\n🚀 Anti-Gravity Studio — Setup\n');

// 1. Create .env from .env.example if missing
const envPath     = path.join(ROOT, '.env');
const examplePath = path.join(ROOT, '.env.example');
if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
  let env = fs.readFileSync(examplePath, 'utf8');
  // Auto-generate session secret
  env = env.replace('change_this_to_a_random_64_char_string', crypto.randomBytes(32).toString('hex'));
  fs.writeFileSync(envPath, env);
  console.log('✅ Created .env from .env.example');
  console.log('   → Edit .env to set your ADMIN_USER_PASSWORD and other keys\n');
} else {
  console.log('   .env already exists — skipping\n');
}

// 2. Create upload directories
const dirs = ['uploads/sangeet','uploads/corporate','uploads/tour','uploads/main'];
dirs.forEach(d => {
  fs.mkdirSync(path.join(ROOT, d), { recursive: true });
  console.log('📁 Created:', d);
});

console.log('\n✅ Setup complete!');
console.log('   Run: npm start');
console.log('   Open: http://localhost:3005\n');
