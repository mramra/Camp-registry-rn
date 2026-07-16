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
          {/* مشهد خلفية دافئ (سماء متوهّجة + نجوم + خيام بالظل) --
              بدون هذا المشهد، تأثير "الزجاج" الشفاف على البطاقة ما إله
              أي معنى بصري لأنه وراءها لون واحد فاضي بس (نفس مبدأ أي
              تصميم Glassmorphism: لازم محتوى فعلي وراء الزجاج) */}
          <View style={styles.scene} pointerEvents="none">
            <View style={styles.sunGlow} />
            <View style={[styles.star, { top: 40, left: 50 }]} />
            <View style={[styles.star, { top: 70, left: 280 }]} />
            <View style={[styles.star, { top: 110, left: 180 }]} />
            <View style={[styles.star, { top: 30, left: 130 }]} />
            <View style={[styles.star, { top: 140, left: 320 }]} />
            <View style={[styles.star, { top: 90, left: 20 }]} />
            <View style={styles.tentsRow}>
              <View style={[styles.tent, { borderBottomWidth: 70, borderLeftWidth: 42, borderRightWidth: 42 }]} />
              <View style={[styles.tent, styles.tentTall, { borderBottomWidth: 92, borderLeftWidth: 55, borderRightWidth: 55 }]} />
              <View style={[styles.tent, { borderBottomWidth: 78, borderLeftWidth: 46, borderRightWidth: 46 }]} />
              <View style={[styles.tent, styles.tentTall, { borderBottomWidth: 64, borderLeftWidth: 38, borderRightWidth: 38 }]} />
            </View>
          </View>

          <View style={styles.card}>
            {/* أيقونة */}
            <View style={styles.iconBox}>
              <View style={styles.iconBoxInner}>
                <Text style={styles.iconEmoji}>🏕️</Text>
              </View>
            </View>
            <Text style={styles.title}>نبض المخيم</Text>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <View style={styles.dividerDot} />
              <View style={styles.dividerLine} />
            </View>
            <Text style={styles.subtitle}>سجل دخول للمتابعة</Text>

            {/* رقم الهوية */}
            <Text style={styles.label}>رقم الهوية</Text>
            <View style={styles.inputRow}>
              <Text style={styles.inputIcon}>🪪</Text>
              <TextInput
                value={id}
                onChangeText={setId}
                placeholder="1xxxxxxxxx"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                editable={!loading}
                style={styles.input}
              />
            </View>

            {/* كلمة المرور */}
            <Text style={styles.label}>كلمة المرور</Text>
            <View style={styles.inputRow}>
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput
                value={pass}
                onChangeText={setPass}
                placeholder="••••••••"
                placeholderTextColor={colors.muted}
                secureTextEntry
                editable={!loading}
                style={styles.input}
              />
            </View>

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
                {loading ? `⏳ جاري الدخول... (${seconds}s)` : 'دخول'}
              </Text>
            </Pressable>

            <Pressable onPress={() => navigation.navigate('FamilyPortal')} style={styles.portalBtn}>
              <Text style={styles.portalBtnText}>🏕️ أنا من عائلة مسجّلة — استعلام بوابة الأسرة</Text>
            </Pressable>

            <Text style={styles.copyright}>© 2026 نبض المخيم — جميع الحقوق محفوظة</Text>

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
  screen: { flex: 1, backgroundColor: '#0d1117' },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },

  scene: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  sunGlow: {
    position: 'absolute', top: -70, alignSelf: 'center', width: 300, height: 300,
    borderRadius: 300, backgroundColor: 'rgba(245,158,11,0.22)',
  },
  star: { position: 'absolute', width: 2, height: 2, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.55)' },
  tentsRow: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end',
  },
  tent: {
    width: 0, height: 0, borderStyle: 'solid', borderTopWidth: 0,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderBottomColor: 'rgba(9,12,16,0.85)',
  },
  tentTall: { marginBottom: -6 },

  card: {
    width: '100%',
    maxWidth: 384,
    backgroundColor: 'rgba(22,27,34,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    borderRadius: 22,
    padding: 32,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 12,
  },
  iconBox: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  iconBoxInner: {
    width: 54, height: 54, borderRadius: 15, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  iconEmoji: { fontSize: 26 },
  title: { color: colors.white, fontWeight: '900', fontSize: 21, textAlign: 'center', letterSpacing: 0.3 },
  divider: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, marginBottom: 6 },
  dividerLine: { width: 36, height: 1, backgroundColor: 'rgba(245,158,11,0.35)' },
  dividerDot: { width: 4, height: 4, borderRadius: 4, backgroundColor: colors.accent },
  subtitle: { color: colors.muted, fontSize: 12, textAlign: 'center', marginBottom: 28 },
  label: { color: colors.muted, fontSize: 12, fontWeight: 'bold', marginBottom: 6, textAlign: 'right' },
  inputRow: {
    flexDirection: 'row-reverse', alignItems: 'center',
    backgroundColor: 'rgba(31,41,55,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.18)',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  inputIcon: { fontSize: 15, marginStart: 8 },
  input: {
    flex: 1,
    paddingVertical: 13,
    color: colors.white,
    fontSize: 14,
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
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonPressed: { transform: [{ scale: 0.97 }] },
  buttonText: { color: '#1a1206', fontWeight: '900', fontSize: 15, textAlign: 'center', letterSpacing: 0.5 },
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
