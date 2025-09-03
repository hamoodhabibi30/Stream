const express = require('express');
const cors = require('cors');
const scrapeStreamUrl = require('./scraper');
const { searchItems, getItemById, loadAllItems, upsertMovie, upsertSeriesEpisode } = require('./lib/indexStore');
const { resolveFileUrl } = require('./lib/telegram');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok',
    message: '🔥 scraper is alive and unhinged.',
    version: '1.0.0'
  });
});

// Admin: add/update movie
app.post('/admin/movie', (req, res) => {
  try {
    const { title, year, poster, telegram } = req.body || {};
    if (!title || !telegram || !telegram.file_id) {
      return res.status(400).json({ error: 'title and telegram.file_id required' });
    }
    const saved = upsertMovie({ title, year, poster, telegram });
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: add/update series episode
app.post('/admin/series/episode', (req, res) => {
  try {
    const { seriesTitle, season, episode, poster, telegram } = req.body || {};
    if (!seriesTitle || season == null || episode == null || !telegram || !telegram.file_id) {
      return res.status(400).json({ error: 'seriesTitle, season, episode, telegram.file_id required' });
    }
    const saved = upsertSeriesEpisode(seriesTitle, season, episode, telegram, { poster });
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stremio Addon: Manifest
app.get('/manifest.json', (req, res) => {
  const manifest = {
    id: 'org.telegram.streamio',
    version: '1.0.0',
    name: 'Telegram Streams',
    description: 'Stream movies and series from Telegram files',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    idPrefixes: ['movie:', 'series:'],
    catalogs: [
      { type: 'movie', id: 'tg_movies', name: 'Telegram Movies' },
      { type: 'series', id: 'tg_series', name: 'Telegram Series' }
    ]
  };
  res.json(manifest);
});

function getBaseUrl(req) {
  const envBase = process.env.PUBLIC_BASE_URL;
  if (envBase) return envBase.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// Stremio Addon: Catalog
app.get('/catalog/:type/:catalogId.json', (req, res) => {
  const { type } = req.params;
  const { search } = req.query;
  const items = searchItems(search || '', type);
  const metas = items.map((it) => ({
    id: it.id,
    type: it.type,
    name: it.title,
    poster: it.poster || null,
    posterShape: 'poster',
    year: it.year || null,
  }));
  res.json({ metas });
});

// Stremio Addon: Meta
app.get('/meta/:type/:id.json', (req, res) => {
  const { id } = req.params;
  const item = getItemById(id);
  if (!item) return res.status(404).json({ err: 'Not found' });
  if (item.type === 'movie') {
    return res.json({ meta: {
      id: item.id,
      type: item.type,
      name: item.title,
      year: item.year || null,
      poster: item.poster || null,
      background: null,
      genres: [],
      videos: [],
    }});
  }
  // series
  const videos = [];
  const seasons = item.seasons || {};
  Object.keys(seasons).forEach((s) => {
    const eps = seasons[s] || {};
    Object.keys(eps).forEach((e) => {
      videos.push({
        id: `${item.id}:s${s}:e${e}`,
        title: `${item.title} S${s}E${e}`,
        season: Number(s),
        episode: Number(e),
      });
    });
  });
  res.json({ meta: {
    id: item.id,
    type: item.type,
    name: item.title,
    poster: item.poster || null,
    background: null,
    genres: [],
    videos,
  }});
});

// Stremio Addon: Stream
app.get('/stream/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;
  try {
    if (type === 'movie') {
      const movie = getItemById(id);
      if (!movie || !movie.telegram || !movie.telegram.file_id) {
        return res.json({ streams: [] });
      }
      const redirectUrl = `${getBaseUrl(req)}/tg/${encodeURIComponent(movie.telegram.file_id)}`;
      return res.json({ streams: [{ name: 'Telegram', title: 'Telegram File', url: redirectUrl }] });
    }

    // series: id format "series:slug:s1:e2"
    const match = id.match(/^(.*):s(\d+):e(\d+)$/);
    if (!match) return res.json({ streams: [] });
    const baseId = match[1];
    const season = match[2];
    const episode = match[3];
    const series = getItemById(baseId);
    const node = series && series.seasons && series.seasons[season] && series.seasons[season][episode];
    const fileId = node && node.telegram && node.telegram.file_id;
    if (!fileId) return res.json({ streams: [] });
    const redirectUrl = `${getBaseUrl(req)}/tg/${encodeURIComponent(fileId)}`;
    return res.json({ streams: [{ name: 'Telegram', title: `S${season}E${episode}`, url: redirectUrl }] });
  } catch (err) {
    console.error('Stream error:', err.message);
    return res.json({ streams: [] });
  }
});

// Telegram redirect to preserve bot token secrecy
app.get('/tg/:fileId', async (req, res) => {
  const { fileId } = req.params;
  try {
    const url = await resolveFileUrl(fileId);
    res.redirect(302, url);
  } catch (err) {
    console.error('Telegram resolve error:', err.message);
    res.status(502).json({ error: 'Failed to resolve Telegram file' });
  }
});

// Stream endpoint
app.get('/stream/:id', async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ 
      error: 'Missing ID',
      message: 'Please provide a valid ID parameter'
    });
  }

  try {
    const result = await scrapeStreamUrl(id);
    
    if (!result || !result.streamUrl) {
      return res.status(404).json({ 
        error: 'Stream not found',
        message: 'No .m3u8 URL found for Hindi. Maybe the page is messed up or the ID is trash.'
      });
    }

    res.json(result);
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ 
      error: 'Scraping failed',
      message: err.message || 'An unexpected error occurred'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: 'Something went wrong on our end'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`⚡ Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
