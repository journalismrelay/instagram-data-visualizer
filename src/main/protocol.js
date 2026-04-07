const http = require('http');
const path = require('path');
const fs = require('fs');

let server = null;
let serverPort = null;

const MIME = {
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
};

/**
 * Starts a local HTTP server to serve processed data and raw media.
 * userDataDirs can be a string (single folder) or array (multiple folders).
 * Returns the base URL (e.g. http://localhost:54321).
 */
function startServer(processedDataDir, userDataDirs) {
  // Normalize to array
  const rawDirs = Array.isArray(userDataDirs) ? userDataDirs : [userDataDirs];

  return new Promise((resolve, reject) => {
    // Stop previous server if any
    stopServer();

    server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url);

      let filePath;
      if (urlPath.startsWith('/data/')) {
        filePath = path.join(processedDataDir, urlPath.slice(6));
        if (!filePath.startsWith(processedDataDir)) {
          res.writeHead(403); res.end('Forbidden'); return;
        }
      } else if (urlPath.startsWith('/rawdata/')) {
        const rel = urlPath.slice(9);
        // Search across all raw data directories for the file
        filePath = null;
        for (const dir of rawDirs) {
          const candidate = path.join(dir, rel);
          if (candidate.startsWith(dir) && fs.existsSync(candidate)) {
            filePath = candidate;
            break;
          }
        }
        if (!filePath) {
          res.writeHead(404); res.end('Not found'); return;
        }
      } else {
        res.writeHead(404); res.end('Not found'); return;
      }

      if (!fs.existsSync(filePath)) {
        res.writeHead(404); res.end('Not found'); return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': mime,
        'Access-Control-Allow-Origin': '*',
      });
      fs.createReadStream(filePath).pipe(res);
    });

    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      const baseUrl = `http://127.0.0.1:${serverPort}`;
      console.log(`Data server running at ${baseUrl}`);
      resolve(baseUrl);
    });

    server.on('error', reject);
  });
}

function stopServer() {
  if (server) {
    server.close();
    server = null;
    serverPort = null;
  }
}

module.exports = { startServer, stopServer };
