import { Alert as RNAlert, Platform } from 'react-native';

export interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export const showAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[]
) => {
  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;

    if (buttons && buttons.length > 1) {
      const confirmBtn =
        buttons.find((b) => b.style !== 'cancel') || buttons[buttons.length - 1];
      const cancelBtn = buttons.find((b) => b.style === 'cancel');

      if (typeof window !== 'undefined' && window.confirm(text)) {
        if (confirmBtn?.onPress) confirmBtn.onPress();
      } else {
        if (cancelBtn?.onPress) cancelBtn.onPress();
      }
      return;
    }

    if (typeof window !== 'undefined') {
      window.alert(text);
    }
    const singleBtn = buttons && buttons[0];
    if (singleBtn?.onPress) {
      singleBtn.onPress();
    }
    return;
  }

  RNAlert.alert(title, message, buttons);
};

