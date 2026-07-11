import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  SectionList,
  Alert,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchOrgMembers, fetchCamps, callAdminAPI, updateOrgMember } from '../../lib/supabase';
import { randomPassword } from '../../lib/utils';
import { showError, showSuccess } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import Badge from '../../components/ui/Badge';
import colors from '../../theme/colors';

// ── إعداد الأدوار (نفس ألوان/ترتيب الأصل) ─────────────────
const ROLE_CONFIG = {
  platform_owner: { icon: '👑', color: colors.accent, label: 'مالك المنصة' },
  super_admin: { icon: '🔴', color: colors.red, label: 'مدير الإيواء' },
  camp_delegate: { icon: '🟠', color: colors.accent, label: 'مندوب مخيم' },
  assistant: { icon: '🟡', color: colors.blue, label: 'مساعد' },
};
const ROLE_ORDER = ['platform_owner', 'super_admin', 'camp_delegate', 'assistant'];

export default function UsersListScreen() {
  const navigation = useNavigation();
  const { profile, orgId, isOwner, isSuperAdmin } = useAuth();
  const { getVisibleCamps } = useDataScope();

  const [users, setUsers] = useState([]);
  const [camps, setCamps] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    const [usersData, campsData] = await Promise.all([fetchOrgMembers(orgId), fetchCamps(orgId)]);
    setUsers(usersData);
    setCamps(campsData);
    setLoading(false);
    setRefreshing(false);
  }, [orgId]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const campMap = useMemo(() => {
    const map = {};
    getVisibleCamps(camps).forEach((c) => { map[c.id] = c.name; });
    camps.forEach((c) => { if (!map[c.id]) map[c.id] = c.name; });
    return map;
  }, [camps, getVisibleCamps]);

  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.trim().toLowerCase();
    return users.filter(
      (u) =>
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.national_id || '').includes(q) ||
        (u.phone || '').includes(q)
    );
  }, [users, search]);

  // ── تجميع حسب الدور (بترتيب هرمي مبسّط) ────────────────
  const sections = useMemo(() => {
    return ROLE_ORDER.map((role) => ({
      title: role,
      data: filtered.filter((u) => u.role === role),
    })).filter((s) => s.data.length > 0);
  }, [filtered]);

  const canEditUser = (u) => (isOwner || isSuperAdmin) && u.id !== profile?.id;
  const canDeleteUser = (u) => isOwner && u.role !== 'platform_owner' && u.id !== profile?.id;

  const handleToggleActive = async (u) => {
    // تفعيل/تعطيل سريع من القائمة (نفس منطق الأصل: تحديث مباشر بدون Edge Function)
    const result = await updateOrgMember(u.id, { is_active: !u.is_active });
    if (result.success) {
      showSuccess(u.is_active ? 'تم تعطيل الحساب' : 'تم تفعيل الحساب');
      loadData();
    } else {
      showError(result.error || 'فشل التحديث');
    }
  };

  const handleDelete = (u) => {
    Alert.alert('حذف المستخدم', `هل تريد حذف "${u.full_name}" نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          try {
            await callAdminAPI('delete_user', { user_id: u.user_id, member_id: u.id });
            showSuccess('تم حذف المستخدم');
            loadData();
          } catch (e) {
            showError('فشل الحذف: ' + e.message);
          }
        },
      },
    ]);
  };

  const handleResetPassword = (u) => {
    Alert.alert('إعادة تعيين كلمة المرور', `سيتم توليد كلمة مرور جديدة عشوائية لـ "${u.full_name}"`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'إعادة تعيين',
        onPress: async () => {
          try {
            const newPass = randomPassword();
            await callAdminAPI('reset_password', { user_id: u.user_id, new_password: newPass });
            Alert.alert('✅ تم', `كلمة المرور الجديدة:\n${newPass}\n\nشاركها مع المستخدم الآن.`);
          } catch (e) {
            showError('فشل إعادة التعيين: ' + e.message);
          }
        },
      },
    ]);
  };

  const renderUser = ({ item: u }) => {
    const cfg = ROLE_CONFIG[u.role] || ROLE_CONFIG.assistant;
    const supervisor = u.supervisor_id ? usersById[u.supervisor_id] : null;

    return (
      <View style={[styles.card, { borderRightColor: cfg.color }]}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{cfg.icon} {u.full_name}</Text>
            {!!u.national_id && <Text style={styles.metaLine}>{u.national_id}</Text>}
            {!!u.phone && <Text style={styles.metaLine}>{u.phone}</Text>}
            {!!campMap[u.camp_id] && <Text style={styles.metaLine}>🏕️ {campMap[u.camp_id]}</Text>}
            {!!supervisor && <Text style={styles.metaLine}>👤 تابع لـ {supervisor.full_name}</Text>}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Badge label={cfg.label} color={cfg.color} />
            {!u.is_active && <Badge label="⏸️ معطّل" color={colors.muted} />}
          </View>
        </View>

        {canEditUser(u) && (
          <View style={styles.actionsRow}>
            <Pressable style={styles.editBtn} onPress={() => navigation.push('UserForm', { userId: u.id })}>
              <Text style={styles.editBtnText}>✏️ تعديل</Text>
            </Pressable>
            <Pressable style={styles.resetBtn} onPress={() => handleResetPassword(u)}>
              <Text style={styles.resetBtnText}>🔑 كلمة مرور</Text>
            </Pressable>
            <Pressable style={styles.toggleBtn} onPress={() => handleToggleActive(u)}>
              <Text style={styles.toggleBtnText}>{u.is_active ? '⏸️ تعطيل' : '▶️ تفعيل'}</Text>
            </Pressable>
            {canDeleteUser(u) && (
              <Pressable style={styles.deleteBtn} onPress={() => handleDelete(u)}>
                <Text style={styles.deleteBtnText}>🗑️</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderUser}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>
            {ROLE_CONFIG[section.title].icon} {ROLE_CONFIG[section.title].label} ({section.data.length})
          </Text>
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="👥"
              title="المستخدمون"
              subtitle={<Text style={styles.headerSubtitle}>{filtered.length} من أصل {users.length}</Text>}
              action={
                (isOwner || isSuperAdmin) && (
                  <Pressable style={styles.addBtn} onPress={() => navigation.push('UserForm')}>
                    <Text style={styles.addBtnText}>➕ إضافة</Text>
                  </Pressable>
                )
              }
            />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 بحث بالاسم، الهوية، أو الجوال..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />
          </View>
        }
        ListEmptyComponent={<EmptyState icon="👥" title="لا يوجد مستخدمون مطابقون" />}
        stickySectionHeadersEnabled={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 32 },
  headerSubtitle: { color: colors.muted, fontSize: 11 },
  addBtn: { backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  addBtnText: { color: '#000', fontWeight: '900', fontSize: 12 },
  searchInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.white,
    fontSize: 13,
    textAlign: 'right',
    marginBottom: 12,
  },
  sectionHeader: { color: colors.muted, fontWeight: 'bold', fontSize: 12, marginTop: 12, marginBottom: 8, textAlign: 'right' },

  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRightWidth: 3, borderRadius: 12, padding: 12, marginBottom: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  userName: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'right' },
  metaLine: { color: colors.muted, fontSize: 11, marginTop: 2, textAlign: 'right' },

  actionsRow: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  editBtn: { backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.4)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  editBtnText: { color: colors.blue, fontWeight: 'bold', fontSize: 10 },
  resetBtn: { backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  resetBtnText: { color: colors.accent, fontWeight: 'bold', fontSize: 10 },
  toggleBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  toggleBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 10 },
  deleteBtn: { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  deleteBtnText: { fontSize: 12 },
});
