import React from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { CurrentUser, Group } from '../types';
import { showAlert } from '../utils/alert';

interface DeclareTransferModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  group: Group;
  currentUser: CurrentUser;
  recipientId: number | null;
  onSelectRecipient: (id: number) => void;
  amount: string;
  onChangeAmount: (val: string) => void;
  totalDebtCents: number;
  allBalances?: Record<string, number>;
  loading: boolean;
}

export default function DeclareTransferModal({
  visible,
  onClose,
  onSubmit,
  group,
  currentUser,
  recipientId,
  onSelectRecipient,
  amount,
  onChangeAmount,
  totalDebtCents,
  allBalances,
  loading,
}: DeclareTransferModalProps) {
  const selectedRecipientUser = recipientId
    ? group.members.find((m) => m.id === recipientId)
    : null;

  const handleCopyBLIK = async (phone: string) => {
    await Clipboard.setStringAsync(phone);
    showAlert('Skopiowano', `Numer BLIK: ${phone} w schowku.`);
  };

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  const isWeb = Platform.OS === 'web';

  const modalBody = (
    <View style={styles.modalContentWrapper}>
      <View style={styles.formModalSheet}>
        <View style={styles.modalHeaderBar}>
          <Text style={styles.modalSheetTitle}>Oddaj pieniądze</Text>
          <TouchableOpacity style={styles.sheetCloseBtn} onPress={handleClose}>
            <Text style={styles.sheetCloseText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.transferHint}>
            Twój łączny dług: {(Math.abs(totalDebtCents) / 100).toFixed(2)} PLN
          </Text>

          <Text style={styles.subLabel}>Komu oddajesz?</Text>
          <View style={styles.transferRecipients}>
            {group.members
              .filter(
                (member) =>
                  member.id !== currentUser.id &&
                  (allBalances?.[String(member.id)] || 0) > 0
              )
              .map((member) => (
                <TouchableOpacity
                  key={member.id}
                  style={[
                    styles.transferRecipient,
                    recipientId === member.id && styles.transferRecipientActive,
                  ]}
                  onPress={() => onSelectRecipient(member.id)}
                >
                  <Text style={styles.transferRecipientText}>{member.name}</Text>
                </TouchableOpacity>
              ))}
          </View>

          {selectedRecipientUser?.phone_number && (
            <TouchableOpacity
              style={styles.blikBadge}
              onPress={() => handleCopyBLIK(selectedRecipientUser.phone_number!)}
            >
              <Text style={styles.blikBadgeText}>
                BLIK do {selectedRecipientUser.name}: {selectedRecipientUser.phone_number} (kopiuj)
              </Text>
            </TouchableOpacity>
          )}

          <Text style={styles.subLabel}>Kwota przelewu (PLN)</Text>
          <TextInput
            style={styles.input}
            placeholder="np. 50.00"
            placeholderTextColor="#64748b"
            keyboardType="numeric"
            value={amount}
            onChangeText={onChangeAmount}
          />

          <TouchableOpacity style={styles.actionBtn} onPress={onSubmit} disabled={loading}>
            <Text style={styles.actionBtnText}>
              {loading ? 'Wysyłanie...' : 'Zadeklaruj przelew'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalBackdrop}
      >
        {isWeb ? (
          modalBody
        ) : (
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            {modalBody}
          </TouchableWithoutFeedback>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.7)', justifyContent: 'flex-end' },
  modalContentWrapper: { flex: 1, justifyContent: 'flex-end' },
  formModalSheet: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalSheetTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '800' },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseText: { color: '#f8fafc', fontSize: 15, fontWeight: '700' },
  transferHint: { color: '#94a3b8', fontSize: 13, marginBottom: 12 },
  subLabel: { color: '#94a3b8', fontSize: 12, marginBottom: 6, fontWeight: '600' },
  transferRecipients: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  transferRecipient: { backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  transferRecipientActive: { backgroundColor: '#2563eb' },
  transferRecipientText: { color: '#f8fafc', fontSize: 13, fontWeight: '700' },
  blikBadge: { backgroundColor: '#0284c7', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, marginBottom: 12, alignItems: 'center' },
  blikBadgeText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  input: {
    backgroundColor: '#334155',
    color: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 15,
    userSelect: 'text',
  },
  actionBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});