const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON bodies
app.use(express.json({ limit: '5mb' }));

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  setHeaders: function (res, filePath) {
    if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
    if (filePath.endsWith('.js'))  res.setHeader('Content-Type', 'application/javascript');
  }
}));

/* ── API Routes ── */

// GET /api/places — Load places
app.get('/api/places', function (req, res) {
  db.loadData('places').then(function (data) {
    res.json(data);
  }).catch(function (e) {
    console.error('Error reading places:', e.message);
    res.json([]);
  });
});

// POST /api/places — Save places
app.post('/api/places', function (req, res) {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Body must be an array' });
  }
  db.saveData('places', req.body).then(function () {
    res.json({ ok: true });
  }).catch(function (e) {
    console.error('Error saving places:', e.message);
    res.status(500).json({ error: 'Failed to save places' });
  });
});

// GET /api/history — Load history
app.get('/api/history', function (req, res) {
  db.loadData('history').then(function (data) {
    res.json(data);
  }).catch(function (e) {
    console.error('Error reading history:', e.message);
    res.json([]);
  });
});

// POST /api/history — Save history
app.post('/api/history', function (req, res) {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Body must be an array' });
  }
  db.saveData('history', req.body).then(function () {
    res.json({ ok: true });
  }).catch(function (e) {
    console.error('Error saving history:', e.message);
    res.status(500).json({ error: 'Failed to save history' });
  });
});

// SPA fallback — always serve index.html (must be after API routes)
app.get('*', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize database then start server
db.initDB().then(function () {
  app.listen(PORT, function () {
    console.log('🌺 Tahiti Planner running on http://localhost:' + PORT);
  });
}).catch(function (err) {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
