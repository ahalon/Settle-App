import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Keyboard,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import {
  addExpense,
  declareTransfer,
  decideTransfer,
  deleteExpense,
  deleteTransfer,
  getGroupBalance,
  getGroupExpenses,
  getGroupTransfers,
  getMonthlySummary,
} from '../services/api';
import {
  BalanceResponse,
  CurrentUser,
  Expense,
  Group,
  LobbyTab,
  MonthlySummaryResponse,
  SettlementSuggestion,
  Transfer,
} from '../types';
import { showAlert } from '../utils/alert';
import { getErrorMessage } from '../utils/errorHandler';
import AddExpenseModal from '../components/AddExpenseModal';
import DeclareTransferModal from '../components/DeclareTransferModal';
import ExpenseDetailsModal from '../components/ExpenseDetailsModal';
import ExpenseItem from '../components/ExpenseItem';
import MonthlySummaryCard from '../components/MonthlySummaryCard';
import TransferItem from '../components/TransferItem';

interface GroupDetailScreenProps {
  token: string;
  currentUser: CurrentUser;
  group: Group;
  onBack: () => void;
}

const getInitialMonth = () => {
  const date = new Date();
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
};

export default function GroupDetailScreen({ token, currentUser, group, onBack }: GroupDetailScreenProps) {
  const initialMonth = getInitialMonth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummaryResponse | null>(null);
  const [year, setYear] = useState(initialMonth.year);
  const [month, setMonth] = useState(initialMonth.month);
  const [activeTab, setActiveTab] = useState<LobbyTab>('expenses');

  // Modale
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  // Stan formularza spłaty
  const [transferRecipientId, setTransferRecipientId] = useState<number | null>(null);
  const [transferAmount, setTransferAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const getMemberById = (id: number) => group.members.find((member) => member.id === id);

  const getPayerName = (payerId: number) => {
    if (payerId === currentUser.id) return 'Ty';
    return getMemberById(payerId)?.name || `ID: ${payerId}`;
  };

  const loadDetails = async () => {
    try {
      const [expenseResponse, balanceResponse, transferResponse, summaryResponse] = await Promise.all([
        getGroupExpenses(group.id, token, year, month),
        getGroupBalance(group.id, token),
        getGroupTransfers(group.id, token),
        getMonthlySummary(group.id, token, year, month),
      ]);
      setExpenses(expenseResponse.data);
      setBalance(balanceResponse.data);
      setTransfers(transferResponse.data);
      setMonthlySummary(summaryResponse.data);

      const userSettlements = balanceResponse.data.suggested_settlements?.filter(
        (s) => s.from_user_id === currentUser.id
      );
      if (userSettlements && userSettlements.length > 0) {
        setTransferRecipientId((current) => current || userSettlements[0].to_user_id);
        setTransferAmount((current) => current || (userSettlements[0].amount_cents / 100).toFixed(2));
      } else {
        const creditor = group.members.find(
          (member) => (balanceResponse.data.all_balances?.[String(member.id)] || 0) > 0
        );
        setTransferRecipientId((current) => current || creditor?.id || null);
      }
    } catch (err: any) {
      showAlert('Błąd', getErrorMessage(err, 'Nie udało się pobrać danych grupy'));
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadDetails();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [group.id, token, year, month]);

  const handleCopyCode = async () => {
    await Clipboard.setStringAsync(group.join_code);
    showAlert('Skopiowano', `Kod "${group.join_code}" został skopiowany do schowka.`);
  };

  const handleSelectSuggestedSettlement = (settlement: SettlementSuggestion) => {
    setTransferRecipientId(settlement.to_user_id);
    setTransferAmount((settlement.amount_cents / 100).toFixed(2));
    if (settlement.to_user_phone) {
      Clipboard.setStringAsync(settlement.to_user_phone);
    }
    setIsTransferModalOpen(true);
  };

  const handleAddExpenseSubmit = async (payload: {
    title: string;
    amountCents: number;
    payerId: number;
    description: string | null;
    receiptImage: string | null;
  }) => {
    setLoading(true);
    try {
      await addExpense(token, {
        title: payload.title,
        amount: payload.amountCents,
        payer_id: payload.payerId,
        group_id: group.id,
        description: payload.description,
        receipt_image: payload.receiptImage,
      });
      setIsExpenseModalOpen(false);
      Keyboard.dismiss();
      await loadDetails();
    } catch (err: any) {
      showAlert('Błąd', getErrorMessage(err, 'Nie udało się zapisać wydatku'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExpense = (expenseId: number) => {
    showAlert('Usuń wydatek', 'Czy na pewno chcesz usunąć ten wydatek?', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await deleteExpense(token, expenseId);
            await loadDetails();
          } catch (err: any) {
            showAlert('Błąd', getErrorMessage(err, 'Nie udało się usunąć wydatku'));
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const handleDeclareTransferSubmit = async () => {
    if (!transferRecipientId || !transferAmount.trim()) {
      showAlert('Błąd', 'Wybierz odbiorcę i wpisz kwotę przelewu');
      return;
    }
    const cents = Math.round(parseFloat(transferAmount.replace(',', '.')) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      showAlert('Błąd', 'Wpisz poprawną kwotę przelewu');
      return;
    }
    setLoading(true);
    try {
      await declareTransfer(group.id, token, { receiver_id: transferRecipientId, amount: cents });
      setTransferAmount('');
      setIsTransferModalOpen(false);
      Keyboard.dismiss();
      await loadDetails();
    } catch (err: any) {
      showAlert('Błąd', getErrorMessage(err, 'Nie udało się zadeklarować przelewu'));
    } finally {
      setLoading(false);
    }
  };

  const handleDecision = async (transferId: number, decision: 'confirm' | 'reject') => {
    setLoading(true);
    try {
      await decideTransfer(token, transferId, decision);
      await loadDetails();
    } catch (err: any) {
      showAlert('Błąd', getErrorMessage(err, 'Nie udało się zmienić statusu przelewu'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTransfer = (transferId: number) => {
    showAlert('Usuń deklarację', 'Czy na pewno chcesz usunąć tę deklarację przelewu?', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await deleteTransfer(token, transferId);
            await loadDetails();
          } catch (err: any) {
            showAlert('Błąd', getErrorMessage(err, 'Nie udało się usunąć deklaracji'));
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const mySettlements = balance?.suggested_settlements?.filter(
    (s) => s.from_user_id === currentUser.id
  ) || [];

  const netBalance = balance?.my_net_balance ?? 0;
  const isPositive = netBalance > 0;
  const isNegative = netBalance < 0;

  const balanceStyle = isPositive
    ? styles.balanceValuePositive
    : isNegative
    ? styles.balanceValueNegative
    : styles.balanceValueZero;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <View style={styles.navBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Wróć</Text>
        </TouchableOpacity>
        <Text style={styles.groupName} numberOfLines={1}>
          {group.name}
        </Text>
      </View>

      <TouchableOpacity style={styles.codeRow} onPress={handleCopyCode} activeOpacity={0.7}>
        <Text style={styles.codeLabel}>KOD DOŁĄCZENIA (KLIKNIJ):</Text>
        <View style={styles.codeBadge}>
          <Text style={styles.codeValue}>{group.join_code}</Text>
        </View>
      </TouchableOpacity>

      <View style={[styles.balanceCard, isPositive && styles.cardPositive, isNegative && styles.cardNegative]}>
        <Text style={styles.balanceLabel}>TWÓJ BILANS W TEJ GRUPIE</Text>
        <Text style={[styles.balanceValue, balanceStyle]}>
          {balance?.summary || 'Ładowanie...'}
        </Text>
      </View>

      <MonthlySummaryCard
        year={year}
        month={month}
        summary={monthlySummary}
        onSelectMonth={(nextYear: number, nextMonth: number) => {
          setYear(nextYear);
          setMonth(nextMonth);
        }}
        groupCreatedAt={group.created_at}
      />

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'expenses' && styles.tabActive]}
          onPress={() => setActiveTab('expenses')}
        >
          <Text style={styles.tabText}>Wydatki</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'transfers' && styles.tabActive]}
          onPress={() => setActiveTab('transfers')}
        >
          <Text style={styles.tabText}>Przelewy</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'transfers' ? (
        <ScrollView
          style={styles.tabScroll}
          contentContainerStyle={styles.tabContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#38bdf8"
              colors={['#38bdf8']}
            />
          }
        >
          {balance?.my_net_balance !== undefined && balance.my_net_balance < 0 && (
            <View style={styles.settlementSection}>
              {mySettlements.length > 0 && (
                <View style={styles.suggestedContainer}>
                  <Text style={styles.sectionTitle}>Sugerowane spłaty</Text>
                  {mySettlements.map((item, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.suggestedBadge}
                      onPress={() => handleSelectSuggestedSettlement(item)}
                    >
                      <View>
                        <Text style={styles.suggestedName}>Spłać: {item.to_user_name}</Text>
                        {item.to_user_phone ? (
                          <Text style={styles.suggestedPhone}>BLIK: {item.to_user_phone} (kliknij)</Text>
                        ) : (
                          <Text style={styles.suggestedPhoneMuted}>Brak numeru BLIK</Text>
                        )}
                      </View>
                      <Text style={styles.suggestedAmount}>{item.amount_pln}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={styles.openTransferBtn}
                onPress={() => setIsTransferModalOpen(true)}
              >
                <Text style={styles.openTransferBtnText}>+ Oddaj pieniądze / Zadeklaruj przelew</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.transferSectionTitle}>Oczekujące</Text>
          {transfers
            .filter((transfer) => transfer.status === 'pending')
            .map((transfer) => {
              const receiver = getMemberById(transfer.receiver_id);
              return (
                <TransferItem
                  key={transfer.id}
                  transfer={transfer}
                  senderName={getPayerName(transfer.sender_id)}
                  receiverName={getPayerName(transfer.receiver_id)}
                  receiverPhone={receiver?.phone_number}
                  currentUserId={currentUser.id}
                  onDecision={(decision) => handleDecision(transfer.id, decision)}
                  onDelete={() => handleDeleteTransfer(transfer.id)}
                />
              );
            })}

          <Text style={styles.transferSectionTitle}>Potwierdzone</Text>
          {transfers
            .filter((transfer) => transfer.status === 'confirmed')
            .map((transfer) => {
              const receiver = getMemberById(transfer.receiver_id);
              return (
                <TransferItem
                  key={transfer.id}
                  transfer={transfer}
                  senderName={getPayerName(transfer.sender_id)}
                  receiverName={getPayerName(transfer.receiver_id)}
                  receiverPhone={receiver?.phone_number}
                  currentUserId={currentUser.id}
                  onDecision={(decision) => handleDecision(transfer.id, decision)}
                  onDelete={() => handleDeleteTransfer(transfer.id)}
                />
              );
            })}

          {transfers.some((transfer) => transfer.status === 'rejected') && (
            <>
              <Text style={styles.transferSectionTitle}>Odrzucone</Text>
              {transfers
                .filter((transfer) => transfer.status === 'rejected')
                .map((transfer) => {
                  const receiver = getMemberById(transfer.receiver_id);
                  return (
                    <TransferItem
                      key={transfer.id}
                      transfer={transfer}
                      senderName={getPayerName(transfer.sender_id)}
                      receiverName={getPayerName(transfer.receiver_id)}
                      receiverPhone={receiver?.phone_number}
                      currentUserId={currentUser.id}
                      onDecision={(decision) => handleDecision(transfer.id, decision)}
                      onDelete={() => handleDeleteTransfer(transfer.id)}
                    />
                  );
                })}
            </>
          )}

          {!transfers.some(
            (transfer) =>
              transfer.status === 'pending' ||
              transfer.status === 'confirmed' ||
              transfer.status === 'rejected'
          ) && <Text style={styles.emptyText}>Brak przelewów</Text>}
        </ScrollView>
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(item) => item.id.toString()}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          renderItem={({ item }) => (
            <ExpenseItem
              expense={item}
              payerName={getPayerName(item.payer_id)}
              currentUserId={currentUser.id}
              onPress={() => setSelectedExpense(item)}
              onDelete={() => handleDeleteExpense(item.id)}
            />
          )}
          ListHeaderComponent={
            <View style={styles.expenseHeaderRow}>
              <TouchableOpacity
                style={styles.openFormBtn}
                onPress={() => setIsExpenseModalOpen(true)}
              >
                <Text style={styles.openFormBtnText}>+ Dodaj wydatek</Text>
              </TouchableOpacity>
              <Text style={styles.sectionTitle}>Wydatki grupy</Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.emptyText}>Brak wydatków w tym miesiącu</Text>}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* WYDZIELONE KOMPONENTY MODALI */}
      <AddExpenseModal
        visible={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        onSubmit={handleAddExpenseSubmit}
        group={group}
        currentUser={currentUser}
        loading={loading}
      />

      <DeclareTransferModal
        visible={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        onSubmit={handleDeclareTransferSubmit}
        group={group}
        currentUser={currentUser}
        recipientId={transferRecipientId}
        onSelectRecipient={setTransferRecipientId}
        amount={transferAmount}
        onChangeAmount={setTransferAmount}
        totalDebtCents={netBalance}
        allBalances={balance?.all_balances}
        loading={loading}
      />

      <ExpenseDetailsModal
        expense={selectedExpense}
        onClose={() => setSelectedExpense(null)}
        getPayerName={getPayerName}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingHorizontal: 16 },
  navBar: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 10, gap: 12 },
  backBtn: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#334155', borderRadius: 6 },
  backText: { color: '#38bdf8', fontSize: 13, fontWeight: '600' },
  groupName: { color: '#f8fafc', fontSize: 18, fontWeight: '700', flex: 1 },

  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e293b',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  codeLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  codeBadge: { backgroundColor: '#0f172a', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#38bdf8' },
  codeValue: { color: '#38bdf8', fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },

  balanceCard: {
    backgroundColor: '#1e293b',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  cardPositive: { borderColor: '#16a34a' },
  cardNegative: { borderColor: '#dc2626' },
  balanceLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  balanceValue: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  balanceValuePositive: { color: '#4ade80' },
  balanceValueNegative: { color: '#f87171' },
  balanceValueZero: { color: '#94a3b8' },

  tabs: { flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 8, padding: 4, marginBottom: 10 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 6 },
  tabActive: { backgroundColor: '#2563eb' },
  tabText: { color: '#f8fafc', fontSize: 13, fontWeight: '700' },
  listContent: { paddingBottom: 40 },
  expenseHeaderRow: { marginBottom: 10 },
  openFormBtn: {
    backgroundColor: '#f59e0b',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  openFormBtnText: { color: '#0f172a', fontSize: 16, fontWeight: '800' },

  settlementSection: { marginBottom: 14 },
  openTransferBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  openTransferBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },

  sectionTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: '#64748b', textAlign: 'center', marginTop: 14, fontSize: 13 },
  tabScroll: { flex: 1 },
  tabContent: { paddingBottom: 60 },

  suggestedContainer: { marginBottom: 12 },
  suggestedBadge: {
    backgroundColor: '#0f172a',
    borderWidth: 1.5,
    borderColor: '#38bdf8',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  suggestedName: { color: '#f8fafc', fontWeight: '700', fontSize: 14 },
  suggestedPhone: { color: '#38bdf8', fontSize: 12, marginTop: 2, fontWeight: '600' },
  suggestedPhoneMuted: { color: '#64748b', fontSize: 11, marginTop: 2 },
  suggestedAmount: { color: '#4ade80', fontWeight: '800', fontSize: 15 },

  transferSectionTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '800', marginTop: 12, marginBottom: 8 },
});