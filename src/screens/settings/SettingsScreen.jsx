import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import FormSection from '../../components/ui/FormSection';
import FormInput from '../../components/ui/FormInput';
import colors from '../../theme/colors';

const ROLE_AR = {
  platform_owner: 'مالك المنصة',
  super_admin: 'مدير الإيواء',
  camp_delegate: 'مندوب مخيم',
  assistant: 'مساعد',
};

export default function SettingsScreen() {
  const { profile, logout } = useAuth();
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [saving, setSaving] = useState(false);

  const changePassword = async () => {
    if (newPass.length < 8) return showToast('كلمة المرور يجب أن تكون 8 أحرف على الأقل', 'error');
    if (newPass !== confirmPass) return showToast('كلمتا المرور غير متطابقتين', 'error');

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) return showToast('يتطلب الأمر اتصالاً بالإنترنت', 'error');

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;
      showToast('تم تغيير كلمة المرور بنجاح', 'success');
      setNewPass('');
      setConfirmPass('');
    } catch (err) {
      showToast('خطأ: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const profileRows = [
    ['الاسم', profile?.full_name],
    ['رقم الهوية', profile?.national_id],
    ['الجوال', profile?.phone],
    ['الدور', ROLE_AR[profile?.role] || profile?.role],
  ];

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader icon="⚙️" title="الإعدادات" />

        <FormSection title="👤 الملف الشخصي">
          {profileRows.map(([label, value], i) => (
            <View key={label} style={[styles.profileRow, i === profileRows.length - 1 && styles.profileRowLast]}>
              <Text style={styles.profileLabel}>{label}</Text>
              <Text style={styles.profileValue}>{value || '—'}</Text>
            </View>
          ))}
        </FormSection>

        <FormSection title="🔐 تغيير كلمة المرور">
          <FormInput
            label="كلمة المرور الجديدة"
            value={newPass}
            onChangeText={setNewPass}
            placeholder="8 أحرف على الأقل"
            secureTextEntry
          />
          <FormInput
            label="تأكيد كلمة المرور"
            value={confirmPass}
            onChangeText={setConfirmPass}
            placeholder="أعد كتابة كلمة المرور"
            secureTextEntry
          />
          <Pressable
            style={[styles.saveBtn, saving && styles.btnDisabled]}
            onPress={changePassword}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'جاري الحفظ...' : '💾 تغيير كلمة المرور'}</Text>
          </Pressable>
        </FormSection>

        <FormSection title="🚪 الجلسة">
          <Pressable style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutBtnText}>تسجيل الخروج</Text>
          </Pressable>
        </FormSection>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },

  profileRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  profileRowLast: { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 },
  profileLabel: { color: colors.muted, fontSize: 12 },
  profileValue: { color: colors.white, fontSize: 13, fontWeight: 'bold' },

  saveBtn: { backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
  btnDisabled: { opacity: 0.6 },

  logoutBtn: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  logoutBtnText: { color: colors.red, fontWeight: 'bold', fontSize: 13 },
});
