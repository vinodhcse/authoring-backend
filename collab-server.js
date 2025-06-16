// collab-server.js
const http = require('http');
const WebSocket = require('ws');
const { setupWSConnection } = require('y-websocket/server'); // ✅ proper public API

const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', (conn, req) => {
  setupWSConnection(conn, req);
});

const PORT = 1234;
server.listen(PORT, () => {
  console.log(`✅ Yjs WebSocket server running at ws://localhost:${PORT}`);
});
