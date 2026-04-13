const fs = require('fs');
const path = require('path');

const usePostgres = !!process.env.DATABASE_URL;
let pool = null;

if (usePostgres) {
  var pg = require('pg');
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
}

// File-system fallback paths (local dev)
var DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

function getFilePath(key) {
  return path.join(DATA_DIR, key + '.json');
}

// Initialize DB or filesystem
async function initDB() {
  if (usePostgres) {
    await pool.query(
      'CREATE TABLE IF NOT EXISTS app_data (' +
      '  key TEXT PRIMARY KEY,' +
      '  value JSONB NOT NULL DEFAULT \'[]\'::jsonb' +
      ')'
    );
    await pool.query(
      "INSERT INTO app_data (key, value) VALUES ('places', '[]'::jsonb) ON CONFLICT (key) DO NOTHING"
    );
    await pool.query(
      "INSERT INTO app_data (key, value) VALUES ('history', '[]'::jsonb) ON CONFLICT (key) DO NOTHING"
    );
    console.log('PostgreSQL database initialized');
  } else {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    ['places', 'history'].forEach(function (key) {
      var filePath = getFilePath(key);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '[]', 'utf8');
      }
    });
    console.log('File-system storage initialized at ' + DATA_DIR);
  }
}

// Load data by key ('places' or 'history')
async function loadData(key) {
  if (usePostgres) {
    var result = await pool.query('SELECT value FROM app_data WHERE key = $1', [key]);
    return result.rows.length > 0 ? result.rows[0].value : [];
  } else {
    try {
      return JSON.parse(fs.readFileSync(getFilePath(key), 'utf8'));
    } catch (e) {
      return [];
    }
  }
}

// Save data by key ('places' or 'history')
async function saveData(key, data) {
  if (usePostgres) {
    await pool.query(
      'INSERT INTO app_data (key, value) VALUES ($1, $2::jsonb) ' +
      'ON CONFLICT (key) DO UPDATE SET value = $2::jsonb',
      [key, JSON.stringify(data)]
    );
  } else {
    fs.writeFileSync(getFilePath(key), JSON.stringify(data, null, 2), 'utf8');
  }
}

module.exports = { initDB, loadData, saveData };
