import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime } from '../../lib/utils';
import { showError, showSuccess } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import FormInput from '../../components/ui/FormInput';
import colors from '../../theme/colors';

const FUNCTION_URL = 'https://ojclpkenecicujkqhhlu.supabase.co/functions/v1/org-signup';
const ANON_KEY = 'sb_publishable_d6q8hoDDcohuZFHk3jxI7g_IBWWCmNu';

/**
 * شاشة "طلبات تسجيل منظمات جديدة" -- منفصلة تماماً عن شاشة "طلبات
 * معلّقة" العادية (لأنها تسبق وجود أي منظمة أصلاً، مو طلب داخل منظمة
 * موجودة). مرئية فقط لمن هو مسجَّل بجدول saas_admins (مالك منصة SaaS
 * الكلي)، يتحقق منها السيرفر نفسه بكل استدعاء بغض النظر عمّا تعرضه
 * الواجهة.
 */
export default function OrgSignupRequestsScreen() {
  const { session } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [resultModal, setResultModal] = useState(null); // { email, password, orgName, campName }

  const callAPI = async (payload) => {
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'حدث خطأ');
    return json;
  };

  const loadData = useCallback(async () => {
    try {
      const json = await callAPI({ action: 'listPending' });
      setRequests(json.requests || []);
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session?.access_token]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  const onRefresh = () => { setRefreshing(true); loadData(); };

  const handleApprove = (req) => {
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

  const handleReject = async () => {
    if (!rejectTarget) return;
    setBusyId(rejectTarget.id);
    try {
      await callAPI({ action: 'reject', requestId: rejectTarget.id, reason: rejectReason.trim() || null });
      showSuccess('تم رفض الطلب');
      setRejectTarget(null);
      setRejectReason('');
      loadData();
    } catch (e) {
      showError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const renderItem = ({ item }) => (
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
        <Pressable
          style={[styles.approveBtn, busyId === item.id && styles.disabled]}
          onPress={() => handleApprove(item)}
          disabled={busyId === item.id}
        >
          {busyId === item.id ? <ActivityIndicator color="#000" size="small" /> : <Text style={styles.approveBtnText}>✅ موافقة</Text>}
        </Pressable>
        <Pressable
          style={[styles.rejectBtn, busyId === item.id && styles.disabled]}
          onPress={() => { setRejectTarget(item); setRejectReason(''); }}
          disabled={busyId === item.id}
        >
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

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListHeaderComponent={
          <PageHeader
            icon="🏢"
            title="طلبات تسجيل منظمات جديدة"
            subtitle={<Text style={styles.headerSubtitle}>{requests.length} طلب بانتظار المراجعة</Text>}
          />
        }
        ListEmptyComponent={<EmptyState icon="🏢" title="لا توجد طلبات معلّقة حالياً" />}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 32 },
  headerSubtitle: { color: colors.muted, fontSize: 11 },

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
