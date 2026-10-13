import axios from 'axios';

import {
  BalanceResponse,
  CreateExpensePayload,
  CreateGroupPayload,
  CreateTransferPayload,
  Expense,
  Group,
  JoinGroupPayload,
  MonthlySummaryResponse,
  Notification,
  RegisterPayload,
  TokenResponse,
  Transfer,
} from '../types';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://settle-app-lnyt.onrender.com';

// Render free tier cold start can take up to 50 seconds; keep timeout at 65 seconds
axios.defaults.timeout = 65000;

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
});

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export const setOnUnauthorizedHandler = (handler: UnauthorizedHandler | null) => {
  unauthorizedHandler = handler;
};

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error?.config;

    if (error?.response?.status === 401 && !config?.url?.includes('/api/auth/login')) {
      if (unauthorizedHandler) {
        unauthorizedHandler();
      }
      return Promise.reject(error);
    }

    // Auto-retry cold start transient network drops or 502/503/504 gateways (up to 2 retries)
    if (config && (!config._retryCount || config._retryCount < 2)) {
      const status = error?.response?.status;
      const isTransientColdStart =
        error?.code === 'ECONNABORTED' ||
        error?.message === 'Network Error' ||
        !error?.response ||
        status === 502 ||
        status === 503 ||
        status === 504;

      // Do not retry 4xx errors (client errors)
      if (isTransientColdStart && (!status || status >= 500)) {
        config._retryCount = (config._retryCount || 0) + 1;
        await new Promise((resolve) => setTimeout(resolve, 2500));
        return axios(config);
      }
    }

    return Promise.reject(error);
  }
);

export const register = (payload: RegisterPayload) =>
  axios.post<TokenResponse>(`${API_URL}/api/auth/register`, payload);

export const login = (payload: { email: string; password: string }) =>
  axios.post<TokenResponse>(`${API_URL}/api/auth/login`, payload);

export const getGroups = (token: string) =>
  axios.get<Group[]>(`${API_URL}/api/groups/my`, { headers: authHeaders(token) });

export const getGroup = (groupId: number, token: string) =>
  axios.get<Group>(`${API_URL}/api/groups/${groupId}`, { headers: authHeaders(token) });

export const getGroupBalance = (groupId: number, token: string) =>
  axios.get<BalanceResponse>(`${API_URL}/api/groups/${groupId}/balance`, {
    headers: authHeaders(token),
  });

export const createGroup = (token: string, payload: CreateGroupPayload) =>
  axios.post<Group>(`${API_URL}/api/groups`, payload, { headers: authHeaders(token) });

export const joinGroup = (token: string, payload: JoinGroupPayload) =>
  axios.post<Group>(`${API_URL}/api/groups/join`, payload, { headers: authHeaders(token) });

export const getGroupExpenses = (groupId: number, token: string, year: number, month: number) =>
  axios.get<Expense[]>(`${API_URL}/api/groups/${groupId}/expenses`, {
    headers: authHeaders(token),
    params: { year, month },
  });

export const getGroupTransfers = (groupId: number, token: string) =>
  axios.get<Transfer[]>(`${API_URL}/api/groups/${groupId}/transfers`, {
    headers: authHeaders(token),
  });

export const getMonthlySummary = (groupId: number, token: string, year: number, month: number) =>
  axios.get<MonthlySummaryResponse>(`${API_URL}/api/groups/${groupId}/monthly-summary`, {
    headers: authHeaders(token),
    params: { year, month },
  });

export const getNotifications = (token: string) =>
  axios.get<Notification[]>(`${API_URL}/api/notifications`, { headers: authHeaders(token) });

export const addExpense = (token: string, payload: CreateExpensePayload) =>
  axios.post<Expense>(`${API_URL}/api/expenses`, payload, { headers: authHeaders(token) });

export const deleteExpense = (token: string, expenseId: number) =>
  axios.delete(`${API_URL}/api/expenses/${expenseId}`, { headers: authHeaders(token) });

export const declareTransfer = (groupId: number, token: string, payload: CreateTransferPayload) =>
  axios.post<Transfer>(`${API_URL}/api/groups/${groupId}/transfers`, payload, {
    headers: authHeaders(token),
  });

export const decideTransfer = (token: string, transferId: number, decision: 'confirm' | 'reject') =>
  axios.post<Transfer>(`${API_URL}/api/transfers/${transferId}/${decision}`, {}, {
    headers: authHeaders(token),
  });

export const deleteTransfer = (token: string, transferId: number) =>
  axios.delete(`${API_URL}/api/transfers/${transferId}`, { headers: authHeaders(token) });

export const updatePushToken = (token: string, pushToken: string) => {
  return axios.post(
    `${API_URL}/api/auth/push-token`,
    { token: pushToken },
    { headers: { Authorization: `Bearer ${token}` } }
  );
};