const express = require('express');
const cors = require('cors');
const scrapeStreamUrl = require('./scraper');
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
