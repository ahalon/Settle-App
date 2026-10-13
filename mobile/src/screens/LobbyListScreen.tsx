import React, { useEffect, useState } from 'react';
import {
  Keyboard,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { removeToken } from '../../authStorage';
import { createGroup, getGroupBalance, getGroups, joinGroup } from '../services/api';
import { CurrentUser, DashboardAction, Group } from '../types';
import { showAlert } from '../utils/alert';
import { getErrorMessage } from '../utils/errorHandler';

interface LobbyListScreenProps {
  token: string;
  currentUser: CurrentUser;
  onSelectGroup: (group: Group) => void;
  onLogout: () => void;
}

export default function LobbyListScreen({ token, currentUser, onSelectGroup, onLogout }: LobbyListScreenProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [action, setAction] = useState<DashboardAction>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadGroups = async () => {
    try {
      const response = await getGroups(token);
      const groupsWithBalances = await Promise.all(response.data.map(async (group) => {
        try {
          const balance = await getGroupBalance(group.id, token);
          return { ...group, balanceSummary: balance.data.summary, balanceCents: balance.data.my_net_balance };
        } catch {
          return group;
        }
      }));
      setGroups(groupsWithBalances);
    } catch (err: any) {
      showAlert('Błąd', getErrorMessage(err, 'Nie udało się pobrać grup'));
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadGroups();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { loadGroups(); }, [token]);

  const handleCreate = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setLoading(true);
    try {
      const response = await createGroup(token, { name });
      setNewGroupName('');
      setAction(null);
      await loadGroups();
      onSelectGroup(response.data);
    } catch (err: any) {
      showAlert('Błąd', getErrorMessage(err, 'Nie udało się stworzyć grupy'));
    } finally { setLoading(false); }
  };

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setLoading(true);
    try {
      const response = await joinGroup(token, { join_code: code });
      setJoinCode('');
      setAction(null);
      await loadGroups();
      onSelectGroup(response.data);
    } catch (err: any) {
      showAlert('Błąd', getErrorMessage(err, 'Nieprawidłowy kod'));
    } finally { setLoading(false); }
  };

  const balanceStyle = (value?: number) => value === undefined || value === 0 ? styles.groupCardNeutral : value < 0 ? styles.groupCardOwed : styles.groupCardDue;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.userBar}>
        <Text style={styles.userGreeting}>Cześć, {currentUser.name}!</Text>
        <TouchableOpacity onPress={async () => { await removeToken(); onLogout(); }} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Wyloguj</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        alwaysBounceVertical
        bounces
        overScrollMode="always"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#38bdf8"
            colors={['#38bdf8']}
          />
        }
      >
        <View style={styles.dashboardActions}>
          <TouchableOpacity style={[styles.dashboardAction, styles.createAction]} onPress={() => setAction(action === 'create' ? null : 'create')}>
            <Text style={styles.actionIcon}>＋</Text><Text style={styles.actionTitle}>Utwórz lobby</Text><Text style={styles.actionHint}>Stwórz nowe miejsce dla grupy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.dashboardAction, styles.joinAction]} onPress={() => setAction(action === 'join' ? null : 'join')}>
            <Text style={styles.actionIcon}>⌁</Text><Text style={styles.actionTitle}>Dołącz po kodzie</Text><Text style={styles.actionHint}>Wpisz kod otrzymany od grupy</Text>
          </TouchableOpacity>
        </View>
        {action === 'create' && <View style={styles.card}><Text style={styles.cardTitle}>Utwórz nowe lobby</Text><TextInput style={styles.input} placeholder="Nazwa (np. Mieszkanie Kraków)" placeholderTextColor="#64748b" value={newGroupName} onChangeText={setNewGroupName} /><TouchableOpacity style={styles.actionBtn} onPress={handleCreate} disabled={loading}><Text style={styles.actionBtnText}>Stwórz lobby</Text></TouchableOpacity></View>}
        {action === 'join' && <View style={styles.card}><Text style={styles.cardTitle}>Dołącz po kodzie</Text><TextInput style={styles.input} placeholder="Wpisz 6-znakowy kod" placeholderTextColor="#64748b" autoCapitalize="characters" value={joinCode} onChangeText={setJoinCode} /><TouchableOpacity style={[styles.actionBtn, styles.secondaryBtn]} onPress={handleJoin} disabled={loading}><Text style={styles.actionBtnText}>Dołącz do ekipy</Text></TouchableOpacity></View>}
        <Text style={styles.activeTitle}>Twoje aktywne lobby</Text>
        {groups.map((group) => <TouchableOpacity key={group.id} style={[styles.groupCard, balanceStyle(group.balanceCents)]} onPress={() => onSelectGroup(group)}><View><Text style={styles.groupName}>{group.name}</Text><Text style={styles.groupMeta}>Członków: {group.members?.length || 1} • Kod: {group.join_code}</Text><Text style={styles.groupBalance}>Saldo: {group.balanceSummary || 'Brak danych'}</Text></View><Text style={styles.arrow}>→</Text></TouchableOpacity>)}
        {!groups.length && <Text style={styles.emptyText}>Nie należysz jeszcze do żadnego lobby.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingHorizontal: 16 },
  scrollContent: { paddingBottom: 24, flexGrow: 1 },
  userBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 8 },
  userGreeting: { color: '#f8fafc', fontSize: 18, fontWeight: '700' },
  logoutBtn: { paddingVertical: 5, paddingHorizontal: 10, backgroundColor: '#334155', borderRadius: 6 },
  logoutText: { color: '#ef4444', fontSize: 12, fontWeight: '600' },
  dashboardActions: { gap: 10, marginBottom: 20 },
  dashboardAction: { minHeight: 78, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
  createAction: { backgroundColor: '#f59e0b', borderColor: '#fbbf24' },
  joinAction: { backgroundColor: '#0284c7', borderColor: '#38bdf8' },
  actionIcon: { position: 'absolute', right: 16, top: 12, color: '#f8fafc', fontSize: 24, fontWeight: '800' },
  actionTitle: { color: '#f8fafc', fontSize: 17, fontWeight: '800' },
  actionHint: { color: '#e0f2fe', fontSize: 12, marginTop: 3 },
  card: { backgroundColor: '#1e293b', padding: 14, borderRadius: 10, marginBottom: 12 },
  cardTitle: { color: '#f8fafc', fontSize: 15, fontWeight: '700', marginBottom: 8 },
  input: {
    backgroundColor: '#334155',
    color: '#f8fafc',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    fontSize: 14,
    userSelect: 'text',
  },
  actionBtn: { backgroundColor: '#2563eb', paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  secondaryBtn: { backgroundColor: '#0284c7' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  activeTitle: { color: '#f8fafc', fontSize: 20, fontWeight: '800', marginBottom: 10 },
  groupCard: { padding: 14, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderWidth: 1 },
  groupCardNeutral: { backgroundColor: '#1e293b', borderColor: '#334155' },
  groupCardOwed: { backgroundColor: '#451a1a', borderColor: '#ef4444' },
  groupCardDue: { backgroundColor: '#14532d', borderColor: '#22c55e' },
  groupName: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  groupMeta: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  groupBalance: { color: '#38bdf8', fontSize: 11, fontWeight: '600', marginTop: 4 },
  arrow: { color: '#38bdf8', fontSize: 20, fontWeight: '700' },
  emptyText: { color: '#64748b', textAlign: 'center', marginTop: 14, fontSize: 13 },
});
