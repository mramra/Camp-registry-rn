import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase, fetchFamilyAidHistory, recordApprovalRequest, fetchPortalMessages, sendPortalMessage, sendPushToRoles } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import { MARITAL_BY_GENDER } from '../../lib/formOptions';
import colors from '../../theme/colors';

// نفس معرّف المنظمة الثابت المستخدم بالنسخة الأصلية لبوابة الأسرة العامة
// (هذه الشاشة تعمل بدون تسجيل دخول، فلا يوجد AuthContext لأخذ org_id منه)
const ORG_ID = 'ddc8abe7-518f-40a4-8c3b-ee03bb0f47d5';

export default function FamilyPortalScreen({ navigation }) {
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [family, setFamily] = useState(null);
  const [members, setMembers] = useState([]);
  const [aidHistory, setAidHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [missingValues, setMissingValues] = useState({});
  const [missingSending, setMissingSending] = useState(false);
  const [missingSent, setMissingSent] = useState(false);

  const handleSearch = async () => {
    if (!nationalId.trim()) return setError('أدخل رقم الهوية');
    if (!phone.trim()) return setError('أدخل رقم الجوال');
    setLoading(true);
    setError('');
    setFamily(null);
    setMembers([]);
    setAidHistory([]);
    setMessages([]);
    setNewMessage('');
    setMissingValues({});
    setMissingSent(false);
    try {
      const { data, error: err } = await supabase
        .from('families')
        .select('*, camps(name, portal_open)')
        .eq('org_id', ORG_ID)
        .eq('head_id', nationalId.trim())
        .single();

      if (err || !data) {
        setError('لم يتم العثور على أي سجل بهذا الرقم');
        return;
      }

      // بوابة المخيم قد تكون مغلقة يدوياً من مندوبه (شاشة إدارة المخيم) --
      // لو مغلقة، ما نعرض أي بيانات حتى لو الأسرة موجودة فعلياً بالنظام
      if (data.camps && data.camps.portal_open === false) {
        setError('بوابة الاستعلام مغلقة حالياً بهذا المخيم — تواصل مع إدارة المخيم مباشرة');
        return;
      }

      // رقم الجوال هو "كلمة السر" -- تحقق إجباري (مو اختياري زي تاريخ
      // الميلاد سابقاً)، لازم يطابق رقم الجوال المسجَّل لرب الأسرة بالضبط
      if (!data.phone1 || data.phone1.trim() !== phone.trim()) {
        setError('رقم الهوية أو رقم الجوال غير صحيح');
        return;
      }

      setFamily(data);
      const [{ data: mems }, aid, msgs] = await Promise.all([
        supabase.from('family_members').select('*').eq('family_id', data.id),
        fetchFamilyAidHistory(data.id),
        fetchPortalMessages(data.id),
      ]);
      setMembers(mems || []);
      setAidHistory(aid || []);
      setMessages(msgs || []);
    } catch {
      setError('حدث خطأ في البحث');
    } finally {
      setLoading(false);
    }
  };

  // حقول محدَّدة وآمنة يقدر رب الأسرة يستكملها بنفسه (بدون المساس بحقول
  // الهوية نفسها -- اسم/رقم هوية رب الأسرة تبقى موثوقة من مصدرها الأصلي
  // فقط، ما تُستكمل عبر البوابة لتفادي انتحال هوية)
  const missingFieldDefs = family
    ? [
        !family.phone1?.trim() && { key: 'phone1', label: '📱 رقم الجوال', kind: 'phone' },
        !family.head_dob && { key: 'head_dob', label: '📅 تاريخ الميلاد (YYYY-MM-DD)', kind: 'date' },
        !family.head_marital?.trim() && { key: 'head_marital', label: '💍 الحالة الاجتماعية', kind: 'marital' },
      ].filter(Boolean)
    : [];

  const handleSubmitMissing = async () => {
    const filled = missingFieldDefs.filter((d) => (missingValues[d.key] || '').trim());
    if (!filled.length) return setError('عبّي حقل واحد على الأقل قبل الإرسال');
    setMissingSending(true);
    setError('');
    try {
      const fields = {};
      filled.forEach((d) => { fields[d.key] = missingValues[d.key].trim(); });
      await recordApprovalRequest({
        orgId: ORG_ID,
        familyId: family.id,
        action: 'portal_request',
        changes: { type: 'missing_data', fields },
        actorName: `${family.head_name} (استكمال بيانات عبر البوابة)`,
        actorRole: 'family_portal',
      });
      setMissingSent(true);
      setMissingValues({});
      sendPushToRoles({
        orgId: ORG_ID,
        roles: ['platform_owner', 'super_admin', 'camp_delegate'],
        campId: family.camp_id,
        title: '📋 استكمال بيانات من بوابة الأسرة',
        body: `${family.head_name} استكمل بيانات ناقصة -- بانتظار المراجعة`,
      });
    } catch {
      setError('تعذّر إرسال البيانات، حاول مرة ثانية');
    } finally {
      setMissingSending(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return setError('اكتب رسالتك أولاً');
    setSendingMessage(true);
    setError('');
    try {
      const sent = await sendPortalMessage({
        orgId: ORG_ID,
        familyId: family.id,
        senderRole: 'family',
        senderName: family.head_name,
        message: newMessage.trim(),
      });
      setMessages((prev) => [...prev, sent]);
      setNewMessage('');
      sendPushToRoles({
        orgId: ORG_ID,
        roles: ['platform_owner', 'super_admin', 'camp_delegate'],
        campId: family.camp_id,
        title: '💬 رسالة جديدة من بوابة الأسرة',
        body: `${family.head_name}: ${newMessage.trim().slice(0, 100)}`,
      });
    } catch {
      setError('تعذّر إرسال الرسالة، حاول مرة ثانية');
    } finally {
      setSendingMessage(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.iconBox}>
              <Text style={styles.iconEmoji}>🏕️</Text>
            </View>
            <Text style={styles.title}>بوابة الأسرة</Text>
            <Text style={styles.subtitle}>استعلم عن بياناتك ومستجدات أسرتك</Text>

            <Text style={styles.label}>رقم هوية رب الأسرة *</Text>
            <TextInput
              value={nationalId}
              onChangeText={setNationalId}
              placeholder="1xxxxxxxxx"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              editable={!loading}
              style={styles.input}
            />

            <Text style={styles.label}>رقم جوال رب الأسرة (ككلمة سر) *</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="05xxxxxxxx"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              secureTextEntry
              editable={!loading}
              style={styles.input}
            />

            {!!error && <Text style={styles.errorMsg}>{error}</Text>}

            <Pressable
              onPress={handleSearch}
              disabled={loading}
              style={[styles.button, loading && styles.buttonDisabled]}
            >
              <Text style={styles.buttonText}>{loading ? '⏳ جاري البحث...' : '🔍 استعلام'}</Text>
            </Pressable>

            {family && (
              <View style={styles.resultsBox}>
                <View style={styles.foundBanner}>
                  <Text style={styles.foundBannerText}>✅ تم العثور على السجل</Text>
                </View>

                <View style={styles.infoCard}>
                  <Text style={styles.infoCardTitle}>👤 بيانات الأسرة</Text>
                  {[
                    ['اسم رب الأسرة', family.head_name],
                    ['رقم الهوية', family.head_id],
                    ['المخيم', family.camps?.name || '—'],
                    ['الخيمة', family.tent || '—'],
                  ].map(([k, v]) => (
                    <View key={k} style={styles.infoRow}>
                      <Text style={styles.infoLabel}>{k}</Text>
                      <Text style={styles.infoValue}>{v || '—'}</Text>
                    </View>
                  ))}
                </View>

                {members.length > 0 && (
                  <View style={styles.infoCard}>
                    <Text style={styles.infoCardTitle}>👨‍👩‍👧‍👦 أفراد الأسرة ({members.length})</Text>
                    {members.map((m) => (
                      <View key={m.id} style={styles.memberRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.memberName}>{m.name}</Text>
                          {!!m.national_id && <Text style={styles.memberId}>🪪 {m.national_id}</Text>}
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.memberRelation}>{m.relation || '—'}</Text>
                          {!!m.dob && <Text style={styles.memberDob}>{m.dob}</Text>}
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.infoCard}>
                  <Text style={styles.infoCardTitle}>📦 المساعدات المستلمة ({aidHistory.length})</Text>
                  {aidHistory.length === 0 ? (
                    <Text style={styles.noAidText}>لم تُستلَم أي مساعدة بعد</Text>
                  ) : (
                    aidHistory.map((h) => {
                      const typeIcon = { food: '🍚', shelter: '🏠', hygiene: '🧼', financial: '💵' }[h.dist_rounds?.type] || '📦';
                      return (
                        <View key={h.id} style={styles.memberRow}>
                          <Text style={styles.memberId}>{typeIcon}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.memberName}>{h.dist_rounds?.name || 'جولة توزيع'}</Text>
                          </View>
                          <Text style={styles.memberDob}>{formatDate(h.dist_rounds?.round_date || h.received_at)}</Text>
                        </View>
                      );
                    })
                  )}
                </View>
                {missingFieldDefs.length > 0 && (
                  <View style={[styles.infoCard, styles.missingCard]}>
                    <Text style={styles.infoCardTitle}>🔴 بيانات ناقصة — أكملها الآن</Text>

                    {missingSent ? (
                      <View style={styles.sentBanner}>
                        <Text style={styles.sentBannerText}>✅ استُلمت بياناتك — بتظهر بعد موافقة مندوب المخيم</Text>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.requestHint}>
                          عبّي الحقول الناقصة تحت. رح توصل لمندوب المخيم للمراجعة السريعة، وبعد
                          الموافقة تُحفظ مباشرة ببياناتك.
                        </Text>
                        {missingFieldDefs.map((d) => (
                          <View key={d.key} style={{ marginBottom: 4 }}>
                            <Text style={styles.label}>{d.label}</Text>
                            {d.kind === 'marital' ? (
                              <View style={styles.maritalRow}>
                                {(MARITAL_BY_GENDER[family.head_gender] || MARITAL_BY_GENDER['ذكر']).map((opt) => (
                                  <Pressable
                                    key={opt}
                                    onPress={() => setMissingValues((v) => ({ ...v, [d.key]: opt }))}
                                    style={[styles.maritalChip, missingValues[d.key] === opt && styles.maritalChipActive]}
                                  >
                                    <Text style={[styles.maritalChipText, missingValues[d.key] === opt && styles.maritalChipTextActive]}>
                                      {opt}
                                    </Text>
                                  </Pressable>
                                ))}
                              </View>
                            ) : (
                              <TextInput
                                value={missingValues[d.key] || ''}
                                onChangeText={(v) => setMissingValues((prev) => ({ ...prev, [d.key]: v }))}
                                placeholder={d.kind === 'date' ? '1990-01-01' : '05xxxxxxxx'}
                                placeholderTextColor={colors.muted}
                                keyboardType={d.kind === 'phone' ? 'phone-pad' : 'default'}
                                editable={!missingSending}
                                style={styles.input}
                              />
                            )}
                          </View>
                        ))}
                        <Pressable
                          style={[styles.button, missingSending && styles.buttonDisabled]}
                          onPress={handleSubmitMissing}
                          disabled={missingSending}
                        >
                          <Text style={styles.buttonText}>{missingSending ? '⏳ جاري الإرسال...' : '📤 إرسال البيانات'}</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                )}

                <View style={styles.infoCard}>
                  <Text style={styles.infoCardTitle}>💬 تواصل مع إدارة المخيم</Text>
                  <Text style={styles.requestHint}>
                    اكتب أي استفسار أو طلب (إضافة مولود، تغيير جوال، أي شي ثاني) — بيوصل مباشرة
                    لمسؤول المخيم وممكن يردّ عليك هون بنفس المكان.
                  </Text>

                  {messages.length > 0 && (
                    <View style={styles.chatBox}>
                      {messages.map((m) => (
                        <View
                          key={m.id}
                          style={[styles.bubble, m.sender_role === 'staff' ? styles.bubbleStaff : styles.bubbleFamily]}
                        >
                          <Text style={styles.bubbleSender}>{m.sender_role === 'staff' ? `👤 ${m.sender_name || 'إدارة المخيم'}` : 'أنت'}</Text>
                          <Text style={styles.bubbleText}>{m.message}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <TextInput
                    value={newMessage}
                    onChangeText={setNewMessage}
                    placeholder="اكتب رسالتك هنا..."
                    placeholderTextColor={colors.muted}
                    multiline
                    style={[styles.input, styles.requestTextInput]}
                    editable={!sendingMessage}
                  />
                  <Pressable
                    style={[styles.button, sendingMessage && styles.buttonDisabled]}
                    onPress={handleSendMessage}
                    disabled={sendingMessage}
                  >
                    <Text style={styles.buttonText}>{sendingMessage ? '⏳ جاري الإرسال...' : '📤 إرسال'}</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          <Text style={styles.footerText}>للاستفسار تواصل مع إدارة المخيم</Text>

          {navigation?.canGoBack?.() && (
            <Pressable onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
              <Text style={styles.backLink}>‹ العودة لتسجيل الدخول</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: 384,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 24,
  },
  iconBox: {
    width: 64,
    height: 64,
    backgroundColor: colors.accent,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  iconEmoji: { fontSize: 30 },
  title: { color: colors.white, fontWeight: '900', fontSize: 20, textAlign: 'center', marginBottom: 4 },
  subtitle: { color: colors.muted, fontSize: 12, textAlign: 'center', marginBottom: 24 },
  label: { color: colors.muted, fontSize: 12, fontWeight: 'bold', marginBottom: 6, textAlign: 'right' },

  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.white,
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'right',
  },
  errorMsg: {
    color: colors.red,
    fontSize: 12,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    textAlign: 'right',
  },
  button: { backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 12 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.bg, fontWeight: '900', fontSize: 14, textAlign: 'center' },

  resultsBox: { marginTop: 20, gap: 12 },
  foundBanner: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  foundBannerText: { color: colors.green, fontWeight: 'bold', fontSize: 13 },

  infoCard: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
  infoCardTitle: { color: colors.accent, fontWeight: 'bold', fontSize: 12, marginBottom: 10, textAlign: 'right' },
  infoRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingBottom: 6, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoLabel: { color: colors.muted, fontSize: 11 },
  infoValue: { color: colors.white, fontSize: 11, fontWeight: 'bold' },


  memberRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  memberName: { color: colors.white, fontSize: 11, fontWeight: 'bold' },
  memberId: { color: colors.muted, fontSize: 9, marginTop: 2 },
  memberRelation: { color: colors.accent, fontSize: 10, fontWeight: 'bold' },
  memberDob: { color: colors.muted, fontSize: 9, marginTop: 2 },
  noAidText: { color: colors.muted, fontSize: 11, textAlign: 'center', paddingVertical: 8 },

  chatBox: { marginBottom: 12 },
  bubble: { maxWidth: '85%', borderRadius: 12, padding: 10, marginBottom: 8 },
  bubbleFamily: { alignSelf: 'flex-end', backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  bubbleStaff: { alignSelf: 'flex-start', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  bubbleSender: { color: colors.muted, fontSize: 9, marginBottom: 3, textAlign: 'right' },
  bubbleText: { color: colors.white, fontSize: 12, textAlign: 'right', lineHeight: 18 },
  requestHint: { color: colors.muted, fontSize: 10, lineHeight: 16, textAlign: 'right', marginBottom: 10 },
  requestTextInput: { minHeight: 70, textAlignVertical: 'top' },
  sentBanner: {
    backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
    borderRadius: 10, padding: 10, alignItems: 'center',
  },
  sentBannerText: { color: colors.green, fontSize: 11, fontWeight: 'bold', textAlign: 'center' },

  missingCard: { borderColor: 'rgba(239,68,68,0.35)' },
  maritalRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  maritalChip: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
  },
  maritalChipActive: { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: colors.accent },
  maritalChipText: { color: colors.muted, fontSize: 11 },
  maritalChipTextActive: { color: colors.accent, fontWeight: 'bold' },

  footerText: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 16 },
  backLink: { color: colors.accent, fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
});
