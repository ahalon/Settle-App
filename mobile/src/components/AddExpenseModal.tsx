import React, { useState } from 'react';
import {
  Alert,
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

import { CurrentUser, Group } from '../types';
import ReceiptPicker from './ReceiptPicker';

interface AddExpenseModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    title: string;
    amountCents: number;
    payerId: number;
    description: string | null;
    receiptImage: string | null;
  }) => Promise<void>;
  group: Group;
  currentUser: CurrentUser;
  loading: boolean;
}

export default function AddExpenseModal({
  visible,
  onClose,
  onSubmit,
  group,
  currentUser,
  loading,
}: AddExpenseModalProps) {
  const [selectedPayerId, setSelectedPayerId] = useState<number>(currentUser.id);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [receiptImage, setReceiptImage] = useState<string | null>(null);

  const resetForm = () => {
    setTitle('');
    setAmount('');
    setDescription('');
    setReceiptImage(null);
    setSelectedPayerId(currentUser.id);
  };

  const handleClose = () => {
    Keyboard.dismiss();
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!title.trim() || !amount.trim() || !selectedPayerId) {
      Alert.alert('Błąd', 'Wypełnij wszystkie pola wydatku');
      return;
    }
    const amountInCents = Math.round(parseFloat(amount.replace(',', '.')) * 100);
    if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
      Alert.alert('Błąd', 'Wpisz poprawną kwotę');
      return;
    }

    await onSubmit({
      title: title.trim(),
      amountCents: amountInCents,
      payerId: selectedPayerId,
      description: description.trim() || null,
      receiptImage,
    });
    resetForm();
  };

  const isWeb = Platform.OS === 'web';

  const modalBody = (
    <View style={styles.modalContentWrapper}>
      <View style={styles.formModalSheet}>
        <View style={styles.modalHeaderBar}>
          <Text style={styles.modalSheetTitle}>Nowy wydatek</Text>
          <TouchableOpacity style={styles.sheetCloseBtn} onPress={handleClose}>
            <Text style={styles.sheetCloseText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.subLabel}>Kto zapłacił?</Text>
          <View style={styles.payerSelector}>
            {group.members.map((member) => (
              <TouchableOpacity
                key={member.id}
                style={[
                  styles.payerOption,
                  selectedPayerId === member.id && styles.payerOptionActive,
                ]}
                onPress={() => setSelectedPayerId(member.id)}
              >
                <Text
                  style={[
                    styles.payerOptionText,
                    selectedPayerId === member.id && styles.payerOptionTextActive,
                  ]}
                >
                  {member.id === currentUser.id ? 'Ja' : member.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.input}
            placeholder="Tytuł wydatku (np. Zakupy Biedronka)"
            placeholderTextColor="#64748b"
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={styles.input}
            placeholder="Kwota (PLN)"
            placeholderTextColor="#64748b"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />
          <TextInput
            style={[styles.input, styles.descriptionInput]}
            placeholder="Opis (opcjonalnie)"
            placeholderTextColor="#64748b"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          <ReceiptPicker imageUri={receiptImage} onChange={setReceiptImage} />

          <TouchableOpacity style={styles.actionBtn} onPress={handleSubmit} disabled={loading}>
            <Text style={styles.actionBtnText}>
              {loading ? 'Zapisywanie...' : 'Zapisz wydatek'}
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
  subLabel: { color: '#94a3b8', fontSize: 12, marginBottom: 6, fontWeight: '600' },
  payerSelector: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  payerOption: { flex: 1, backgroundColor: '#334155', paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  payerOptionActive: { backgroundColor: '#2563eb' },
  payerOptionText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  payerOptionTextActive: { color: '#fff' },
  input: {
    backgroundColor: '#334155',
    color: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 15,
    userSelect: 'text',
  },
  descriptionInput: { minHeight: 72 },
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