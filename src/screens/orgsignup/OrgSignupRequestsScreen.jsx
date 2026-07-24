import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime } from '../../lib/utils';
import { showError, showSuccess } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import FormInput from '../../components/ui/FormInput';
import colors from '../../theme/colors';

const FUNCTION_URL = 'https://ojclpkenecicujkqhhlu.supabase.co/functions/v1/org-signup';
const ANON_KEY = 'sb_publishable_d6q8hoDDcohuZFHk3jxI7g_IBWWCmNu';

/**
 * شاشة مالك منصة SaaS الكلي -- تبويبان:
 * 1. طلبات تسجيل منظمات جديدة (مندوب سجّل مخيماً جديداً، بانتظار موافقة)
 * 2. طلبات إثبات دفع (منظمات موجودة أرسلت تحويل، بانتظار تأكيد تفعيل الاشتراك)
 * كلاهما عبر Edge Function واحدة (org-signup)، محمية بعضوية saas_admins
 * الحقيقية بالسيرفر نفسه، بغض النظر عمّا تعرضه الواجهة.
 */
export default function OrgSignupRequestsScreen() {
  const { session } = useAuth();
  const [mainTab, setMainTab] = useState('orgs');
  const [requests, setRequests] = useState([]);
  const [payments, setPayments] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [activateTarget, setActivateTarget] = useState(null); // منظمة يجري تفعيلها مباشرة
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null); // { kind: 'org'|'payment', item }
  const [rejectReason, setRejectReason] = useState('');
  const [resultModal, setResultModal] = useState(null);

  const callAPI = async (payload) => {
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'حدث خطأ');
    return json;
  };

  const loadData = useCallback(async () => {
    try {
      const [orgsJson, paysJson, allOrgsJson] = await Promise.all([
        callAPI({ action: 'listPending' }),
        callAPI({ action: 'listPendingPayments' }),
        callAPI({ action: 'listOrganizations' }),
      ]);
      setRequests(orgsJson.requests || []);
      setPayments(paysJson.payments || []);
      setOrgs(allOrgsJson.organizations || []);
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleApproveOrg = (req) => {
    Alert.alert(
      'الموافقة على الطلب',
      `هل توافق على إنشاء منظمة ومخيم "${req.camp_name}" وحساب مندوب باسم "${req.full_name}"؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'موافقة',
          onPress: async () => {
            setBusyId(req.id);
            try {
              const json = await callAPI({ action: 'approve', requestId: req.id });
              setResultModal(json);
              loadData();
            } catch (e) {
              showError(e.message);
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  const handleApprovePayment = (p) => {
    Alert.alert(
      'تأكيد الدفع',
      `هل تأكّدت من استلام تحويل "${p.organizations?.name || p.org_id}" (${p.period === 'yearly' ? 'سنوي' : 'شهري'}, مرجع: ${p.reference_number})؟ الموافقة تفعّل الاشتراك مباشرة وتفتح تصدير الملفات.`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تأكيد',
          onPress: async () => {
            setBusyId(p.id);
            try {
              await callAPI({ action: 'approvePayment', paymentId: p.id });
              showSuccess('تم تفعيل الاشتراك');
              loadData();
            } catch (e) {
              showError(e.message);
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    const { kind, item } = rejectTarget;
    setBusyId(item.id);
    try {
      if (kind === 'org') {
        await callAPI({ action: 'reject', requestId: item.id, reason: rejectReason.trim() || null });
      } else {
        await callAPI({ action: 'rejectPayment', paymentId: item.id, reason: rejectReason.trim() || null });
      }
      showSuccess('تم الرفض');
      setRejectTarget(null);
      setRejectReason('');
      loadData();
    } catch (e) {
      showError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleActivateDirect = async (period) => {
    if (!activateTarget) return;
    setBusyId(activateTarget.id);
    try {
      await callAPI({ action: 'activateOrgDirect', orgId: activateTarget.id, period });
      showSuccess(`تم تفعيل اشتراك "${activateTarget.name}" (${period === 'yearly' ? 'سنوي' : 'شهري'})`);
      setActivateTarget(null);
      loadData();
    } catch (e) {
      showError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const renderOrgItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.name}>👤 {item.full_name}</Text>
      <Text style={styles.line}>🆔 {item.national_id} &nbsp; 📱 {item.phone}</Text>
      {!!item.address && <Text style={styles.line}>📍 {item.address}</Text>}
      <View style={styles.divider} />
      <Text style={styles.campLine}>🏕️ مخيم جديد: {item.camp_name}</Text>
      {(item.camp_lat && item.camp_lng) && <Text style={styles.line}>📌 {item.camp_lat}, {item.camp_lng}</Text>}
      {!!item.estimated_families && <Text style={styles.line}>👪 حوالي {item.estimated_families} أسرة</Text>}
      <Text style={styles.dateLine}>📅 {formatDateTime(item.created_at)}</Text>

      <View style={styles.actionsRow}>
        <Pressable style={[styles.approveBtn, busyId === item.id && styles.disabled]} onPress={() => handleApproveOrg(item)} disabled={busyId === item.id}>
          {busyId === item.id ? <ActivityIndicator color="#000" size="small" /> : <Text style={styles.approveBtnText}>✅ موافقة</Text>}
        </Pressable>
        <Pressable style={[styles.rejectBtn, busyId === item.id && styles.disabled]} onPress={() => { setRejectTarget({ kind: 'org', item }); setRejectReason(''); }} disabled={busyId === item.id}>
          <Text style={styles.rejectBtnText}>❌ رفض</Text>
        </Pressable>
      </View>
    </View>
  );

  const STATUS_LABEL = {
    trial: '🎁 تجربة', active: '✅ مفعّل', pending_payment: '⏳ بانتظار دفع',
    expired: '⛔ منتهٍ', suspended: '🚫 موقوف',
  };

  const renderAllOrgItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.name}>🏢 {item.name}</Text>
      <Text style={styles.line}>{STATUS_LABEL[item.subscription_status] || item.subscription_status}</Text>
      {item.subscription_status === 'trial' && !!item.trial_ends_at && (
        <Text style={styles.line}>تجربة لغاية {formatDateTime(item.trial_ends_at)}</Text>
      )}
      {item.subscription_status === 'active' && !!item.plan_expires_at && (
        <Text style={styles.line}>مفعّل لغاية {formatDateTime(item.plan_expires_at)}</Text>
      )}
      <Pressable
        style={[styles.approveBtn, { marginTop: 10 }, busyId === item.id && styles.disabled]}
        onPress={() => setActivateTarget(item)}
        disabled={busyId === item.id}
      >
        <Text style={styles.approveBtnText}>✅ تفعيل مباشر (بدون إثبات)</Text>
      </Pressable>
    </View>
  );

  const renderPaymentItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.name}>🏢 {item.organizations?.name || '—'}</Text>
      <Text style={styles.line}>👤 {item.submitted_by_name}</Text>
      <View style={styles.divider} />
      <Text style={styles.campLine}>{item.period === 'yearly' ? '📆 اشتراك سنوي' : '📆 اشتراك شهري'}</Text>
      <Text style={styles.line}>🔖 الرقم المرجعي: {item.reference_number}</Text>
      {!!item.amount && <Text style={styles.line}>💰 المبلغ: {item.amount}</Text>}
      {!!item.note && <Text style={styles.line}>📝 {item.note}</Text>}
      <Text style={styles.dateLine}>📅 {formatDateTime(item.created_at)}</Text>

      <View style={styles.actionsRow}>
        <Pressable style={[styles.approveBtn, busyId === item.id && styles.disabled]} onPress={() => handleApprovePayment(item)} disabled={busyId === item.id}>
          {busyId === item.id ? <ActivityIndicator color="#000" size="small" /> : <Text style={styles.approveBtnText}>✅ تأكيد الدفع</Text>}
        </Pressable>
        <Pressable style={[styles.rejectBtn, busyId === item.id && styles.disabled]} onPress={() => { setRejectTarget({ kind: 'payment', item }); setRejectReason(''); }} disabled={busyId === item.id}>
          <Text style={styles.rejectBtnText}>❌ رفض</Text>
        </Pressable>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loader}><ActivityIndicator size="large" color={colors.accent} /></View>
      </SafeAreaView>
    );
  }

  const data = mainTab === 'orgs' ? requests : mainTab === 'payments' ? payments : orgs;
  const renderItem = mainTab === 'orgs' ? renderOrgItem : mainTab === 'payments' ? renderPaymentItem : renderAllOrgItem;

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <PageHeader icon="🏢" title="مالك منصة SaaS" subtitle={<Text style={styles.headerSubtitle}>مراجعة الطلبات المعلّقة</Text>} />
            <View style={styles.chipsRow}>
              <FilterChip label={`🏢 منظمات جديدة (${requests.length})`} selected={mainTab === 'orgs'} onPress={() => setMainTab('orgs')} />
              <FilterChip label={`💳 طلبات دفع (${payments.length})`} selected={mainTab === 'payments'} onPress={() => setMainTab('payments')} />
              <FilterChip label={`📋 كل المنظمات (${orgs.length})`} selected={mainTab === 'allOrgs'} onPress={() => setMainTab('allOrgs')} />
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState icon={mainTab === 'orgs' ? '🏢' : mainTab === 'payments' ? '💳' : '📋'} title="لا توجد نتائج" />}
      />

      <BottomSheetModal visible={!!rejectTarget} onClose={() => setRejectTarget(null)} title="رفض الطلب">
        <FormInput label="سبب الرفض (اختياري)" value={rejectReason} onChangeText={setRejectReason} multiline numberOfLines={3} />
        <Pressable style={[styles.rejectBtn, { marginTop: 8 }]} onPress={handleReject}>
          <Text style={styles.rejectBtnText}>تأكيد الرفض</Text>
        </Pressable>
      </BottomSheetModal>

      <BottomSheetModal visible={!!resultModal} onClose={() => setResultModal(null)} title="✅ تمت الموافقة">
        {!!resultModal && (
          <View>
            <Text style={styles.resultText}>تم إنشاء منظمة "{resultModal.orgName}" ومخيم "{resultModal.campName}" بنجاح.</Text>
            <Text style={styles.resultLabel}>بيانات الدخول -- ابعتها للمندوب يدوياً:</Text>
            <View style={styles.credBox}>
              <Text style={styles.credText}>👤 اسم المستخدم (رقم الهوية): {resultModal.email.replace('@c.co', '')}</Text>
              <Text style={styles.credText}>🔑 كلمة المرور: {resultModal.password}</Text>
            </View>
            <Text style={styles.resultHint}>⚠️ هاي الكلمة ما تظهر مرة ثانية -- تأكد نسختها/بعتّها قبل ما تغلق هاي النافذة.</Text>
          </View>
        )}
      </BottomSheetModal>
      <BottomSheetModal visible={!!activateTarget} onClose={() => setActivateTarget(null)} title={`تفعيل "${activateTarget?.name || ''}" مباشرة`}>
        <Text style={styles.resultText}>حدد مدة الاشتراك (بدون أي طلب إثبات دفع من العميل):</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Pressable style={[styles.approveBtn, busyId === activateTarget?.id && styles.disabled]} onPress={() => handleActivateDirect('monthly')} disabled={busyId === activateTarget?.id}>
            <Text style={styles.approveBtnText}>شهري (٣٠ يوم)</Text>
          </Pressable>
          <Pressable style={[styles.approveBtn, busyId === activateTarget?.id && styles.disabled]} onPress={() => handleActivateDirect('yearly')} disabled={busyId === activateTarget?.id}>
            <Text style={styles.approveBtnText}>سنوي (٣٦٥ يوم)</Text>
          </Pressable>
        </View>
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 32 },
  headerSubtitle: { color: colors.muted, fontSize: 11 },
  chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },

  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRightWidth: 3, borderRightColor: colors.accent, borderRadius: 12, padding: 14, marginBottom: 10 },
  name: { color: colors.white, fontWeight: 'bold', fontSize: 14, textAlign: 'right' },
  line: { color: colors.muted, fontSize: 12, marginTop: 3, textAlign: 'right' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  campLine: { color: colors.accent, fontWeight: 'bold', fontSize: 13, textAlign: 'right' },
  dateLine: { color: colors.muted, fontSize: 10, marginTop: 6, textAlign: 'right' },

  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  approveBtn: { flex: 1, backgroundColor: colors.green, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  approveBtnText: { color: '#000', fontWeight: '900', fontSize: 12 },
  rejectBtn: { flex: 1, backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: colors.red, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  rejectBtnText: { color: colors.red, fontWeight: '900', fontSize: 12 },
  disabled: { opacity: 0.6 },

  resultText: { color: colors.white, fontSize: 13, marginBottom: 12, textAlign: 'right', lineHeight: 20 },
  resultLabel: { color: colors.muted, fontSize: 12, marginBottom: 6, textAlign: 'right' },
  credBox: { backgroundColor: colors.surface2, borderRadius: 10, padding: 12, marginBottom: 10 },
  credText: { color: colors.accent, fontWeight: 'bold', fontSize: 13, textAlign: 'right', marginBottom: 4 },
  resultHint: { color: colors.red, fontSize: 11, textAlign: 'right' },
});
