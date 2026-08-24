import express, { Request, Response, NextFunction } from 'express';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();
export const authRouter = express.Router();

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: Role;
  };
}

// Exchange Discord OAuth2 Code for Access Token & Sync User Profile
authRouter.post('/api/auth/token', async (req: Request, res: Response) => {
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

    // Retrieve Discord User Profile
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const discordUser = await userResponse.json();

    // Fetch Guild Member Details to check Admin/Banker Roles
    const guildId = process.env.DISCORD_GUILD_ID!;
    const memberResponse = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${discordUser.id}`,
      { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } }
    );
    
    let assignedRole: Role = Role.USER;
    if (memberResponse.ok) {
      const memberData = await memberResponse.json();
      const roles: string[] = memberData.roles || [];

      if (roles.includes(process.env.DISCORD_ADMIN_ROLE_ID!)) {
        assignedRole = Role.ADMIN;
      } else if (roles.includes(process.env.DISCORD_BANKER_ROLE_ID!)) {
        assignedRole = Role.BANKER;
      }
    }

    // Upsert User in PostgreSQL
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

    return res.json({
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
});

// Middleware: Restrict route access to Admin or Banker Roles
export const requireBankerOrAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const userId = req.headers['x-discord-userid'] as string;
  if (!userId) return res.status(401).json({ error: 'Missing Identity Header' });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || (user.role !== Role.ADMIN && user.role !== Role.BANKER)) {
    return res.status(403).json({ error: 'Forbidden: Requires Banker or Admin privilege.' });
  }

  req.user = { id: user.id, username: user.username, role: user.role };
  next();
};

// Admin Endpoint: Exchange DZO for Chips & Record Audit Logs
authRouter.post('/api/admin/credit-chips', requireBankerOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { targetUserId, dzoAmount, conversionRate = 1000 } = req.body;

  if (!targetUserId || !dzoAmount || dzoAmount <= 0) {
    return res.status(400).json({ error: 'Invalid payload parameters' });
  }

  const chipsToCredit = BigInt(Math.floor(dzoAmount * conversionRate));

  try {
    const transactionResult = await prisma.$transaction(async (tx) => {
      // 1. Credit target user balance
      const updatedUser = await tx.user.update({
        where: { id: targetUserId },
        data: { chipBalance: { increment: chipsToCredit } },
      });

      // 2. Write Admin Audit Log
      const auditLog = await tx.adminLog.create({
        data: {
          adminId: req.user!.id,
          targetUserId: targetUserId,
          dzoAmount: dzoAmount,
          chipsExchanged: chipsToCredit,
          actionType: 'DZO_DEPOSIT',
        },
      });

      // 3. Write Financial Ledger Entry
      await tx.ledgerEntry.create({
        data: {
          userId: targetUserId,
          amountDelta: chipsToCredit,
          balanceAfter: updatedUser.chipBalance,
          type: 'DZO_DEPOSIT',
          referenceId: auditLog.id,
        },
      });

      return updatedUser;
    });

    return res.json({
      success: true,
      targetUserId: transactionResult.id,
      newBalance: transactionResult.chipBalance.toString(),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Transaction failed', details: (err as Error).message });
  }
});