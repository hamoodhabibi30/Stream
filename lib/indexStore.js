const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'index.json');

function ensureDataFile() {
  if (!fs.existsSync(path.dirname(DATA_PATH))) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  }
  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(DATA_PATH, JSON.stringify({ items: [] }, null, 2));
  }
}

function loadAllItems() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const json = JSON.parse(raw);
    return Array.isArray(json.items) ? json.items : [];
  } catch (err) {
    return [];
  }
}

function saveAllItems(items) {
  ensureDataFile();
  const payload = { items };
  fs.writeFileSync(DATA_PATH, JSON.stringify(payload, null, 2));
}

function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildMovieId(title, year) {
  const slug = normalizeTitle(title);
  return `movie:${slug}${year ? '-' + year : ''}`;
}

function buildSeriesId(title) {
  const slug = normalizeTitle(title);
  return `series:${slug}`;
}

function searchItems(query, type) {
  const items = loadAllItems();
  const q = String(query || '').trim().toLowerCase();
  return items.filter((it) => {
    if (type && it.type !== type) return false;
    if (!q) return true;
    const hay = [it.title, it.year, it.id]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

function getItemById(id) {
  const items = loadAllItems();
  return items.find((it) => it.id === id);
}

function upsertMovie(payload) {
  const items = loadAllItems();
  const id = payload.id || buildMovieId(payload.title, payload.year);
  const existingIdx = items.findIndex((it) => it.id === id);
  const next = {
    id,
    type: 'movie',
    title: payload.title,
    year: payload.year || null,
    poster: payload.poster || null,
    telegram: payload.telegram, // { file_id, message_id?, chat_id? }
  };
  if (existingIdx >= 0) items[existingIdx] = next;
  else items.push(next);
  saveAllItems(items);
  return next;
}

function upsertSeriesEpisode(seriesTitle, season, episode, telegram, opts = {}) {
  const items = loadAllItems();
  const id = buildSeriesId(seriesTitle);
  let series = items.find((it) => it.id === id);
  if (!series) {
    series = {
      id,
      type: 'series',
      title: seriesTitle,
      poster: opts.poster || null,
      seasons: {},
    };
    items.push(series);
  }
  const sKey = String(season);
  const eKey = String(episode);
  if (!series.seasons[sKey]) series.seasons[sKey] = {};
  series.seasons[sKey][eKey] = { telegram };
  saveAllItems(items);
  return series;
}

module.exports = {
  loadAllItems,
  searchItems,
  getItemById,
  upsertMovie,
  upsertSeriesEpisode,
  buildMovieId,
  buildSeriesId,
};

