import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { canUserReviewRequest } from '../../lib/permissions';
import {
  fetchOrgMembers,
  fetchCamps,
  fetchPendingRequests,
  fetchDecisionLog,
  approveRequest,
  rejectRequest,
} from '../../lib/supabase';
import { formatDateTime } from '../../lib/utils';
import { TRACKED_FIELDS as FIELD_LABEL } from '../../lib/formOptions';
import { showError, showSuccess } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import colors from '../../theme/colors';

const ACTION_LABEL = {
  insert: { icon: '➕', label: 'إضافة أسرة جديدة', color: colors.green },
  update: { icon: '✏️', label: 'تعديل بيانات أسرة', color: colors.blue },
  delete: { icon: '🗑️', label: 'طلب حذف أسرة', color: colors.red },
  portal_request: { icon: '💬', label: 'طلب من بوابة الأسرة', color: colors.accent },
  movement_entry: { icon: '🟢', label: 'تسجيل دخول أسرة', color: colors.green },
  movement_exit: { icon: '🔴', label: 'تسجيل خروج أسرة', color: colors.red },
  movement_transfer: { icon: '🔵', label: 'نقل أسرة بين مخيمات', color: colors.blue },
  camp_insert: { icon: '🏕️', label: 'طلب إضافة مخيم', color: colors.green },
  camp_update: { icon: '🏕️', label: 'طلب تعديل مخيم', color: colors.blue },
  camp_delete: { icon: '🏕️', label: 'طلب حذف مخيم', color: colors.red },
  user_insert: { icon: '👤', label: 'طلب إضافة مستخدم', color: colors.green },
  user_update: { icon: '👤', label: 'طلب تعديل مستخدم', color: colors.blue },
  user_delete: { icon: '👤', label: 'طلب حذف مستخدم', color: colors.red },
};

const ROLE_LABEL = {
  platform_owner: 'ملك المنصة',
  super_admin: 'مدير الإيواء',
  camp_delegate: 'المندوب',
  assistant: 'المساعد',
};

