const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Data directory for server-side storage
const DATA_DIR = path.join(__dirname, 'data');
const PLACES_FILE = path.join(DATA_DIR, 'places.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize data files if they don't exist
if (!fs.existsSync(PLACES_FILE)) {
  fs.writeFileSync(PLACES_FILE, '[]', 'utf8');
}
if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, '[]', 'utf8');
}

// Parse JSON bodies
app.use(express.json({ limit: '5mb' }));

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  setHeaders: function (res, filePath) {
    // Proper MIME types
    if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
    if (filePath.endsWith('.js'))  res.setHeader('Content-Type', 'application/javascript');
  }
}));

/* ── API Routes ── */

// GET /api/places — Load places
app.get('/api/places', function (req, res) {
  try {
    var data = fs.readFileSync(PLACES_FILE, 'utf8');
    res.json(JSON.parse(data));
  } catch (e) {
    console.error('Error reading places:', e.message);
    res.json([]);
  }
});

// POST /api/places — Save places
app.post('/api/places', function (req, res) {
  try {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Body must be an array' });
    }
    fs.writeFileSync(PLACES_FILE, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    console.error('Error saving places:', e.message);
    res.status(500).json({ error: 'Failed to save places' });
  }
});

// GET /api/history — Load history
app.get('/api/history', function (req, res) {
  try {
    var data = fs.readFileSync(HISTORY_FILE, 'utf8');
    res.json(JSON.parse(data));
  } catch (e) {
    console.error('Error reading history:', e.message);
    res.json([]);
  }
});

// POST /api/history — Save history
app.post('/api/history', function (req, res) {
  try {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Body must be an array' });
    }
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    console.error('Error saving history:', e.message);
    res.status(500).json({ error: 'Failed to save history' });
  }
});

// SPA fallback — always serve index.html (must be after API routes)
app.get('*', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, function () {
  console.log('🌺 Tahiti Planner running on http://localhost:' + PORT);
});
