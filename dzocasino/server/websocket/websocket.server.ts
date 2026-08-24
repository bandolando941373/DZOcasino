import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { parse } from 'url';

export interface GamePlayer {
  userId: string;
  ws: WebSocket;
  seatIndex: number;
  chips: bigint;
}

export abstract class BaseRoom {
  public id: string;
  public players: Map<string, GamePlayer> = new Map();
  public maxPlayers: number = 4;

  constructor(id: string, maxPlayers: number = 4) {
    this.id = id;
    this.maxPlayers = maxPlayers;
  }

  public addPlayer(userId: string, ws: WebSocket, chips: bigint): boolean {
    if (this.players.size >= this.maxPlayers || this.players.has(userId)) {
      return false;
    }
    const availableSeats = [0, 1, 2, 3].filter(
      (seat) => !Array.from(this.players.values()).some((p) => p.seatIndex === seat)
    );
    
    this.players.set(userId, { userId, ws, seatIndex: availableSeats[0], chips });
    this.broadcast({ type: 'PLAYER_JOINED', userId, seatIndex: availableSeats[0] });
    return true;
  }

  public removePlayer(userId: string): void {
    if (this.players.has(userId)) {
      this.players.delete(userId);
      this.broadcast({ type: 'PLAYER_LEFT', userId });
    }
  }

  public broadcast(payload: object, excludeUserId?: string): void {
    const data = JSON.stringify(payload);
    this.players.forEach((player) => {
      if (player.userId !== excludeUserId && player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(data);
      }
    });
  }

  abstract handleAction(userId: string, action: any): void;
}

export class RoomManager {
  private rooms: Map<string, BaseRoom> = new Map();

  public registerRoom(room: BaseRoom): void {
    this.rooms.set(room.id, room);
  }

  public handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const { query } = parse(req.url || '', true);
    const roomId = query.roomId as string;
    const userId = query.userId as string;

    if (!roomId || !userId) {
      ws.close(1008, 'Params missing');
      return;
    }

    let room = this.rooms.get(roomId);
    if (!room) {
      ws.close(1004, 'Room not found');
      return;
    }

    const joined = room.addPlayer(userId, ws, BigInt(0));
    if (!joined) {
      ws.close(1013, 'Room full or already in room');
      return;
    }

    ws.on('message', (data: string) => {
      try {
        const message = JSON.parse(data);
        room?.handleAction(userId, message);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'Malformed JSON payload' }));
      }
    });

    ws.on('close', () => {
      room?.removePlayer(userId);
      if (room?.players.size === 0) {
        this.rooms.delete(roomId);
      }
    });
  }
}