export default function PendingRequestsScreen() {
  const { profile, orgId, isOwner } = useAuth();

  const [tab, setTab] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [decisionLog, setDecisionLog] = useState([]);
  const [campMap, setCampMap] = useState({});
  const [memberByUserId, setMemberByUserId] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [note, setNote] = useState('');

  const canReview = isOwner || profile?.can_review_approvals === true;

  const load = useCallback(async () => {
    if (!orgId || !canReview) {
      setLoading(false);
      return;
    }
    try {
      const [members, camps] = await Promise.all([fetchOrgMembers(orgId), fetchCamps(orgId)]);
      const byUserId = Object.fromEntries(members.map((m) => [m.user_id, m]));
      setMemberByUserId(byUserId);
      setCampMap(Object.fromEntries(camps.map((c) => [c.id, c.name])));

      if (tab === 'pending') {
        const rows = await fetchPendingRequests(orgId);
        const visible = isOwner ? rows : rows.filter((r) => canUserReviewRequest(profile, byUserId[r.changed_by]));
        setRequests(visible);
      } else {
        const rows = await fetchDecisionLog(orgId);
        const visible = isOwner ? rows : rows.filter((r) => canUserReviewRequest(profile, byUserId[r.changed_by]));
        setDecisionLog(visible);
      }
    } catch (e) {
      showError('تعذّر تحميل الطلبات: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [orgId, canReview, tab, isOwner, profile]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleApprove = async (req) => {
    setBusyId(req.id);
    const res = await approveRequest(req, profile);
    setBusyId(null);
    if (res.success) {
      showSuccess('✅ تمت الموافقة على الطلب');
      setRequests((r) => r.filter((x) => x.id !== req.id));
    } else {
      showError('خطأ: ' + res.error);
    }
  };

  const handleReject = async (req) => {
    setBusyId(req.id);
    const res = await rejectRequest(req, profile, note);
    setBusyId(null);
    setRejectingId(null);
    setNote('');
    if (res.success) {
      showSuccess('تم رفض الطلب وإعادة البيانات لحالتها السابقة');
      setRequests((r) => r.filter((x) => x.id !== req.id));
    } else {
      showError('خطأ: ' + res.error);
    }
  };

  const getRequestInfo = (req) => {
    const meta = ACTION_LABEL[req.action] || ACTION_LABEL.update;
    const isMovement = req.action?.startsWith('movement_');
    const isCamp = req.action?.startsWith('camp_');
    const isUser = req.action?.startsWith('user_');
    const isPortalRequest = req.action === 'portal_request';
    const submitter = memberByUserId[req.changed_by];
    const submitterName = req.user_name || submitter?.full_name || '—';
    const submitterRole = req.user_role || submitter?.role;
    const famName = req.new_data?.head_name || req.old_data?.head_name || req.family_name || '—';
    const campData = req.new_data || req.old_data || {};
    const userData = req.new_data || req.old_data || {};
    const title = isCamp ? campData.name || '—' : isUser ? userData.full_name || '—' : famName;
    return { meta, isMovement, isCamp, isUser, isPortalRequest, submitterName, submitterRole, title, campData, userData };
  };

  const renderRequest = ({ item: req }) => {
    const { meta, isMovement, isCamp, isUser, isPortalRequest, submitterName, submitterRole, title, campData, userData } = getRequestInfo(req);
    const isLog = tab === 'log';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <View style={styles.actionRow}>
              <Text style={[styles.actionIcon, { color: meta.color }]}>{meta.icon}</Text>
              <Text style={styles.actionLabel}>{meta.label}</Text>
            </View>
            <Text style={styles.submitterText}>
              👤 {submitterName} ({ROLE_LABEL[submitterRole] || submitterRole || '—'}) • {formatDateTime(req.created_at)}
            </Text>
          </View>
        </View>

        <View style={styles.titleBox}>
          <Text style={styles.titleText}>{title}</Text>
        </View>

        {isUser && (
          <View style={styles.detailBox}>
            <Text style={styles.detailText}>🏷️ الدور: {ROLE_LABEL[userData.role] || userData.role || '—'}</Text>
            {!!userData.phone && <Text style={styles.detailText}>📱 الجوال: {userData.phone}</Text>}
            {!!userData.camp_id && <Text style={styles.detailText}>🏕️ المخيم: {campMap[userData.camp_id] || '—'}</Text>}
          </View>
        )}

        {isCamp && (
          <View style={styles.detailBox}>
            <Text style={styles.detailText}>🏷️ النوع: {campData.camp_type === 'sub' ? 'فرع' : 'رئيسي'}</Text>
            {!!campData.address && <Text style={styles.detailText}>📍 {campData.address}</Text>}
          </View>
        )}

        {isMovement && (
          <View style={styles.detailBox}>
            {!!req.new_data?.from_camp && <Text style={styles.detailText}>📤 من: {campMap[req.new_data.from_camp] || '—'}</Text>}
            {!!req.new_data?.to_camp && <Text style={styles.detailText}>📥 إلى: {campMap[req.new_data.to_camp] || '—'}</Text>}
            {!!req.new_data?.reason && <Text style={styles.detailText}>📝 {req.new_data.reason}</Text>}
          </View>
        )}

        {isPortalRequest && req.changes?.type === 'missing_data' && (
          <View style={styles.detailBox}>
            <Text style={styles.detailText}>📋 استكمال بيانات ناقصة — سيُطبَّق مباشرة عند الموافقة:</Text>
            {Object.entries(req.changes.fields || {}).map(([k, v]) => (
              <Text key={k} style={styles.detailText}>• {FIELD_LABEL[k] || k}: {v}</Text>
            ))}
          </View>
        )}

        {isPortalRequest && req.changes?.type !== 'missing_data' && (
          <View style={styles.detailBox}>
            <Text style={styles.detailText}>💬 {req.changes?.request_text || '—'}</Text>
            {!!req.changes?.contact_phone && <Text style={styles.detailText}>📱 للتواصل: {req.changes.contact_phone}</Text>}
          </View>
        )}

        {req.action === 'delete' && !isLog && (
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>سيُحذف هذا السجل نهائياً عند الموافقة — لا يمكن التراجع بعدها.</Text>
          </View>
        )}

        {isLog ? (
          <View style={[styles.statusBox, { backgroundColor: req.status === 'approved' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }]}>
            <Text style={[styles.statusText, { color: req.status === 'approved' ? colors.green : colors.red }]}>
              {req.status === 'approved' ? '✓ تمت الموافقة' : '✕ تم الرفض'}
            </Text>
            <Text style={styles.reviewerText}>
              {req.reviewed_by_name || '—'} ({ROLE_LABEL[req.reviewed_by_role] || req.reviewed_by_role || '—'})
            </Text>
          </View>
        ) : rejectingId === req.id ? (
          <View style={{ marginTop: 10 }}>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="ملاحظة الرفض (اختياري)..."
              placeholderTextColor={colors.muted}
              multiline
              style={styles.noteInput}
            />
            <View style={styles.actionsRow}>
              <Pressable style={styles.rejectConfirmBtn} onPress={() => handleReject(req)} disabled={busyId === req.id}>
                <Text style={styles.rejectConfirmText}>{busyId === req.id ? '⏳ جاري...' : '✕ تأكيد الرفض'}</Text>
              </Pressable>
              <Pressable style={styles.cancelBtn} onPress={() => { setRejectingId(null); setNote(''); }}>
                <Text style={styles.cancelText}>إلغاء</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.actionsRow}>
            <Pressable style={styles.approveBtn} onPress={() => handleApprove(req)} disabled={busyId === req.id}>
              <Text style={styles.approveText}>{busyId === req.id ? '⏳ جاري...' : '✓ موافقة'}</Text>
            </Pressable>
            <Pressable style={styles.rejectBtn} onPress={() => setRejectingId(req.id)} disabled={busyId === req.id}>
              <Text style={styles.rejectText}>✕ رفض</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  if (!canReview) {
    return (
      <SafeAreaView style={styles.screen}>
        <EmptyState icon="⛔" title="لا تملك صلاحية مراجعة الطلبات" />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const data = tab === 'pending' ? requests : decisionLog;

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderRequest}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="📋"
              title="الطلبات المعلّقة"
              subtitle={
                <Text style={styles.headerSubtitle}>
                  {tab === 'pending' ? `${requests.length} طلب بانتظار مراجعتك` : `${decisionLog.length} قرار سابق`}
                </Text>
              }
            />
            <View style={styles.tabsRow}>
              <FilterChip label="⏳ معلّقة" selected={tab === 'pending'} onPress={() => setTab('pending')} />
              <FilterChip label="📜 سجل القرارات" selected={tab === 'log'} onPress={() => setTab('log')} />
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={tab === 'pending' ? '✅' : '📜'}
            title={tab === 'pending' ? 'لا توجد طلبات معلّقة' : 'لا توجد قرارات سابقة'}
            subtitle={tab === 'pending' ? 'كل التعديلات والإضافات تمت الموافقة عليها' : 'ستظهر هنا كل الطلبات بعد المراجعة'}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 32 },
  headerSubtitle: { color: colors.muted, fontSize: 11 },
  tabsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },

  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  actionRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  actionIcon: { fontSize: 14 },
  actionLabel: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'right' },
  submitterText: { color: colors.muted, fontSize: 10, marginTop: 3, textAlign: 'right' },

  titleBox: { backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  titleText: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'right' },

  detailBox: { backgroundColor: colors.surface2, borderRadius: 12, padding: 10, marginBottom: 8 },
  detailText: { color: colors.muted, fontSize: 11, textAlign: 'right', marginBottom: 2 },

  warnBox: { backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', borderRadius: 12, padding: 10, marginBottom: 8 },
  warnText: { color: colors.muted, fontSize: 10, textAlign: 'right' },

  statusBox: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  statusText: { fontWeight: 'bold', fontSize: 12 },
  reviewerText: { color: colors.muted, fontSize: 10 },

  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  approveBtn: { flex: 1, backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.4)', borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  approveText: { color: colors.green, fontWeight: 'bold', fontSize: 12 },
  rejectBtn: { flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  rejectText: { color: colors.red, fontWeight: 'bold', fontSize: 12 },
  rejectConfirmBtn: { flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  rejectConfirmText: { color: colors.red, fontWeight: 'bold', fontSize: 12 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  cancelText: { color: colors.muted, fontWeight: 'bold', fontSize: 12 },
  noteInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.white,
    fontSize: 12,
    textAlign: 'right',
    marginBottom: 8,
    minHeight: 50,
  },
});
