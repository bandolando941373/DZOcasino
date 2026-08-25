import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';

class RoomManager {
  private rooms: Map<string, Set<WebSocket>> = new Map();

  public handleConnection(ws: WebSocket, req: any): void {
    const urlParams = new URLSearchParams(req.url?.split('?')[1] || '');
    const roomId = urlParams.get('roomId') || 'default';
    const userId = urlParams.get('userId') || 'anonymous';

    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }

    const room = this.rooms.get(roomId)!;
    room.add(ws);

    console.log(`User ${userId} connected to room: ${roomId}`);

    ws.on('message', (message: string) => {
      try {
        const parsed = JSON.parse(message);
        if (parsed.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG' }));
          return;
        }
        
        // Broadcast incoming actions to all room participants
        this.broadcastToRoom(roomId, message, ws);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    });

    ws.on('close', () => {
      room.delete(ws);
      if (room.size === 0) {
        this.rooms.delete(roomId);
      }
      console.log(`User ${userId} disconnected from room: ${roomId}`);
    });
  }

  private broadcastToRoom(roomId: string, message: string, sender: WebSocket): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

const app = express();
const PORT = Number(process.env.PORT) || 10000;

// Serve static frontend build files from dist directory
const distPath = path.join(process.cwd(), 'dist');
app.use(express.static(distPath));

// Fallback to index.html for application routes
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const server = createServer(app);
const wss = new WebSocketServer({ server });
const roomManager = new RoomManager();

wss.on('connection', (ws, req) => {
  roomManager.handleConnection(ws, req);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server and WebSockets running on port ${PORT}`);
});
