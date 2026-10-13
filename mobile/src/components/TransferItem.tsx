import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { Transfer } from '../types';
import { showAlert } from '../utils/alert';

interface TransferItemProps {
  transfer: Transfer;
  senderName: string;
  receiverName: string;
  receiverPhone?: string | null;
  currentUserId?: number;
  onDecision: (decision: 'confirm' | 'reject') => void;
  onDelete: () => void;
}

export default function TransferItem({
  transfer,
  senderName,
  receiverName,
  receiverPhone,
  currentUserId,
  onDecision,
  onDelete,
}: TransferItemProps) {
  const isSender = transfer.sender_id === currentUserId;
  const isReceiver = transfer.receiver_id === currentUserId;
  const pending = transfer.status === 'pending';

  const handleCopyPhone = async () => {
    if (!receiverPhone) return;
    await Clipboard.setStringAsync(receiverPhone);
    showAlert('Skopiowano', `Numer ${receiverPhone} został skopiowany do schowka.`);
  };

  const itemStyle = pending
    ? styles.pending
    : transfer.status === 'confirmed'
    ? styles.confirmed
    : styles.rejected;

  const statusStyle = pending
    ? styles.pendingStatus
    : transfer.status === 'confirmed'
    ? styles.confirmedStatus
    : styles.rejectedStatus;

  return (
    <View style={itemStyle}>
      <View style={styles.header}>
        <Text style={statusStyle}>
          {transfer.status === 'pending' ? 'OCZEKUJĄCY' : transfer.status === 'confirmed' ? 'POTWIERDZONY' : 'ODRZUCONY'}
        </Text>
        {isSender && pending && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() =>
              showAlert('Usuń deklarację', 'Czy na pewno chcesz usunąć tę deklarację przelewu?', [
                { text: 'Anuluj', style: 'cancel' },
                { text: 'Usuń', style: 'destructive', onPress: onDelete },
              ])
            }
          >
            <Text style={styles.deleteText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.people}>
        {senderName} → {receiverName}
      </Text>

      {isSender && receiverPhone && (
        <TouchableOpacity style={styles.phoneBadge} onPress={handleCopyPhone}>
          <Text style={styles.phoneText}>BLIK: {receiverPhone} (kliknij, by skopiować)</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.amount}>{(transfer.amount / 100).toFixed(2)} PLN</Text>
      <Text style={styles.date}>{new Date(transfer.created_at).toLocaleString('pl-PL')}</Text>

      {isReceiver && pending && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.confirm} onPress={() => onDecision('confirm')}>
            <Text style={styles.actionText}>Potwierdź</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reject} onPress={() => onDecision('reject')}>
            <Text style={styles.actionText}>Odrzuć</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pending: { backgroundColor: '#1e293b', borderColor: '#f59e0b', borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8 },
  confirmed: { backgroundColor: '#14532d', borderColor: '#22c55e', borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8 },
  rejected: { backgroundColor: '#450a0a', borderColor: '#ef4444', borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pendingStatus: { color: '#fbbf24', fontSize: 10, fontWeight: '800' },
  confirmedStatus: { color: '#86efac', fontSize: 10, fontWeight: '800' },
  rejectedStatus: { color: '#f87171', fontSize: 10, fontWeight: '800' },
  deleteButton: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#7f1d1d', alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#fecaca', fontSize: 14, fontWeight: '800' },
  people: { color: '#f8fafc', fontSize: 15, fontWeight: '700', marginTop: 6 },
  phoneBadge: { backgroundColor: '#0f172a', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, marginTop: 4, alignSelf: 'flex-start' },
  phoneText: { color: '#38bdf8', fontSize: 12, fontWeight: '600' },
  amount: { color: '#f8fafc', fontSize: 17, fontWeight: '800', marginTop: 4 },
  date: { color: '#94a3b8', fontSize: 11, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  confirm: { flex: 1, backgroundColor: '#16a34a', paddingVertical: 9, borderRadius: 6, alignItems: 'center' },
  reject: { flex: 1, backgroundColor: '#dc2626', paddingVertical: 9, borderRadius: 6, alignItems: 'center' },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});