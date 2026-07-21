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
import { formatDate } from '../../lib/utils';
import { calcAge } from '../../lib/helpers';
import { MARITAL_BY_GENDER, HOUSING_TYPE_OPTIONS } from '../../lib/formOptions';
import colors from '../../theme/colors';

// نفس معرّف المنظمة الثابت المستخدم بالنسخة الأصلية لبوابة الأسرة العامة
const ORG_ID = 'ddc8abe7-518f-40a4-8c3b-ee03bb0f47d5';
const FUNCTION_URL = 'https://ojclpkenecicujkqhhlu.supabase.co/functions/v1/family-portal';
const ANON_KEY = 'sb_publishable_d6q8hoDDcohuZFHk3jxI7g_IBWWCmNu';

/**
 * كل عمليات البوابة تمر إجبارياً عبر Edge Function واحدة (family-portal)
 * بدل أي وصول مباشر لقاعدة البيانات -- كانت هذه الشاشة تستعلم مباشرة
 * (supabase.from('families').select(...)) بصلاحيات anon مفتوحة، وهذا
 * شكّل ثغرة حقيقية: أي طلب مباشر لقاعدة البيانات بنفس مفتاح anon
 * المُضمَّن أصلاً بالتطبيق كان يقدر يقرأ بيانات *كل* الأسر بأي مخيم
 * بوابته مفتوحة، بدون أي تحقق فعلي من رقم الهوية أو الجوال (التحقق
 * كان بواجهة التطبيق فقط، مو بقاعدة البيانات). اكتُشفت واتصلحت مباشرة.
 *
 * الآن: كل استدعاء (بحث/إرسال رسالة/استكمال بيانات/طلب حر) يبعث رقم
 * الهوية والجوال، ودالة السيرفر (بصلاحيات service_role تتجاوز RLS)
 * تتحقق من تطابقهما فعلياً *قبل* أي قراءة أو كتابة -- لا سياسة anon
 * SELECT مفتوحة على هذه الجداول بعد الآن إطلاقاً.
 */
