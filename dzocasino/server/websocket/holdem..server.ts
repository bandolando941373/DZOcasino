import { BaseRoom } from './RoomManager';

type HandStage = 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN';

export class HoldemRoom extends BaseRoom {
  private currentStage: HandStage = 'PREFLOP';
  private pot: bigint = BigInt(0);
  private currentTurnSeat: number = 0;

  constructor(id: string) {
    super(id, 4);
  }

  public handleAction(userId: string, action: { type: string; amount?: string }): void {
    const player = this.players.get(userId);
    if (!player) return;

    if (player.seatIndex !== this.currentTurnSeat) {
      player.ws.send(JSON.stringify({ type: 'ERROR', message: 'Not your turn' }));
      return;
    }

    switch (action.type) {
      case 'FOLD':
        this.processFold(userId);
        break;
      case 'CALL':
      case 'RAISE':
        this.processBet(userId, BigInt(action.amount || '0'));
        break;
    }
  }

  private processFold(userId: string): void {
    this.broadcast({ type: 'ACTION_EXECUTED', userId, action: 'FOLD' });
    this.advanceTurn();
  }

  private processBet(userId: string, amount: bigint): void {
    const player = this.players.get(userId)!;
    if (player.chips < amount) {
      player.ws.send(JSON.stringify({ type: 'ERROR', message: 'Insufficient chips' }));
      return;
    }
    player.chips -= amount;
    this.pot += amount;
    this.broadcast({ type: 'ACTION_EXECUTED', userId, action: 'BET', amount: amount.toString(), totalPot: this.pot.toString() });
    this.advanceTurn();
  }

  private advanceTurn(): void {
    this.currentTurnSeat = (this.currentTurnSeat + 1) % this.players.size;
    this.broadcast({ type: 'NEXT_TURN', seatIndex: this.currentTurnSeat });
  }
}