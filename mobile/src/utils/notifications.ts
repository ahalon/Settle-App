import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { getToken } from '../../authStorage';
import { updatePushToken } from '../services/api';

const isExpoGoAndroid =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient &&
  Platform.OS === 'android';

let Notifications: any = null;
let Device: any = null;

if (!isExpoGoAndroid) {
  try {
    Notifications = require('expo-notifications');
    Device = require('expo-device');

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    console.warn('[Push] Błąd ładowania expo-notifications:', e);
  }
}

export async function registerForPushNotificationsAsync(authToken?: string): Promise<string | null> {
  if (isExpoGoAndroid) {
    console.log('[Push] Wyłączone w Expo Go na Androidzie (wymóg SDK 53+).');
    return null;
  }

  if (!Device || !Device.isDevice) {
    console.log('[Push] Powiadomienia działają tylko na fizycznym urządzeniu');
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] Brak uprawnień do powiadomień');
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId ??
      '3d084c4b-b5de-4a93-8d27-3d69bead1657';

    const pushTokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const pushToken: string | null = pushTokenData?.data || null;

    if (pushToken) {
      const activeToken = authToken || (await getToken());
      if (activeToken) {
        try {
          await updatePushToken(activeToken, pushToken);
          console.log('[Push] Token zarejestrowany i zapisany w bazie danych:', pushToken);
        } catch (pushErr) {
          console.error('[Push] Błąd zapisu expo_push_token w bazie:', pushErr);
        }
      }
    }

    return pushToken;
  } catch (error) {
    console.error('[Push] Błąd pobierania tokena Expo:', error);
    return null;
  }
}