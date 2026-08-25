import Phaser from 'phaser';

export class CasinoScene extends Phaser.Scene {
  private ws!: WebSocket;
  private isMobile: boolean = false;
  private userId: string;
  private heartbeatInterval: number | null = null;

  private readonly RENDER_WS_URL: string = 'wss://dzocasino.onrender.com';

  constructor(userId: string) {
    super({ key: 'CasinoScene' });
    this.userId = userId || 'Guest';
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
    const baseUrl = this.RENDER_WS_URL.includes('your-app-name') 
      ? `wss://${window.location.host}` 
      : this.RENDER_WS_URL;

    const fullUrl = `${baseUrl}?roomId=holdem-1&userId=${encodeURIComponent(this.userId)}`;
    
    console.log(`Connecting to WebSocket: ${fullUrl}`);
    this.ws = new WebSocket(fullUrl);

    this.ws.onopen = () => {
      console.log('Successfully connected to Render WebSocket server!');
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        this.handleServerState(payload);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', event.data);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket Error:', error);
    };

    this.ws.onclose = (event) => {
      console.warn(`WebSocket closed (Code: ${event.code}). Retrying in 3 seconds...`);
      this.stopHeartbeat();
      this.time.delayedCall(3000, () => this.initWebSocket());
    };
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'PING' }));
      }
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private sendAction(actionType: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload = { type: actionType, amount: '100' };
      this.ws.send(JSON.stringify(payload));
      console.log('Sent action:', payload);
    } else {
      console.warn('Cannot send action: WebSocket is not open.');
    }
  }

  private handleServerState(data: any): void {
    console.log('Server Event Received:', data);
  }
}
