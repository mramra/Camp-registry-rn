/**
 * LoginScreen.jsx — منقول حرفياً (نفس منطق الأعمال) من
 * camp-registry-react/src/pages/Login/LoginPage.jsx
 *
 * تكييفات React Native:
 *   - useNavigate (react-router) → useNavigation (@react-navigation/native)
 *   - <form onSubmit> غير موجود → handleSubmit يُستدعى مباشرة من onPress الزر
 *   - عناصر HTML → View/Text/TextInput/TouchableOpacity
 *   - نفس منطق العداد، الحماية من تكرار المحاولات (3→15s، 5→60s)، ورسائل
 *     فحص اعتماد الجهاز (DEVICE_NOT_APPROVED) — بلا أي تغيير في القواعد
 */
import { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useAuth } from '../context/AuthContext'
import { NEXT_DEVICE_APPROVER } from '../lib/db'
import SafeScreen from '../components/ui/SafeScreen'
import { colors, radius } from '../theme'

export default function LoginScreen() {
  const [id,       setId]       = useState('')
  const [pass,     setPass]     = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [seconds,  setSeconds]  = useState(0)
  const [attempts, setAttempts] = useState(0)
  const [lockUntil,setLockUntil]= useState(0)
  const { signIn } = useAuth()
  const navigation = useNavigation()
  const timerRef   = useRef(null)

  function startTimer() {
    setSeconds(0)
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
  }
  function stopTimer() {
    clearInterval(timerRef.current)
    setSeconds(0)
  }
  useEffect(() => () => clearInterval(timerRef.current), [])

  async function handleSubmit() {
    if (Date.now() < lockUntil) {
      const wait = Math.ceil((lockUntil - Date.now()) / 1000)
      setError(`⏳ انتظر ${wait} ثانية قبل المحاولة مجدداً`)
      return
    }
    if (!id.trim() || !pass) { setError('أدخل رقم الهوية وكلمة المرور'); return }

    setLoading(true)
    startTimer()
    setError('🔄 جارٍ الاتصال بالخادم...')

    try {
      await signIn(id.trim(), pass)
      setError('✅ تم! جارٍ التحميل...')
      stopTimer()
      // التنقل الفعلي يحدث تلقائياً عبر RootNavigator عند تغيّر حالة user/profile
      // في AuthContext (نفس فكرة navigate('/', {replace:true}) في نسخة الويب)
    } catch (err) {
      stopTimer()
      if (err?.deviceStatus) {
        const { status, role } = err.deviceStatus
        setError(status === 'blocked'
          ? '🚫 هذا الجهاز محظور. تواصل مع المسؤول.'
          : `⏳ جهازك الجديد بانتظار الموافقة من: ${NEXT_DEVICE_APPROVER[role] || 'المسؤول عنك'}`)
      } else {
        const n = attempts + 1
        setAttempts(n)
        if (n >= 5) setLockUntil(Date.now() + 60000)
        else if (n >= 3) setLockUntil(Date.now() + 15000)
        const msg = err?.message || 'خطأ غير معروف'
        setError('❌ ' + msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const waitMsg =
    seconds < 3  ? 'جارٍ الاتصال...' :
    seconds < 8  ? 'جارٍ التحقق من بيانات الدخول...' :
    seconds < 14 ? 'الخادم يستجيب، انتظر قليلاً...' :
    'الاتصال بطيء، لا تزال المحاولة جارية...'

  const errorStyle =
    error.startsWith('✅') ? styles.msgSuccess :
    error.startsWith('❌') ? styles.msgError :
    styles.msgInfo

  return (
    <SafeScreen>
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.iconBox}><Text style={styles.iconText}>🏕️</Text></View>
          <Text style={styles.title}>نبض المخيم</Text>
          <Text style={styles.subtitle}>سجل دخول للمتابعة</Text>

          <View style={styles.form}>
            <View>
              <Text style={styles.label}>رقم الهوية</Text>
              <TextInput
                value={id}
                onChangeText={setId}
                placeholder="1xxxxxxxxx"
                keyboardType="number-pad"
                editable={!loading}
                placeholderTextColor={colors.muted}
                style={[styles.input, loading && styles.inputDisabled]}
                autoFocus
              />
            </View>

            <View>
              <Text style={styles.label}>كلمة المرور</Text>
              <TextInput
                value={pass}
                onChangeText={setPass}
                placeholder="••••••••"
                secureTextEntry
                editable={!loading}
                placeholderTextColor={colors.muted}
                style={[styles.input, loading && styles.inputDisabled]}
              />
            </View>

            {!!error && (
              <View style={[styles.msgBox, errorStyle]}>
                <Text style={[styles.msgText, errorStyle.textColor && { color: errorStyle.textColor }]}>
                  {error}
                </Text>
              </View>
            )}

            {loading && seconds > 0 && (
              <View style={styles.timerWrap}>
                <Text style={styles.timerLabel}>{waitMsg}</Text>
                <View style={styles.progressRow}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.min(100, (seconds / 20) * 100)}%` }]} />
                  </View>
                  <Text style={styles.timerSeconds}>{seconds}s</Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading || Date.now() < lockUntil}
              activeOpacity={0.8}
              style={[styles.submitBtn, (loading || Date.now() < lockUntil) && styles.submitBtnDisabled]}
            >
              <Text style={styles.submitText}>
                {loading ? `⏳ جاري الدخول... (${seconds}s)` : 'تسجيل الدخول'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>كلمة المرور الأولى = رقم الجوال</Text>

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
    </SafeScreen>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: {
    width: '100%', maxWidth: 380, alignSelf: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.xl, padding: 28,
  },
  iconBox: {
    width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 20,
  },
  iconText: { fontSize: 30 },
  title: { color: colors.white, fontWeight: '900', fontSize: 20, textAlign: 'center', marginBottom: 4 },
  subtitle: { color: colors.muted, fontSize: 12, textAlign: 'center', marginBottom: 28 },
  form: { gap: 16 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: {
    width: '100%', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 12,
    color: colors.white, fontSize: 14, textAlign: 'right',
  },
  inputDisabled: { opacity: 0.6 },
  msgBox: { borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  msgSuccess: { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.2)', textColor: colors.green },
  msgError:   { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)', textColor: colors.red },
  msgInfo:    { backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.2)', textColor: colors.accent },
  msgText: { fontSize: 12 },
  timerWrap: { alignItems: 'center' },
  timerLabel: { color: colors.accent, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surface2 },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  timerSeconds: { color: colors.muted, fontSize: 12, width: 32, textAlign: 'left' },
  submitBtn: {
    width: '100%', backgroundColor: colors.accent, borderRadius: radius.md,
    paddingVertical: 13, alignItems: 'center', marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: colors.bg, fontWeight: '900', fontSize: 14 },
  hint: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 22 },
  slowBox: {
    marginTop: 16, padding: 12, backgroundColor: colors.surface2,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  slowText: { color: colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 16 },
})
