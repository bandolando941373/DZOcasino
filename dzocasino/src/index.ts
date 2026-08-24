import { DiscordSDK } from '@discord/embedded-app-sdk';
import Phaser from 'phaser';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { CasinoScene } from './scenes/CasinoScene';
import { AdminExchangePanel } from './components/AdminExchangePanel';
import { UserSession } from '../shared/types';

const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);

async function setupActivity() {
  await discordSdk.ready();

  const { code } = await discordSdk.commands.authorize({
    client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify', 'guilds.members.read'],
  });

  const response = await fetch('/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  
  const authData = await response.json();
  const user: UserSession = authData.user;

  if (user.role === 'ADMIN' || user.role === 'BANKER') {
    const adminRoot = document.getElementById('admin-root');
    if (adminRoot) {
      ReactDOM.createRoot(adminRoot).render(
        React.createElement(AdminExchangePanel, { currentUserId: user.id })
      );
    }
  }

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'game-app',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 1920,
      height: 1080,
    },
    scene: [new CasinoScene(user.id)],
  };

  new Phaser.Game(config);
}

setupActivity();