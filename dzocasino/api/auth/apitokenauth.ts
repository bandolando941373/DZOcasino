import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../../server/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Missing code' });
  }

  try {
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code: code,
      }),
    });

    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok) return res.status(401).json(tokens);

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const discordUser = await userResponse.json();

    const guildId = process.env.DISCORD_GUILD_ID!;
    const memberResponse = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${discordUser.id}`,
      { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } }
    );

    let assignedRole: 'USER' | 'BANKER' | 'ADMIN' = 'USER';
    if (memberResponse.ok) {
      const memberData = await memberResponse.json();
      const roles: string[] = memberData.roles || [];

      if (roles.includes(process.env.DISCORD_ADMIN_ROLE_ID!)) {
        assignedRole = 'ADMIN';
      } else if (roles.includes(process.env.DISCORD_BANKER_ROLE_ID!)) {
        assignedRole = 'BANKER';
      }
    }

    const user = await prisma.user.upsert({
      where: { id: discordUser.id },
      update: {
        username: discordUser.username,
        discriminator: discordUser.discriminator || '0',
        avatar: discordUser.avatar,
        role: assignedRole,
      },
      create: {
        id: discordUser.id,
        username: discordUser.username,
        discriminator: discordUser.discriminator || '0',
        avatar: discordUser.avatar,
        role: assignedRole,
      },
    });

    return res.status(200).json({
      accessToken: tokens.access_token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        chipBalance: user.chipBalance.toString(),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
}