import React, { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { saveToken, saveUserData } from '../../authStorage';
import { login, register } from '../services/api';
import { CurrentUser } from '../types';
import { showAlert } from '../utils/alert';
import { getErrorMessage } from '../utils/errorHandler';

interface AuthScreenProps {
  onLoginSuccess: (user: CurrentUser) => void;
}

export default function AuthScreen({ onLoginSuccess }: AuthScreenProps) {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);

  const handleSubmit = async () => {
    Keyboard.dismiss();
    setStatusMessage(null);
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const cleanPhone = phone.replace(/\D/g, '');

    if (!trimmedEmail || !password || (!isLoginMode && (!trimmedName || !cleanPhone))) {
      const msg = 'Uzupełnij wszystkie wymagane pola';
      setStatusMessage({ type: 'error', text: msg });
      showAlert('Błąd', msg);
      return;
    }

    if (!isLoginMode && cleanPhone.length !== 9) {
      const msg = 'Numer telefonu musi składać się z dokładnie 9 cyfr';
      setStatusMessage({ type: 'error', text: msg });
      showAlert('Błąd', msg);
      return;
    }

    setLoading(true);
    try {
      if (isLoginMode) {
        // FLOW LOGOWANIA
        const response = await login({ email: trimmedEmail, password });
        const { access_token, user_id, name: userName, phone_number } = response.data;
        const user: CurrentUser = {
          id: user_id,
          name: userName,
          phone_number: phone_number ?? (cleanPhone || null),
        };

        await saveToken(access_token);
        await saveUserData(user);
        onLoginSuccess(user);
      } else {
        // FLOW REJESTRACJI (wymaga potwierdzenia maila)
        await register({
          name: trimmedName,
          email: trimmedEmail,
          password,
          phone_number: cleanPhone,
        });

        const successText =
          'Wysłaliśmy link weryfikacyjny na Twój adres e-mail. Sprawdź skrzynkę (oraz folder SPAM), kliknij link, a następnie zaloguj się.';
        setStatusMessage({ type: 'success', text: successText });

        showAlert('Konto utworzone!', successText, [
          {
            text: 'OK',
            onPress: () => {
              setPassword('');
              setIsLoginMode(true);
            },
          },
        ]);
      }
    } catch (err: any) {
      const errMsg = getErrorMessage(err, 'Wystąpił błąd autoryzacji');
      setStatusMessage({ type: 'error', text: errMsg });
      showAlert('Błąd', errMsg);
    } finally {
      setLoading(false);
    }
  };

  const isWeb = Platform.OS === 'web';

  const formContent = (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps={isWeb ? 'always' : 'handled'}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerBox}>
        <Text style={styles.title}>SettleApp</Text>
        <Text style={styles.subtitle}>
          {isLoginMode ? 'Zaloguj się do swojego konta' : 'Załóż nowe konto'}
        </Text>
      </View>

      <View style={styles.card}>
        {!isLoginMode && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Twoje imię"
              placeholderTextColor="#64748b"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              blurOnSubmit={false}
              pointerEvents="auto"
            />
            <TextInput
              style={styles.input}
              placeholder="Numer telefonu (9 cyfr)"
              placeholderTextColor="#64748b"
              keyboardType="number-pad"
              maxLength={9}
              value={phone}
              onChangeText={(val) => setPhone(val.replace(/\D/g, ''))}
              blurOnSubmit={false}
              pointerEvents="auto"
            />
          </>
        )}

        <TextInput
          style={styles.input}
          placeholder="Adres e-mail"
          placeholderTextColor="#64748b"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          blurOnSubmit={false}
          pointerEvents="auto"
        />

        <TextInput
          style={styles.input}
          placeholder="Hasło"
          placeholderTextColor="#64748b"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          pointerEvents="auto"
        />

        {statusMessage && (
          <View
            style={[
              styles.statusBox,
              statusMessage.type === 'error' ? styles.statusBoxError : styles.statusBoxSuccess,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                statusMessage.type === 'error' ? styles.statusTextError : styles.statusTextSuccess,
              ]}
            >
              {statusMessage.text}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.mainButton}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.mainButtonText}>
              {isLoginMode ? 'Zaloguj się' : 'Zarejestruj'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => {
            Keyboard.dismiss();
            setStatusMessage(null);
            setIsLoginMode((value) => !value);
          }}
        >
          <Text style={styles.switchButtonText}>
            {isLoginMode ? 'Nie masz jeszcze konta? Zarejestruj się' : 'Masz już konto? Zaloguj się'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  if (isWeb) {
    return <SafeAreaView style={styles.safeArea}>{formContent}</SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          {formContent}
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0f172a' },
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerBox: { marginBottom: 24 },
  title: { fontSize: 36, fontWeight: '800', color: '#f8fafc', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#94a3b8', textAlign: 'center' },
  card: {
    backgroundColor: '#1e293b',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  input: {
    backgroundColor: '#334155',
    color: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
    fontSize: 15,
    userSelect: 'text',
  },
  mainButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  mainButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  switchButton: { marginTop: 16, alignItems: 'center' },
  switchButtonText: { color: '#38bdf8', fontSize: 13 },
  statusBox: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 14,
    borderWidth: 1,
  },
  statusBoxError: {
    backgroundColor: '#451a1a',
    borderColor: '#b91c1c',
  },
  statusBoxSuccess: {
    backgroundColor: '#064e3b',
    borderColor: '#059669',
  },
  statusText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  statusTextError: {
    color: '#fca5a5',
  },
  statusTextSuccess: {
    color: '#6ee7b7',
  },
});