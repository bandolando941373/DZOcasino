import Phaser from 'phaser';

export class CasinoScene extends Phaser.Scene {
  private ws!: WebSocket;
  private isMobile: boolean = false;
  private userId: string;

  constructor(userId: string) {
    super({ key: 'CasinoScene' });
    this.userId = userId;
  }

  create(): void {
    this.isMobile = !this.sys.game.device.os.desktop;

    const baseWidth = 1920;
    const baseHeight = 1080;

    this.cameras.main.setBounds(0, 0, baseWidth, baseHeight);
    
    const bg = this.add.graphics();
    bg.fillStyle(0x076324, 1);
    bg.fillRoundedRect(160, 90, 1600, 900, 32);

    const seats = [
      { x: 960, y: 850 },
      { x: 300, y: 540 },
      { x: 960, y: 230 },
      { x: 1620, y: 540 },
    ];

    seats.forEach((pos, idx) => {
      const container = this.add.container(pos.x, pos.y);
      const avatarCircle = this.add.circle(0, 0, 45, 0x111111).setStrokeStyle(3, 0xffffff);
      const label = this.add.text(0, 55, `Seat ${idx + 1}`, { font: '20px Arial', color: '#ffffff' }).setOrigin(0.5);
      container.add([avatarCircle, label]);
    });

    this.buildControlPanel(baseWidth, baseHeight);
    this.initWebSocket();
  }

  private buildControlPanel(width: number, height: number): void {
    const btnWidth = this.isMobile ? 220 : 160;
    const btnHeight = this.isMobile ? 100 : 60;
    const fontSize = this.isMobile ? '28px' : '20px';

    const actions = ['FOLD', 'CALL', 'RAISE'];
    const startX = width / 2 - ((actions.length - 1) * (btnWidth + 20)) / 2;

    actions.forEach((action, i) => {
      const x = startX + i * (btnWidth + 20);
      const y = height - (this.isMobile ? 120 : 80);

      const btnContainer = this.add.container(x, y);
      const bg = this.add.rectangle(0, 0, btnWidth, btnHeight, 0xd32f2f, 1)
        .setInteractive({ useHandCursor: true });

      const text = this.add.text(0, 0, action, { font: `${fontSize} Arial`, color: '#ffffff' }).setOrigin(0.5);
      btnContainer.add([bg, text]);

      bg.on('pointerdown', () => {
        bg.setFillStyle(0x9a0007);
        this.sendAction(action);
      });

      bg.on('pointerup', () => bg.setFillStyle(0xd32f2f));
      bg.on('pointerout', () => bg.setFillStyle(0xd32f2f));
    });
  }

  private initWebSocket(): void {
    const wsUrl = import.meta.env.VITE_WEBSOCKET_URL || `wss://${window.location.host}`;
    this.ws = new WebSocket(`${wsUrl}?roomId=holdem-1&userId=${this.userId}`);
    
    this.ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      this.handleServerState(payload);
    };
  }

  private sendAction(actionType: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: actionType, amount: '100' }));
    }
  }

  private handleServerState(data: any): void {
    console.log('Server Event:', data);
  }
}