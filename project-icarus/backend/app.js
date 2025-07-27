import http from 'http';
import { fetchPlans } from './modules/planFetcher.js';
import { generateClosingScript } from './modules/aiAssistant.js';

const PORT = process.env.PORT || 3000;

/**
 * Helper to send JSON response
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {Object} payload
 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  // Only handle POST requests
  if (req.method !== 'POST') {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }
  // Collect request body
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', async () => {
    let payload;
    try {
      payload = JSON.parse(body || '{}');
    } catch (err) {
      sendJson(res, 400, { error: 'Invalid JSON' });
      return;
    }
    try {
      if (req.url === '/plans') {
        const plans = await fetchPlans(payload);
        sendJson(res, 200, plans);
      } else if (req.url === '/ai-recommend') {
        const result = await generateClosingScript(payload);
        sendJson(res, 200, result);
      } else {
        sendJson(res, 404, { error: 'Not found' });
      }
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { error: 'Internal server error' });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});