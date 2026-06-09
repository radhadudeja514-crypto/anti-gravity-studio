# Anti-Gravity Studio — Deployable Portfolio

Premium media studio with 3 pillars: **Radha** (Weddings), **Veronica** (Corporate), **Trail Curator** (Tours).

---

## ☁️ Get Free Cloudinary Keys (for image uploads)

1. Sign up free at **https://cloudinary.com/users/register/free**
2. After login, go to your **Dashboard**
3. Copy these 3 values:
   - **Cloud Name**
   - **API Key**
   - **API Secret**
4. Paste them into Render environment variables (see deploy steps below)

Without Cloudinary, image uploads still work — they save locally on the server.

---

## ⚡ Quick Start — Local (Windows)

1. Install [Node.js LTS](https://nodejs.org)
2. Double-click **`SETUP-AND-RUN.bat`**
3. Browser opens automatically at `http://localhost:3005`
4. Admin at `http://localhost:3005/admin/login.html` · Password: `RD@Admin2026!`

---

## 🚀 Deploy to Railway (Free — Recommended)

**Fastest way to get live in 5 minutes:**

1. Push this folder to a GitHub repo
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Select your repo → Railway auto-detects Node.js
4. Set environment variables (Settings → Variables):
   ```
   ADMIN_USER_PASSWORD=YourSecurePassword
   ADMIN_USER_EMAIL=you@example.com
   SESSION_SECRET=<any 32+ random chars>
   NODE_ENV=production
   ```
5. Click **Deploy** — live in ~2 minutes

Your site will be at `https://yourproject.railway.app`

---

## 🌐 Deploy to Render (Free)

1. Push to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your repo
4. Set:
   - **Build Command:** `npm install --omit=dev`
   - **Start Command:** `node server.js`
5. Add same env vars as Railway above
6. Deploy

---

## 🐳 Deploy with Docker

```bash
# Build
docker build -t anti-gravity-studio .

# Run
docker run -p 3005:3005 \
  -e ADMIN_USER_PASSWORD=YourPassword \
  -e SESSION_SECRET=yoursecret \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/database.sqlite:/app/database.sqlite \
  anti-gravity-studio
```

Or use docker-compose:
```bash
cp .env.example .env  # edit .env first
docker-compose up -d
```

---

## 🖥️ Deploy to VPS / cPanel

```bash
# On your VPS
git clone https://github.com/youruser/anti-gravity-studio.git
cd anti-gravity-studio
npm install --omit=dev
cp .env.example .env && nano .env   # set your values
node scripts/setup.js               # creates folders
node server.js                      # or use PM2:

# With PM2 (keeps running after reboot)
npm install -g pm2
pm2 start server.js --name "ag-studio"
pm2 save && pm2 startup
```

---

## 🔑 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3005` | Server port |
| `ADMIN_USER_PASSWORD` | ✅ | `RD@Admin2026!` | Admin panel password |
| `ADMIN_USER_EMAIL` | ✅ | `admin@antigravitystudio.in` | Admin email |
| `SESSION_SECRET` | ✅ | auto-generated | Random secret string |
| `CLOUDINARY_NAME` | No | — | Cloud image storage |
| `CLOUDINARY_KEY` | No | — | Cloud image storage |
| `CLOUDINARY_SECRET` | No | — | Cloud image storage |
| `GOOGLE_PLACES_API_KEY` | No | — | Google Reviews widget |
| `GOOGLE_PLACE_ID` | No | — | Your Google Place ID |
| `GOOGLE_PHOTOS_CLIENT_ID` | No | — | Google Photos OAuth |
| `GEMINI_API_KEY` | No | — | AI content generation |

> Without Cloudinary, uploads save locally to `/uploads/` — works fine for local/VPS, but resets on Railway/Render free tier restarts. Add Cloudinary for persistent media.

---

## 📁 Project Structure

```
anti-gravity-studio/
├── server.js              # Express server (sql.js, no native deps)
├── package.json
├── .env.example           # Copy to .env
├── admin/                 # Admin panel (17 pages)
│   ├── login.html
│   ├── dashboard.html
│   ├── leads.html
│   ├── media.html         # YouTube + Google Photos import
│   ├── analytics.html
│   ├── schedule.html
│   └── ...
├── assets/
│   ├── css/               # Styles for all pages
│   ├── js/                # Animations, AI chat, particles
│   └── media/             # Icons, hero images
├── scripts/
│   └── setup.js           # One-time setup script
├── index.html             # Homepage
├── pillar-radha.html      # Wedding pillar
├── pillar-veronica.html   # Corporate pillar
├── pillar-tour.html       # Tour pillar
├── booking.html           # Enquiry form → /api/leads
├── Dockerfile
├── docker-compose.yml
├── railway.json
└── render.yaml
```

---

## 🛠️ API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | No | Server health check |
| `POST` | `/api/admin/login` | No | Admin login |
| `GET` | `/api/leads` | ✅ | Get all leads |
| `POST` | `/api/leads` | No | Submit enquiry |
| `GET` | `/api/media` | ✅ | Get media library |
| `POST` | `/api/media` | ✅ | Upload file |
| `POST` | `/api/media/import-youtube-bulk` | ✅ | Import YT thumbnails |
| `POST` | `/api/media/import-google-photos` | ✅ | Import Google Photos |
| `GET` | `/api/analytics/stats` | ✅ | Analytics dashboard |
| `GET` | `/api/backup/leads` | �