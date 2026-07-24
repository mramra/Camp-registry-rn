import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatDateTime } from '../../lib/utils';
import { showError, showSuccess } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import FormSection from '../../components/ui/FormSection';
import colors from '../../theme/colors';

const FUNCTION_URL = 'https://ojclpkenecicujkqhhlu.supabase.co/functions/v1/org-signup';
const ANON_KEY = 'sb_publishable_d6q8hoDDcohuZFHk3jxI7g_IBWWCmNu';

const STATUS_INFO = {
  trial: { label: '🎁 فترة تجربة مجانية', color: colors.accent },
  active: { label: '✅ اشتراك مفعّل', color: colors.green },
  pending_payment: { label: '⏳ بانتظار مراجعة الدفع', color: colors.accent },
  expired: { label: '⛔ اشتراك منتهٍ', color: colors.red },
  suspended: { label: '🚫 موقوف من مالك المنصة', color: colors.red },
};

/**
 * شاشة الاشتراك الفعلية -- بدل النسخة الشكلية القديمة (خطط وهمية ثابتة
 * وزر "الترقية" بلا أي وظيفة). تعرض حالة اشتراك منظمة المستخدم الحالية
 * فعلياً من جدول organizations، وتتيح إرسال إثبات دفع حقيقي (تحويل
 * بنكي/محفظة إلكترونية + مراجعة يدوية من مالك المنصة -- لا بوابة دفع
 * تلقائية).
 */
export default function SubscriptionScreen() {
  const { isOwner, session } = useAuth();
  const [org, setOrg] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [period, setPeriod] = useState('monthly');
  const [amount, setAmount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [{ data: orgRow }, { data: subs }] = await Promise.all([
        supabase.from('organizations').select('*').limit(1).maybeSingle(),
        supabase.from('payment_submissions').select('*').order('created_at', { ascending: false }).limit(10),
      ]);
      setOrg(orgRow);
      setSubmissions(subs || []);
    } catch (e) {
      showError('تعذّر تحميل بيانات الاشتراك');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const daysLeft = (dateStr) => {
    if (!dateStr) return null;
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
  };

  const handleSubmitPayment = async () => {
    if (!referenceNumber.trim()) { showError('الرقم المرجعي للتحويل مطلوب'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          action: 'submitPayment', period, amount: amount ? parseFloat(amount) : null,
          referenceNumber: referenceNumber.trim(), note: note.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'تعذّر الإرسال');
      showSuccess('تم إرسال إثبات الدفع، بانتظار المراجعة');
      setFormOpen(false);
      setReferenceNumber(''); setAmount(''); setNote('');
      loadData();
    } catch (e) {
      showError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loader}><ActivityIndicator size="large" color={colors.accent} /></View>
      </SafeAreaView>
    );
  }

  const status = org?.subscription_status || 'active';
  const statusInfo = STATUS_INFO[status] || STATUS_INFO.active;
  const trialDays = status === 'trial' ? daysLeft(org?.trial_ends_at) : null;
  const planDays = status === 'active' ? daysLeft(org?.plan_expires_at) : null;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader icon="💎" title="الاشتراك والباقات" />

        <View style={[styles.statusCard, { borderColor: statusInfo.color }]}>
          <Text style={[styles.statusLabel, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          {trialDays != null && (
            <Text style={styles.statusDetail}>
              {trialDays > 0 ? `متبقّي ${trialDays} يوم على انتهاء التجربة` : 'انتهت فترة التجربة'}
            </Text>
          )}
          {planDays != null && org?.plan_expires_at && (
            <Text style={styles.statusDetail}>
              {planDays > 0 ? `صالح لغاية ${formatDateTime(org.plan_expires_at)}` : 'انتهى الاشتراك'}
            </Text>
          )}
          {status === 'active' && !org?.plan_expires_at && (
            <Text style={styles.statusDetail}>اشتراك دائم بلا تاريخ انتهاء</Text>
          )}
        </View>

        {isOwner && (
          <>
            <Pressable style={styles.payBtn} onPress={() => setFormOpen((o) => !o)}>
              <Text style={styles.payBtnText}>{formOpen ? 'إغلاق' : '💳 إرسال إثبات دفع'}</Text>
            </Pressable>

            {formOpen && (
              <FormSection title="بيانات التحويل">
                <View style={styles.periodRow}>
                  {[{ k: 'monthly', l: 'شهري' }, { k: 'yearly', l: 'سنوي' }].map((p) => (
                    <Pressable
                      key={p.k}
                      style={[styles.periodBtn, period === p.k && styles.periodBtnActive]}
                      onPress={() => setPeriod(p.k)}
                    >
                      <Text style={[styles.periodBtnText, period === p.k && styles.periodBtnTextActive]}>{p.l}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput style={styles.input} placeholder="المبلغ المحوَّل (اختياري)" placeholderTextColor={colors.muted} value={amount} onChangeText={setAmount} keyboardType="numeric" />
                <TextInput style={styles.input} placeholder="الرقم المرجعي للتحويل *" placeholderTextColor={colors.muted} value={referenceNumber} onChangeText={setReferenceNumber} />
                <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} placeholder="ملاحظة (اختياري)" placeholderTextColor={colors.muted} value={note} onChangeText={setNote} multiline />
                <Pressable style={[styles.submitBtn, submitting && styles.disabled]} onPress={handleSubmitPayment} disabled={submitting}>
                  {submitting ? <ActivityIndicator color="#000" /> : <Text style={styles.submitBtnText}>📤 إرسال</Text>}
                </Pressable>
              </FormSection>
            )}
          </>
        )}

        {submissions.length > 0 && (
          <FormSection title="📜 سجل طلبات الدفع">
            {submissions.map((s) => (
              <View key={s.id} style={styles.subRow}>
                <Text style={styles.subLine}>
                  {s.period === 'yearly' ? 'سنوي' : 'شهري'} — {s.reference_number}
                  {s.amount ? ` (${s.amount})` : ''}
                </Text>
                <Text style={[styles.subStatus, s.status === 'approved' && { color: colors.green }, s.status === 'rejected' && { color: colors.red }]}>
                  {s.status === 'pending' ? '⏳ بانتظار المراجعة' : s.status === 'approved' ? '✅ مقبول' : '❌ مرفوض'}
                </Text>
                <Text style={styles.subDate}>{formatDateTime(s.created_at)}</Text>
              </View>
            ))}
          </FormSection>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 32 },

  statusCard: { backgroundColor: colors.surface, borderWidth: 2, borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 14 },
  statusLabel: { fontWeight: '900', fontSize: 16, marginBottom: 6 },
  statusDetail: { color: colors.muted, fontSize: 12 },

  payBtn: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  payBtnText: { color: '#000', fontWeight: '900', fontSize: 14 },

  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  periodBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  periodBtnActive: { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: colors.accent },
  periodBtnText: { color: colors.muted, fontWeight: 'bold', fontSize: 13 },
  periodBtnTextActive: { color: colors.accent },

  input: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, color: colors.white, fontSize: 14, textAlign: 'right', marginBottom: 10,
  },
  submitBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  submitBtnText: { color: '#000', fontWeight: '900', fontSize: 14 },

  subRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  subLine: { color: colors.white, fontSize: 13, textAlign: 'right', marginBottom: 3 },
  subStatus: { color: colors.accent, fontSize: 12, fontWeight: 'bold', textAlign: 'right', marginBottom: 3 },
  subDate: { color: colors.muted, fontSize: 10, textAlign: 'right' },
});
