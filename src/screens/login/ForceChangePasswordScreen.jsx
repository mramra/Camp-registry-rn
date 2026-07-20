import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '../../utils/toast';
import colors from '../../theme/colors';

/**
 * تغيير كلمة المرور الإجباري عند أول دخول (أو بعد إعادة تعيينها من
 * طرف مسؤول) -- كانت هذه الشاشة موجودة بالكامل بالنسخة الويب
 * (ChangePassword.jsx + توجيه إجباري بـApp.jsx كلما must_change_pass
 * صحيح) لكنها ناقصة كلياً بـRN: عمود must_change_pass موجود فعلاً
 * بجدول org_members (افتراضياً true لكل مستخدم جديد -- كلمة المرور
 * الأولى هي رقم الجوال)، لكن ولا مكان بالتطبيق كان يفرض تغييرها ولا
 * حتى يصفّرها بعد التغيير الفعلي من شاشة الإعدادات.
 *
 * RootNavigator يعرض هذه الشاشة فقط (بدون قائمة جانبية ولا أي شاشة
 * أخرى) كلما profile.must_change_pass === true، لحد ما يغيّرها
 * المستخدم بنجاح.
 */
export default function ForceChangePasswordScreen() {
  const { profile, logout, refreshProfile } = useAuth();
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (newPass.length < 8) return setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
    if (newPass !== confirmPass) return setError('كلمتا المرور غير متطابقتين');

    const net = await NetInfo.fetch();
    if (!net.isConnected) return setError('يتطلب الأمر اتصالاً بالإنترنت');

    setSaving(true);
    try {
      const { error: passErr } = await supabase.auth.updateUser({ password: newPass });
      if (passErr) throw passErr;

      const { error: flagErr } = await supabase
        .from('org_members')
        .update({ must_change_pass: false })
        .eq('id', profile.id);
      if (flagErr) throw flagErr;

      showToast('✅ تم تغيير كلمة المرور بنجاح', 'success');
      await refreshProfile();
    } catch (err) {
      setError(err.message || 'تعذّر تغيير كلمة المرور');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.icon}>🔐</Text>
            <Text style={styles.title}>يجب تغيير كلمة المرور</Text>
            <Text style={styles.subtitle}>
              {profile?.full_name ? `أهلاً ${profile.full_name} — ` : ''}
              هذا أول دخول لك (أو أُعيد تعيين كلمة المرور مؤخراً). لأمان حسابك، اختر كلمة مرور جديدة قبل المتابعة.
            </Text>

            <TextInput
              value={newPass}
              onChangeText={setNewPass}
              placeholder="كلمة المرور الجديدة"
              placeholderTextColor={colors.muted}
              secureTextEntry
              style={styles.input}
            />
            <TextInput
              value={confirmPass}
              onChangeText={setConfirmPass}
              placeholder="تأكيد كلمة المرور"
              placeholderTextColor={colors.muted}
              secureTextEntry
              style={styles.input}
            />

            {!!error && <Text style={styles.error}>{error}</Text>}

            <Pressable style={styles.saveBtn} onPress={handleSubmit} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? 'جاري الحفظ...' : '💾 حفظ ومتابعة'}</Text>
            </Pressable>

            <Pressable style={styles.logoutBtn} onPress={logout}>
              <Text style={styles.logoutBtnText}>تسجيل الخروج</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 20, padding: 24,
  },
  icon: { fontSize: 36, textAlign: 'center', marginBottom: 10 },
  title: { color: colors.white, fontWeight: '900', fontSize: 17, textAlign: 'center', marginBottom: 8 },
  subtitle: { color: colors.muted, fontSize: 12, textAlign: 'center', lineHeight: 18, marginBottom: 18 },
  input: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, color: colors.white, fontSize: 14, textAlign: 'right', marginBottom: 12,
  },
  error: { color: colors.red, fontSize: 12, textAlign: 'right', marginBottom: 10 },
  saveBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 14 },
  logoutBtn: { alignItems: 'center', marginTop: 16, paddingVertical: 6 },
  logoutBtnText: { color: colors.muted, fontSize: 12, textDecorationLine: 'underline' },
});
