import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'user_access_token';
const USER_DATA_KEY = 'user_info';

const isWeb = Platform.OS === 'web';

export const saveToken = async (token: string): Promise<void> => {
  if (isWeb) {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(TOKEN_KEY, token);
    }
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
};

export const getToken = async (): Promise<string | null> => {
  if (isWeb) {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(TOKEN_KEY);
    }
    return null;
  }
  return await SecureStore.getItemAsync(TOKEN_KEY);
};

export const removeToken = async (): Promise<void> => {
  if (isWeb) {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_DATA_KEY);
    }
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_DATA_KEY);
};

export const saveUserData = async (userData: { id: number; name: string }): Promise<void> => {
  if (isWeb) {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
    }
    return;
  }
  await SecureStore.setItemAsync(USER_DATA_KEY, JSON.stringify(userData));
};

export const getUserData = async (): Promise<{ id: number; name: string } | null> => {
  if (isWeb) {
    if (typeof window !== 'undefined' && window.localStorage) {
      const data = window.localStorage.getItem(USER_DATA_KEY);
      return data ? JSON.parse(data) : null;
    }
    return null;
  }
  const data = await SecureStore.getItemAsync(USER_DATA_KEY);
  return data ? JSON.parse(data) : null;
};