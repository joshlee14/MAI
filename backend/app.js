import http from 'http';
import { fetchPlans } from './modules/planFetcher.js';
import { generateClosingScript } from './modules/aiAssistant.js';

const PORT = process.env.PORT || 3000;

/**
 * Helper to send JSON response with appropriate CORS headers.  Chrome
 * extensions make XHR/fetch requests from a `chrome-extension://` origin,
 * which counts as a cross‑origin request.  Without the
 * `Access-Control-Allow-Origin` header, the browser will block the response.
 * We allow any origin here because this API does not handle sensitive data.
 * Adjust the allowed origin as needed for more restrictive deployments.
 *
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {Object} payload
 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    // Allow Chrome extension origin (or any origin) to access this resource
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight requests.  Browsers send an OPTIONS request before
  // certain cross‑origin POSTs to check allowed methods/headers.  We
  // respond with the appropriate CORS headers and an empty body.
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    });
    res.end();
    return;
  }
  // Only handle POST requests for actual API calls.  All other methods
  // return 404.
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