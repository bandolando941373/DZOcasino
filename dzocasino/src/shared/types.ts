export type UserRole = 'USER' | 'BANKER' | 'ADMIN';

export interface UserSession {
  id: string;
  username: string;
  role: UserRole;
  chipBalance: string;
}

export interface WsGameState {
  type: string;
  userId?: string;
  seatIndex?: number;
  amount?: string;
  totalPot?: string;
  message?: string;
}

export interface AdminCreditPayload {
  targetUserId: string;
  dzoAmount: number;
  conversionRate?: number;
}

export interface AdminCreditResponse {
  success: boolean;
  targetUserId: string;
  newBalance: string;
}