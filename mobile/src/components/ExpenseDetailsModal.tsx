import React from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Expense } from '../types';

interface ExpenseDetailsModalProps {
  expense: Expense | null;
  onClose: () => void;
  getPayerName: (payerId: number) => string;
}

export default function ExpenseDetailsModal({
  expense,
  onClose,
  getPayerName,
}: ExpenseDetailsModalProps) {
  if (!expense) return null;

  return (
    <Modal visible={expense !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.detailsCard}>
          <View style={styles.detailsHeader}>
            <Text style={styles.detailsTitle}>Szczegóły wydatku</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.detailsExpenseTitle}>{expense.title}</Text>
            <Text style={styles.detailsAmount}>{(expense.amount / 100).toFixed(2)} PLN</Text>
            <Text style={styles.detailsLabel}>Płatnik</Text>
            <Text style={styles.detailsValue}>{getPayerName(expense.payer_id)}</Text>
            <Text style={styles.detailsLabel}>Data</Text>
            <Text style={styles.detailsValue}>
              {new Date(expense.created_at).toLocaleString('pl-PL')}
            </Text>
            <Text style={styles.detailsLabel}>Opis</Text>
            <Text style={styles.detailsValue}>{expense.description || 'Brak opisu'}</Text>
            {expense.receipt_image && (
              <>
                <Text style={styles.detailsLabel}>Paragon</Text>
                <Image source={{ uri: expense.receipt_image }} style={styles.detailsImage} />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.8)', justifyContent: 'center', padding: 20 },
  detailsCard: { maxHeight: '85%', backgroundColor: '#1e293b', borderRadius: 12, padding: 18, borderWidth: 1, borderColor: '#475569' },
  detailsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  detailsTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '800' },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  detailsExpenseTitle: { color: '#f8fafc', fontSize: 20, fontWeight: '800' },
  detailsAmount: { color: '#fbbf24', fontSize: 18, fontWeight: '800', marginTop: 4, marginBottom: 16 },
  detailsLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '700', marginTop: 10, textTransform: 'uppercase' },
  detailsValue: { color: '#f8fafc', fontSize: 14, marginTop: 3 },
  detailsImage: { width: '100%', height: 220, resizeMode: 'cover', borderRadius: 8, marginTop: 6 },
});