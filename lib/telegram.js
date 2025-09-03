const axios = require('axios');

function getBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || process.env.TG_BOT_TOKEN;
  if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN');
  return token;
}

async function getFilePath(fileId) {
  const token = getBotToken();
  const url = `https://api.telegram.org/bot${token}/getFile`;
  const resp = await axios.get(url, { params: { file_id: fileId } });
  if (!resp.data || !resp.data.ok || !resp.data.result || !resp.data.result.file_path) {
    throw new Error('Failed to resolve file_path from Telegram');
  }
  return resp.data.result.file_path;
}

async function resolveFileUrl(fileId) {
  const token = getBotToken();
  const filePath = await getFilePath(fileId);
  return `https://api.telegram.org/file/bot${token}/${filePath}`;
}

module.exports = {
  getFilePath,
  resolveFileUrl,
};

