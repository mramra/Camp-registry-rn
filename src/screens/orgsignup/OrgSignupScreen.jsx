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
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import colors from '../../theme/colors';

const FUNCTION_URL = 'https://ojclpkenecicujkqhhlu.supabase.co/functions/v1/org-signup';
const ANON_KEY = 'sb_publishable_d6q8hoDDcohuZFHk3jxI7g_IBWWCmNu';
const PALESTINIAN_PHONE_RE = /^(059|056)\d{7}$/;

/** نفس فحص الاسم الرباعي والهوية المستخدم بباقي التطبيق -- تحقق فوري
 * بالواجهة، والتحقق الحقيقي (الملزِم أمنياً) يعاد بالكامل بالسيرفر. */
function validateNameLocal(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.length >= 4;
}
function luhnCheckLocal(numStr) {
  const digits = (numStr || '').replace(/\D/g, '');
  if (digits.length !== 9) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export default function OrgSignupScreen({ navigation }) {
  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [campName, setCampName] = useState('');
  const [coordinates, setCoordinates] = useState('');
  const [estimatedFamilies, setEstimatedFamilies] = useState('');
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setError('لم يُسمح بالوصول للموقع'); return; }
      const pos = await Location.getCurrentPositionAsync({});
      setCoordinates(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`);
    } catch {
      setError('تعذّر الحصول على الموقع الحالي');
    } finally {
      setLocating(false);
    }
  };

  const validate = () => {
    if (!validateNameLocal(fullName)) return 'الاسم يجب أن يكون رباعياً (٤ كلمات فأكثر)';
    if (!luhnCheckLocal(nationalId)) return 'رقم الهوية غير صحيح';
    if (!PALESTINIAN_PHONE_RE.test(phone.trim())) return 'رقم الجوال يجب أن يبدأ بـ059 أو 056 ويكون 10 خانات';
    if (!campName.trim()) return 'اسم المخيم مطلوب';
    return null;
  };

  const handleSubmit = async () => {
    const v = validate();
    if (v) { setError(v); return; }
    setError('');
    setLoading(true);
    try {
      const [lat, lng] = coordinates.trim().includes(',')
        ? coordinates.split(',').map((s) => parseFloat(s.trim()))
        : [null, null];
      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
        body: JSON.stringify({
          action: 'submit',
          fullName: fullName.trim(),
          nationalId: nationalId.trim(),
          phone: phone.trim(),
          address: address.trim(),
          campName: campName.trim(),
          campLat: lat,
          campLng: lng,
          estimatedFamilies: estimatedFamilies ? parseInt(estimatedFamilies, 10) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'تعذّر إرسال الطلب');
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.successWrap}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successTitle}>تم إرسال طلبك بنجاح</Text>
          <Text style={styles.successText}>
            طلبك بانتظار مراجعة مالك المنصة. بمجرد الموافقة، رح يتواصل معك على رقم جوالك
            ({phone}) بمعلومات حسابك.
          </Text>
          <Pressable style={styles.backBtn} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.backBtnText}>الرجوع لتسجيل الدخول</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>➕ سجّل كمندوب مخيم جديد</Text>
          <Text style={styles.subtitle}>
            هذا التسجيل لإنشاء منظمة/مخيم جديد بالكامل على نبض المخيم -- بعد المراجعة والموافقة
            رح تحصل على حساب مندوب مخيمك الجديد مع تجربة مجانية أسبوع كامل.
          </Text>

          <Text style={styles.sectionLabel}>بياناتك الشخصية</Text>
          <TextInput style={styles.input} placeholder="اسمك الرباعي الكامل" placeholderTextColor={colors.muted} value={fullName} onChangeText={setFullName} />
          <TextInput style={styles.input} placeholder="رقم هويتك" placeholderTextColor={colors.muted} value={nationalId} onChangeText={setNationalId} keyboardType="number-pad" maxLength={9} />
          <TextInput style={styles.input} placeholder="رقم جوالك (059/056xxxxxxx)" placeholderTextColor={colors.muted} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={10} />
          <TextInput style={styles.input} placeholder="عنوانك (اختياري)" placeholderTextColor={colors.muted} value={address} onChangeText={setAddress} />

          <Text style={styles.sectionLabel}>بيانات المخيم الجديد</Text>
          <TextInput style={styles.input} placeholder="اسم المخيم" placeholderTextColor={colors.muted} value={campName} onChangeText={setCampName} />
          <View style={styles.coordRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="إحداثيات المخيم (اختياري)"
              placeholderTextColor={colors.muted}
              value={coordinates}
              onChangeText={setCoordinates}
            />
            <Pressable style={styles.locBtn} onPress={useMyLocation} disabled={locating}>
              {locating ? <ActivityIndicator color={colors.accent} size="small" /> : <Text style={styles.locBtnText}>📍</Text>}
            </Pressable>
          </View>
          <TextInput style={styles.input} placeholder="عدد الأسر التقريبي بالمخيم" placeholderTextColor={colors.muted} value={estimatedFamilies} onChangeText={setEstimatedFamilies} keyboardType="number-pad" />

          {!!error && <Text style={styles.errorText}>⚠️ {error}</Text>}

          <Pressable style={[styles.submitBtn, loading && styles.disabled]} onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.submitBtnText}>📤 إرسال الطلب</Text>}
          </Pressable>

          <Pressable onPress={() => navigation.navigate('Login')} style={styles.linkBtn}>
            <Text style={styles.linkBtnText}>عندك حساب مسبقاً؟ سجّل الدخول</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  title: { color: colors.white, fontSize: 20, fontWeight: '900', textAlign: 'center', marginTop: 12, marginBottom: 8 },
  subtitle: { color: colors.muted, fontSize: 12, textAlign: 'center', marginBottom: 20, lineHeight: 19 },
  sectionLabel: { color: colors.accent, fontWeight: 'bold', fontSize: 13, marginBottom: 8, marginTop: 6, textAlign: 'right' },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, color: colors.white, fontSize: 14, textAlign: 'right', marginBottom: 10,
  },
  coordRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  locBtn: { width: 48, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  locBtnText: { fontSize: 18 },
  errorText: { color: colors.red, fontSize: 12, textAlign: 'center', marginBottom: 10 },
  submitBtn: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  disabled: { opacity: 0.6 },
  submitBtnText: { color: '#000', fontWeight: '900', fontSize: 15 },
  linkBtn: { alignItems: 'center', marginTop: 18 },
  linkBtnText: { color: colors.muted, fontSize: 13, textDecorationLine: 'underline' },

  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  successIcon: { fontSize: 56, marginBottom: 16 },
  successTitle: { color: colors.white, fontSize: 20, fontWeight: '900', marginBottom: 12, textAlign: 'center' },
  successText: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  backBtn: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 30 },
  backBtnText: { color: '#000', fontWeight: '900', fontSize: 14 },
});