async function callFamilyPortalAPI(action, { nationalId, phone, familyId, message, fields }) {
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ action, nationalId, phone, familyId, message, fields }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'حدث خطأ');
  return json;
}

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
  const [urgentOpen, setUrgentOpen] = useState(false);
  const [urgentText, setUrgentText] = useState('');
  const [urgentSending, setUrgentSending] = useState(false);
  const [urgentSent, setUrgentSent] = useState(false);

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
    setUrgentOpen(false);
    setUrgentText('');
    setUrgentSent(false);
    try {
      const result = await callFamilyPortalAPI('lookup', { nationalId, phone });
      setFamily(result.family);
      setMembers(result.members || []);
      setAidHistory(result.aidHistory || []);
      setMessages(result.messages || []);
    } catch (e) {
      setError(e.message || 'حدث خطأ في البحث');
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
        !family.address?.trim() && { key: 'address', label: '🏠 السكن الحالي (وصف)', kind: 'text' },
        !family.housing_type?.trim() && { key: 'housing_type', label: '🏘️ نوع المسكن', kind: 'housing' },
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
      await callFamilyPortalAPI('submitMissingData', { nationalId, phone, familyId: family.id, fields });
      setMissingSent(true);
      setMissingValues({});
    } catch (e) {
      setError(e.message || 'تعذّر إرسال البيانات، حاول مرة ثانية');
    } finally {
      setMissingSending(false);
    }
  };

  const handleSendUrgent = async () => {
    if (!urgentText.trim()) return setError('اكتب وصف الحالة العاجلة أولاً');
    setUrgentSending(true);
    setError('');
    try {
      await callFamilyPortalAPI('sendUrgentRequest', {
        nationalId,
        phone,
        familyId: family.id,
        fields: { requestText: urgentText.trim() },
      });
      setUrgentSent(true);
      setUrgentText('');
    } catch (e) {
      setError(e.message || 'تعذّر إرسال الطلب، حاول مرة ثانية');
    } finally {
      setUrgentSending(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return setError('اكتب رسالتك أولاً');
    setSendingMessage(true);
    setError('');
    try {
      const msgText = newMessage.trim();
      const result = await callFamilyPortalAPI('sendMessage', { nationalId, phone, familyId: family.id, message: msgText });
      setMessages((prev) => [...prev, result.message]);
      setNewMessage('');
    } catch (e) {
      setError(e.message || 'تعذّر إرسال الرسالة، حاول مرة ثانية');
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

                {urgentSent ? (
                  <View style={styles.sentBanner}>
                    <Text style={styles.sentBannerText}>✅ استُلم طلب المساعدة العاجل — رح يتواصل معك مسؤول المخيم بأقرب وقت</Text>
                  </View>
                ) : urgentOpen ? (
                  <View style={[styles.infoCard, styles.urgentCard]}>
                    <Text style={styles.urgentTitle}>🚨 وصف الحالة العاجلة</Text>
                    <Text style={styles.requestHint}>اشرح الحالة باختصار (مرض، إصابة، خطر مباشر...) — بيوصل فوراً لمسؤول المخيم بإشعار مباشر.</Text>
                    <TextInput
                      value={urgentText}
                      onChangeText={setUrgentText}
                      placeholder="مثال: طفل مريض ويحتاج إسعاف فوري..."
                      placeholderTextColor={colors.muted}
                      multiline
                      style={[styles.input, styles.requestTextInput]}
                      editable={!urgentSending}
                    />
                    <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                      <Pressable
                        style={[styles.button, styles.urgentButton, { flex: 1 }, urgentSending && styles.buttonDisabled]}
                        onPress={handleSendUrgent}
                        disabled={urgentSending}
                      >
                        <Text style={styles.buttonText}>{urgentSending ? '⏳ جاري الإرسال...' : '🚨 إرسال الآن'}</Text>
                      </Pressable>
                      <Pressable style={styles.urgentCancelBtn} onPress={() => setUrgentOpen(false)} disabled={urgentSending}>
                        <Text style={styles.urgentCancelText}>إلغاء</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable style={styles.urgentTrigger} onPress={() => setUrgentOpen(true)}>
                    <Text style={styles.urgentTriggerText}>🚨 أحتاج مساعدة عاجلة الآن</Text>
                  </Pressable>
                )}

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
                    {members.map((m) => {
                      const age = calcAge(m.dob);
                      const avatar = m.gender === 'أنثى' ? '👧' : '👦';
                      return (
                        <View key={m.id} style={styles.memberCard}>
                          <View style={styles.memberAvatar}>
                            <Text style={styles.memberAvatarText}>{avatar}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={styles.memberTopRow}>
                              <Text style={styles.memberCardName}>{m.name}</Text>
                              {!!m.relation && (
                                <View style={styles.relationBadge}>
                                  <Text style={styles.relationBadgeText}>{m.relation}</Text>
                                </View>
                              )}
                            </View>
                            <View style={styles.memberMetaRow}>
                              {!!m.dob && (
                                <Text style={styles.memberMetaText}>
                                  🎂 {m.dob}{age != null ? ` (${age} سنة)` : ''}
                                </Text>
                              )}
                              {!!m.national_id && <Text style={styles.memberMetaText}>🪪 {m.national_id}</Text>}
                            </View>
                          </View>
                        </View>
                      );
                    })}
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
                            ) : d.kind === 'housing' ? (
                              <View style={styles.maritalRow}>
                                {HOUSING_TYPE_OPTIONS.map((opt) => (
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
                                placeholder={d.kind === 'date' ? '1990-01-01' : d.kind === 'phone' ? '05xxxxxxxx' : 'اكتب هنا...'}
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

  memberCard: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderRadius: 12, padding: 10, marginBottom: 8,
  },
  memberAvatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  memberAvatarText: { fontSize: 18 },
  memberTopRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  memberCardName: { color: colors.white, fontSize: 14, fontWeight: '900', textAlign: 'right' },
  relationBadge: { backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  relationBadgeText: { color: colors.accent, fontSize: 10, fontWeight: 'bold' },
  memberMetaRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  memberMetaText: { color: colors.muted, fontSize: 11, textAlign: 'right' },
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

  urgentTrigger: {
    backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1.5, borderColor: colors.red,
    borderRadius: 12, paddingVertical: 12, alignItems: 'center',
  },
  urgentTriggerText: { color: colors.red, fontWeight: '900', fontSize: 13 },
  urgentCard: { borderColor: colors.red, borderWidth: 1.5 },
  urgentTitle: { color: colors.red, fontWeight: '900', fontSize: 13, textAlign: 'right', marginBottom: 6 },
  urgentButton: { backgroundColor: colors.red },
  urgentCancelBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  urgentCancelText: { color: colors.muted, fontSize: 13, fontWeight: 'bold' },
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
