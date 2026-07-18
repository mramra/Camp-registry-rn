import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Alert, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { getCreatableRoles } from '../../lib/permissions';
import { randomPassword } from '../../lib/utils';
import { fetchOrgMembers, fetchCamps, updateOrgMember, callAdminAPI } from '../../lib/supabase';
import { showError, showSuccess } from '../../utils/toast';
import FormSection from '../../components/ui/FormSection';
import FormInput from '../../components/ui/FormInput';
import SelectField from '../../components/ui/SelectField';
import colors from '../../theme/colors';

const ROLE_LABELS = {
  super_admin: '🔴 مدير الإيواء',
  camp_delegate: '🟠 مندوب مخيم',
  assistant: '🟡 مساعد',
};

const PERMISSION_TOGGLES = [
  { key: 'can_add', label: 'يقدر يضيف' },
  { key: 'can_edit', label: 'يقدر يعدّل' },
  { key: 'can_delete', label: 'يقدر يحذف' },
  { key: 'can_export', label: 'يقدر يصدّر بيانات' },
  { key: 'can_import', label: 'يقدر يستورد بيانات' },
];

export default function UserFormScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const userId = route.params?.userId || null;
  const { profile, orgId, isOwner } = useAuth();

  const [allUsers, setAllUsers] = useState([]);
  const [camps, setCamps] = useState([]);
  const [loading, setLoading] = useState(!!userId);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('camp_delegate');
  const [campId, setCampId] = useState(null);
  const [supervisorId, setSupervisorId] = useState(null);
  const [permissions, setPermissions] = useState({
    can_add: true,
    can_edit: true,
    can_delete: false,
    can_export: false,
    can_import: false,
  });
  const [bypassApproval, setBypassApproval] = useState(false);
  const [canReviewApprovals, setCanReviewApprovals] = useState(true);

  const creatableRoles = getCreatableRoles(profile);
  const editingUser = userId ? allUsers.find((u) => u.id === userId) : null;

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const [users, campsData] = await Promise.all([fetchOrgMembers(orgId), fetchCamps(orgId)]);
      setAllUsers(users);
      setCamps(campsData);

      if (userId) {
        const u = users.find((x) => x.id === userId);
        if (u) {
          setFullName(u.full_name || '');
          setNationalId(u.national_id || '');
          setPhone(u.phone || '');
          setRole(u.role);
          setCampId(u.camp_id || null);
          setSupervisorId(u.supervisor_id || null);
          setPermissions({
            can_add: !!u.can_add,
            can_edit: !!u.can_edit,
            can_delete: !!u.can_delete,
            can_export: !!u.can_export,
            can_import: !!u.can_import,
          });
          setBypassApproval(!!u.bypass_approval);
          setCanReviewApprovals(!!u.can_review_approvals);
        }
      }
      setLoading(false);
    })();
  }, [orgId, userId]);

  const togglePermission = (key) => setPermissions((p) => ({ ...p, [key]: !p[key] }));

  const superAdmins = allUsers.filter((u) => u.role === 'super_admin');
  const delegates = allUsers.filter((u) => u.role === 'camp_delegate');

  // مخيمات بلا مندوب حالياً (أو المخيم الحالي عند التعديل) — نفس قيد الأصل
  const availableCamps = camps
    .filter((c) => c.camp_type !== 'sub')
    .filter(
      (c) =>
        c.id === editingUser?.camp_id ||
        !allUsers.some((u) => u.role === 'camp_delegate' && u.camp_id === c.id && u.id !== userId)
    );

  const resolveCampId = () => {
    if (role === 'assistant') {
      const sup = allUsers.find((u) => u.id === supervisorId);
      return sup?.camp_id || null;
    }
    if (role === 'super_admin') return null;
    return campId;
  };

  const validate = () => {
    const e = {};
    if (!fullName.trim()) e.fullName = 'الاسم مطلوب';
    if (!userId) {
      if (!nationalId.trim()) e.nationalId = 'رقم الهوية مطلوب';
      else if (nationalId.trim().length < 9) e.nationalId = 'رقم الهوية أقل من 9 أرقام';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (userId) {
        // تعديل مستخدم موجود
        const result = await updateOrgMember(userId, {
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          camp_id: resolveCampId(),
          supervisor_id: supervisorId || null,
          ...permissions,
          bypass_approval: bypassApproval,
          can_review_approvals: role !== 'assistant' ? canReviewApprovals : false,
        }, { ...profile, org_id: orgId });
        if (!result.success) {
          showError(result.error || 'فشل التحديث');
          return;
        }
        showSuccess('تم تحديث بيانات المستخدم');
        navigation.goBack();
      } else {
        // إنشاء مستخدم جديد — يستدعي Edge Function (ينشئ حساب Auth فعلي)
        const pass = randomPassword();
        const payload = {
          email: `${nationalId.trim()}@c.co`,
          password: pass,
          full_name: fullName.trim(),
          national_id: nationalId.trim(),
          phone: phone.trim(),
          role,
          camp_id: resolveCampId(),
          org_id: orgId,
          supervisor_id: supervisorId || null,
          ...permissions,
          allowed_pages: JSON.stringify({}),
          created_by: profile?.id,
          bypass_approval: bypassApproval,
          can_review_approvals: role !== 'assistant' ? canReviewApprovals : false,
        };

        await callAdminAPI('create_user', payload);

        Alert.alert('✅ تم الإنشاء', `كلمة المرور: ${pass}\n\nشاركها مع المستخدم الآن — لن تظهر مرة أخرى.`, [
          { text: 'حسناً', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (e) {
      showError('خطأ: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <FormSection title="👤 بيانات المستخدم">
          <FormInput label="الاسم الكامل *" value={fullName} onChangeText={setFullName} error={errors.fullName} />

          {!userId && (
            <FormInput
              label="رقم الهوية *"
              placeholder="1xxxxxxxxx"
              value={nationalId}
              onChangeText={setNationalId}
              keyboardType="number-pad"
              maxLength={10}
              error={errors.nationalId}
            />
          )}

          <FormInput label="رقم الجوال" placeholder="05xxxxxxxx" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

          {!userId && (
            <SelectField
              label="الدور *"
              value={ROLE_LABELS[role]}
              options={creatableRoles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
              onSelect={setRole}
            />
          )}

          {isOwner && (
            <Pressable style={[styles.toggleRow, bypassApproval && styles.toggleRowActive]} onPress={() => setBypassApproval((v) => !v)}>
              <Text style={[styles.toggleLabel, bypassApproval && styles.toggleLabelActive]}>
                🔓 صلاحية دائمة (تجاوز موافقة ملك المنصة)
              </Text>
              <Text style={styles.toggleIcon}>{bypassApproval ? '✅' : '⬜'}</Text>
            </Pressable>
          )}

          {isOwner && ['super_admin', 'camp_delegate'].includes(role) && (
            <Pressable
              style={[styles.toggleRow, canReviewApprovals && styles.toggleRowActive]}
              onPress={() => setCanReviewApprovals((v) => !v)}
            >
              <Text style={[styles.toggleLabel, canReviewApprovals && styles.toggleLabelActive]}>
                📋 يقدر يوافق على طلبات من تحته
              </Text>
              <Text style={styles.toggleIcon}>{canReviewApprovals ? '✅' : '⬜'}</Text>
            </Pressable>
          )}

          {role !== 'super_admin' && role !== 'assistant' && (
            <SelectField
              label="المخيم"
              value={camps.find((c) => c.id === campId)?.name}
              options={[{ value: '', label: '— بدون مخيم —' }, ...availableCamps.map((c) => ({ value: c.id, label: c.name }))]}
              onSelect={(v) => setCampId(v || null)}
              placeholder="— بدون مخيم —"
            />
          )}

          {role === 'camp_delegate' && isOwner && (
            <SelectField
              label="👤 تابع لمدير إيواء"
              value={superAdmins.find((u) => u.id === supervisorId)?.full_name}
              options={superAdmins.map((u) => ({ value: u.id, label: u.full_name }))}
              onSelect={setSupervisorId}
              placeholder="— اختر المدير —"
            />
          )}

          {role === 'assistant' && (
            <>
              <SelectField
                label="🟠 تابع لمندوب"
                value={delegates.find((u) => u.id === supervisorId)?.full_name}
                options={delegates.map((u) => ({
                  value: u.id,
                  label: `${u.full_name}${u.camp_id ? ' — ' + (camps.find((c) => c.id === u.camp_id)?.name || '') : ''}`,
                }))}
                onSelect={setSupervisorId}
                placeholder="— اختر المندوب —"
              />
              {!!supervisorId && (
                <View style={styles.autoCampBox}>
                  <Text style={styles.autoCampLabel}>⛺ المخيم (تلقائي حسب المندوب)</Text>
                  <Text style={styles.autoCampValue}>
                    {camps.find((c) => c.id === delegates.find((u) => u.id === supervisorId)?.camp_id)?.name ||
                      '— لم يُحدَّد مخيم للمندوب —'}
                  </Text>
                </View>
              )}
            </>
          )}
        </FormSection>

        <FormSection title="🔐 الصلاحيات">
          {PERMISSION_TOGGLES.map((p) => (
            <Pressable
              key={p.key}
              style={[styles.toggleRow, permissions[p.key] && styles.toggleRowActive]}
              onPress={() => togglePermission(p.key)}
            >
              <Text style={[styles.toggleLabel, permissions[p.key] && styles.toggleLabelActive]}>{p.label}</Text>
              <Text style={styles.toggleIcon}>{permissions[p.key] ? '✅' : '⬜'}</Text>
            </Pressable>
          ))}
        </FormSection>

        <View style={styles.row}>
          <Pressable style={[styles.saveBtn, saving && styles.disabled]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>{userId ? '💾 حفظ التعديلات' : '✅ إنشاء المستخدم'}</Text>}
          </Pressable>
          <Pressable style={styles.cancelBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelBtnText}>إلغاء</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },

  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  toggleRowActive: { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: colors.accent },
  toggleLabel: { color: colors.muted, fontSize: 12, fontWeight: 'bold' },
  toggleLabelActive: { color: colors.accent },
  toggleIcon: { fontSize: 14 },

  autoCampBox: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 12 },
  autoCampLabel: { color: colors.muted, fontSize: 11, textAlign: 'right' },
  autoCampValue: { color: colors.white, fontWeight: 'bold', fontSize: 13, marginTop: 4, textAlign: 'right' },

  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
  saveBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
  cancelBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
});
