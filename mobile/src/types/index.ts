export interface User {
  id: number;
  name: string;
  email: string;
  phone_number?: string | null;
}

export interface CurrentUser {
  id: number;
  name: string;
  phone_number?: string | null;
}

export interface Group {
  id: number;
  name: string;
  join_code: string;
  created_at?: string;
  members: User[];
  balanceSummary?: string;
  balanceCents?: number;
}

export interface Expense {
  id: number;
  title: string;
  amount: number;
  payer_id: number;
  group_id: number;
  created_at: string;
  description?: string | null;
  receipt_image?: string | null;
}

export interface SettlementSuggestion {
  from_user_id: number;
  from_user_name: string;
  to_user_id: number;
  to_user_name: string;
  to_user_phone?: string | null;
  amount_cents: number;
  amount_pln: string;
}

export interface BalanceResponse {
  summary: string;
  my_net_balance?: number;
  all_balances?: Record<string, number>;
  suggested_settlements?: SettlementSuggestion[];
}

export interface MonthlySummaryResponse {
  year: number;
  month: number;
  total_group_spent: number;
  total_group_spent_pln: string;
  my_spent: number;
  my_spent_pln: string;
  expense_count: number;
  members_breakdown: Array<{ name: string; amount: number }>;
}

export interface Notification {
  id: number;
  user_id: number;
  group_id: number;
  year: number;
  month: number;
  message: string;
  created_at: string;
  read_at?: string | null;
}

export type TransferStatus = 'pending' | 'confirmed' | 'rejected';

export interface Transfer {
  id: number;
  group_id: number;
  sender_id: number;
  receiver_id: number;
  amount: number;
  status: TransferStatus;
  created_at: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  phone_number: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: number;
  name: string;
  phone_number?: string | null;
}

export interface CreateGroupPayload {
  name: string;
}

export interface JoinGroupPayload {
  join_code: string;
}

export interface CreateExpensePayload {
  title: string;
  amount: number;
  payer_id: number;
  group_id: number;
  description: string | null;
  receipt_image: string | null;
}

export interface CreateTransferPayload {
  receiver_id: number;
  amount: number;
}

export type DashboardAction = 'create' | 'join' | null;
export type LobbyTab = 'expenses' | 'transfers';