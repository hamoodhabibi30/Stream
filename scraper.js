const puppeteer = require('puppeteer');

module.exports = async function scrapeStreamUrl(id) {
  const url = `https://letsembed.cc/download/?id=${id}`;
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920x1080'
    ],
    executablePath: process.env.CHROME_BIN || null
  });
  const page = await browser.newPage();
  let streamUrl = null;

  try {
    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.setRequestInterception(true);
    page.on('request', req => {
      const reqUrl = req.url();
      if (reqUrl.includes('.m3u8') && !streamUrl) {
        streamUrl = reqUrl;
      }
      req.continue();
    });

    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 // 30 second timeout
    });

    // Click server button
    await page.evaluate(() => {
      const serverBtn = document.querySelector('button[data-server="desi"]');
      if (serverBtn) serverBtn.click();
    });

    await new Promise(resolve => setTimeout(resolve, 2000)); // wait after server click

    // Click Hindi button
    await page.evaluate(() => {
      const hindiBtn = Array.from(document.querySelectorAll('#langButtons button'))
        .find(btn => btn.textContent.includes('Hindi'));
      if (hindiBtn) hindiBtn.click();
    });

    await new Promise(resolve => setTimeout(resolve, 6000)); // wait for stream to load

  } catch (err) {
    console.error('❌ Scrape error:', err);
    throw new Error(`Failed to scrape stream: ${err.message}`);
  } finally {
    await browser.close();
  }

  // Generate the player URL for the stream
  const playerUrl = streamUrl ? `https://anym3u8player.com/tv/p.php?url=${encodeURIComponent(streamUrl)}` : null;

  // Return the player URL as JSON
  return {
    streamUrl: playerUrl,
  };
};
