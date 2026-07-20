import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import * as Updates from 'expo-updates';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '../../utils/toast';
import { formatDateTime } from '../../lib/utils';
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
  const { profile, logout, isOwner, refreshProfile } = useAuth();
  const navigation = useNavigation();
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const checkForUpdate = async () => {
    if (!Updates.isEnabled) {
      return showToast('التحديثات التلقائية غير مفعّلة على هذه النسخة (مثلاً نسخة الويب)', 'warning');
    }
    setCheckingUpdate(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        showToast('✅ التطبيق محدّث لآخر إصدار متاح', 'success');
        return;
      }
      showToast('⬇️ يوجد تحديث جديد، جاري التحميل...', 'info');
      await Updates.fetchUpdateAsync();
      showToast('✅ تم التحميل، سيُعاد فتح التطبيق الآن', 'success');
      await Updates.reloadAsync();
    } catch (err) {
      showToast('⚠️ فشل التحقق: ' + err.message, 'error');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const changePassword = async () => {
    if (newPass.length < 8) return showToast('كلمة المرور يجب أن تكون 8 أحرف على الأقل', 'error');
    if (newPass !== confirmPass) return showToast('كلمتا المرور غير متطابقتين', 'error');

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) return showToast('يتطلب الأمر اتصالاً بالإنترنت', 'error');

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;
      if (profile?.must_change_pass) {
        await supabase.from('org_members').update({ must_change_pass: false }).eq('id', profile.id);
        await refreshProfile();
      }
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

        {isOwner && (
          <FormSection title="🛡️ الأمان">
            <Text style={styles.updateNote}>
              فحص حقيقي يتأكد إن كل دور/مندوب يرى بيانات مخيمه فقط ولا يوجد تسريب بين المخيمات.
            </Text>
            <Pressable style={styles.securityBtn} onPress={() => navigation.push('SecurityAudit')}>
              <Text style={styles.securityBtnText}>🛡️ فتح الفحص الأمني</Text>
            </Pressable>
          </FormSection>
        )}

        <FormSection title="🔄 التحديثات">
          <View style={styles.versionBox}>
            <Text style={styles.versionLabel}>رقم النسخة الحالية المثبَّتة على جهازك</Text>
            <Text style={styles.versionValue}>
              {Updates.updateId ? Updates.updateId.slice(0, 8) : 'النسخة الأصلية (بلا تحديث فوري بعد)'}
            </Text>
            {!!Updates.createdAt && (
              <Text style={styles.versionDate}>نُشرت: {formatDateTime(Updates.createdAt)}</Text>
            )}
          </View>
          <Text style={styles.updateNote}>
            التطبيق يفحص التحديثات تلقائياً عند فتحه. لو تشك إن تحديث معيّن ما وصلك، اضغط الزر تحت للتأكد مباشرة.
          </Text>
          <Pressable style={[styles.checkUpdateBtn, checkingUpdate && styles.btnDisabled]} onPress={checkForUpdate} disabled={checkingUpdate}>
            {checkingUpdate ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={styles.checkUpdateBtnText}>🔄 التحقق من التحديثات الآن</Text>
            )}
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

  updateNote: { color: colors.muted, fontSize: 11, lineHeight: 17, marginBottom: 10, textAlign: 'right' },
  versionBox: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 12, marginBottom: 12,
  },
  versionLabel: { color: colors.muted, fontSize: 10, textAlign: 'right' },
  versionValue: { color: colors.white, fontWeight: '900', fontSize: 14, marginTop: 4, textAlign: 'right' },
  versionDate: { color: colors.muted, fontSize: 10, marginTop: 4, textAlign: 'right' },
  checkUpdateBtn: { backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  checkUpdateBtnText: { color: colors.accent, fontWeight: 'bold', fontSize: 13 },
  securityBtn: { backgroundColor: 'rgba(139,92,246,0.1)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  securityBtnText: { color: colors.purple, fontWeight: 'bold', fontSize: 13 },
});
