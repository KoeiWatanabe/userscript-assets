const http = require('http');
const fs = require('fs');

const scriptPath = process.argv[2];
const port = Number(process.argv[3] || 8765);

http
  .createServer((request, response) => {
    const source = fs.readFileSync(scriptPath, 'utf8');
    response.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(source);
  })
  .listen(port, '127.0.0.1');
