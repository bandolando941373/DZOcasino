import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { RoomManager } from './RoomManager'; // Adjust this import name/path if your RoomManager class is in a different file name

const PORT = Number(process.env.PORT) || 10000;

// Create HTTP server for Render health checks and port binding
const server = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(404);
    res.end();
  }
});

// Initialize WebSocket server attached to the HTTP server
const wss = new WebSocketServer({ server });
const roomManager = new RoomManager();

wss.on('connection', (ws, req) => {
  roomManager.handleConnection(ws, req);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`WebSocket server is running on port ${PORT}`);
});