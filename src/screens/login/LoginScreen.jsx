import React, { useState, useEffect, useRef } from 'react';
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
import { useAuth } from '../../context/AuthContext';
import colors from '../../theme/colors';

/**
 * شاشة تسجيل الدخول — نسخة مطابقة للأصل (camp-registry-react/LoginPage.jsx):
 * نفس الألوان، نفس الترتيب، نفس منطق القفل بعد المحاولات الفاشلة،
 * نفس رسائل الانتظار التشجيعية وعداد الثواني وشريط التقدم.
 */
export default function LoginScreen({ navigation }) {
  const [id, setId] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const { login } = useAuth();
  const timerRef = useRef(null);

  function startTimer() {
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }
  function stopTimer() {
    clearInterval(timerRef.current);
    setSeconds(0);
  }
  useEffect(() => () => clearInterval(timerRef.current), []);

  async function handleSubmit() {
    if (Date.now() < lockUntil) {
      const wait = Math.ceil((lockUntil - Date.now()) / 1000);
      setError(`⏳ انتظر ${wait} ثانية قبل المحاولة مجدداً`);
      return;
    }
    if (!id.trim() || !pass) {
      setError('أدخل رقم الهوية وكلمة المرور');
      return;
    }

    setLoading(true);
    startTimer();
    setError('🔄 جارٍ الاتصال بالخادم...');

    const email = `${id.trim()}@c.co`;
    const result = await login(email, pass);

    if (result.success) {
      setError('✅ تم! جارٍ التحميل...');
      stopTimer();
    } else {
      stopTimer();
      const n = attempts + 1;
      setAttempts(n);
      if (n >= 5) setLockUntil(Date.now() + 60000);
      else if (n >= 3) setLockUntil(Date.now() + 15000);
      setError('❌ ' + (result.error || 'خطأ غير معروف'));
    }
    setLoading(false);
  }

  const waitMsg =
    seconds < 3 ? 'جارٍ الاتصال...' :
    seconds < 8 ? 'جارٍ التحقق من بيانات الدخول...' :
    seconds < 14 ? 'الخادم يستجيب، انتظر قليلاً...' :
    'الاتصال بطيء، لا تزال المحاولة جارية...';

  const errStyle =
    error.startsWith('✅') ? styles.msgGreen :
    error.startsWith('❌') ? styles.msgRed :
    styles.msgAccent;

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            {/* أيقونة */}
            <View style={styles.iconBox}>
              <Text style={styles.iconEmoji}>🏕️</Text>
            </View>
            <Text style={styles.title}>نبض المخيم</Text>
            <Text style={styles.subtitle}>سجل دخول للمتابعة</Text>

            {/* رقم الهوية */}
            <Text style={styles.label}>رقم الهوية</Text>
            <TextInput
              value={id}
              onChangeText={setId}
              placeholder="1xxxxxxxxx"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              editable={!loading}
              style={styles.input}
            />

            {/* كلمة المرور */}
            <Text style={styles.label}>كلمة المرور</Text>
            <TextInput
              value={pass}
              onChangeText={setPass}
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
              secureTextEntry
              editable={!loading}
              style={styles.input}
            />

            {/* رسالة الحالة */}
            {!!error && <Text style={[styles.msg, errStyle]}>{error}</Text>}

            {/* عداد الانتظار وشريط التقدم */}
            {loading && seconds > 0 && (
              <View style={styles.waitBox}>
                <Text style={styles.waitMsg}>{waitMsg}</Text>
                <View style={styles.progressRow}>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.min(100, (seconds / 20) * 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.secondsText}>{seconds}s</Text>
                </View>
              </View>
            )}

            {/* زر الدخول */}
            <Pressable
              onPress={handleSubmit}
              disabled={loading || Date.now() < lockUntil}
              style={({ pressed }) => [
                styles.button,
                (loading || Date.now() < lockUntil) && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.buttonText}>
                {loading ? `⏳ جاري الدخول... (${seconds}s)` : 'تسجيل الدخول'}
              </Text>
            </Pressable>

            <Pressable onPress={() => navigation.navigate('FamilyPortal')} style={styles.portalBtn}>
              <Text style={styles.portalBtnText}>🏕️ أنا من عائلة مسجّلة — استعلام بوابة الأسرة</Text>
            </Pressable>

            <Text style={styles.copyright}>© 2026 Mahmoud Rateb Ramadan</Text>

            {seconds > 10 && (
              <View style={styles.slowBox}>
                <Text style={styles.slowText}>
                  الخادم بطيء. إذا استمر الانتظار أكثر من 20 ثانية سيظهر خطأ — حاول مرة أخرى.
                </Text>
              </View>
            )}
          </View>
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
    padding: 32,
  },
  iconBox: {
    width: 64,
    height: 64,
    backgroundColor: colors.accent,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  iconEmoji: { fontSize: 30 },
  title: { color: colors.white, fontWeight: '900', fontSize: 20, textAlign: 'center', marginBottom: 4 },
  subtitle: { color: colors.muted, fontSize: 12, textAlign: 'center', marginBottom: 28 },
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
  msg: { fontSize: 12, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12, textAlign: 'right', borderWidth: 1, overflow: 'hidden' },
  msgGreen: { color: colors.green, backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.2)' },
  msgRed: { color: colors.red, backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' },
  msgAccent: { color: colors.accent, backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.2)' },
  waitBox: { marginBottom: 12 },
  waitMsg: { color: colors.accent, fontSize: 12, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTrack: { flex: 1, backgroundColor: colors.surface2, borderRadius: 999, height: 6 },
  progressFill: { backgroundColor: colors.accent, height: 6, borderRadius: 999 },
  secondsText: { color: colors.muted, fontSize: 12, width: 32, textAlign: 'left' },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonPressed: { transform: [{ scale: 0.97 }] },
  buttonText: { color: colors.bg, fontWeight: '900', fontSize: 14, textAlign: 'center' },
  portalBtn: {
    marginTop: 24,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 12,
  },
  portalBtnText: { color: colors.accent, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  copyright: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 8, opacity: 0.6 },
  slowBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: colors.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  slowText: { color: colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 18 },
});
