import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { getToken, getUserData, removeToken } from './authStorage';
import AuthScreen from './src/screens/AuthScreen';
import GroupDetailScreen from './src/screens/GroupDetailScreen';
import LobbyListScreen from './src/screens/LobbyListScreen';
import { setOnUnauthorizedHandler, updatePushToken } from './src/services/api';
import { CurrentUser, Group } from './src/types';
import { registerForPushNotificationsAsync } from './src/utils/notifications';

function MainApp() {
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([getToken(), getUserData()]);
        if (storedToken && storedUser) {
          setToken(storedToken);
          setCurrentUser(storedUser);
        }
      } finally {
        setIsInitializing(false);
      }
    };
    restoreSession();
  }, []);

  // Rejestracja push tokena i wysyłka do bazy po zalogowaniu / odzyskaniu sesji
  useEffect(() => {
    if (!token) return;

    const setupPushNotifications = async () => {
      try {
        const pushToken = await registerForPushNotificationsAsync();
        if (pushToken) {
          await updatePushToken(token, pushToken);
        }
      } catch (error) {
        console.error('Błąd podczas konfigurowania powiadomień push:', error);
      }
    };

    setupPushNotifications();
  }, [token]);

  const handleLoginSuccess = async (user: CurrentUser) => {
    const storedToken = await getToken();
    setToken(storedToken);
    setCurrentUser(user);
  };

  const handleLogout = async () => {
    await removeToken();
    setToken(null);
    setCurrentUser(null);
    setActiveGroup(null);
  };

  useEffect(() => {
    setOnUnauthorizedHandler(handleLogout);
    return () => setOnUnauthorizedHandler(null);
  }, []);

  if (isInitializing) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  if (!token || !currentUser) {
    return <AuthScreen onLoginSuccess={handleLoginSuccess} />;
  }

  if (activeGroup) {
    return (
      <GroupDetailScreen
        token={token}
        currentUser={currentUser}
        group={activeGroup}
        onBack={() => setActiveGroup(null)}
      />
    );
  }

  return (
    <LobbyListScreen
      token={token}
      currentUser={currentUser}
      onSelectGroup={setActiveGroup}
      onLogout={handleLogout}
    />
  );
}

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics} style={styles.container}>
      <MainApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  loading: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
});