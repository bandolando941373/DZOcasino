import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../../server/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const executorId = req.headers['x-discord-userid'] as string;
  if (!executorId) return res.status(401).json({ error: 'Missing Identity Header' });

  const executor = await prisma.user.findUnique({ where: { id: executorId } });
  if (!executor || (executor.role !== 'ADMIN' && executor.role !== 'BANKER')) {
    return res.status(403).json({ error: 'Forbidden: Requires Banker or Admin privilege.' });
  }

  const { targetUserId, dzoAmount, conversionRate = 1000 } = req.body;

  if (!targetUserId || !dzoAmount || dzoAmount <= 0) {
    return res.status(400).json({ error: 'Invalid payload parameters' });
  }

  const chipsToCredit = BigInt(Math.floor(dzoAmount * conversionRate));

  try {
    const transactionResult = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: targetUserId },
        data: { chipBalance: { increment: chipsToCredit } },
      });

      const auditLog = await tx.adminLog.create({
        data: {
          adminId: executorId,
          targetUserId: targetUserId,
          dzoAmount: dzoAmount,
          chipsExchanged: chipsToCredit,
          actionType: 'DZO_DEPOSIT',
        },
      });

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

    return res.status(200).json({
      success: true,
      targetUserId: transactionResult.id,
      newBalance: transactionResult.chipBalance.toString(),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Transaction failed', details: (err as Error).message });
  }
}