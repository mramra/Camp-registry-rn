/**
 * UserForm.jsx — فورم إضافة/تعديل مستخدم
 * منقول من camp-registry-react/src/pages/Users/UsersList.jsx (Modal داخل الملف)
 * نفس منطق الأدوار الهرمي بالكامل: مدير→مندوب→مساعد، تحديد المخيم
 * والمشرف حسب الدور، صلاحيات bypass_approval وcan_review_approvals.
 */
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import Modal from '../ui/Modal'
import Select from '../ui/Select'
import { ROLE_CONFIG } from './roleConfig'
import { colors, radius } from '../../theme'

export default function UserForm({
  visible, onClose, mode, // 'add' | 'edit'
  form, setForm, errors,
  creatableRoles, camps, users,
  profile, isOwner, isCampDelegate, isSuperAdmin,
  onSave, saving, editUser,
}) {
  function set(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  const isAdd = mode === 'add'
  const supervisorCampId = isCampDelegate && !isOwner && !isSuperAdmin
    ? profile?.camp_id
    : users.find(u => u.id === form.supervisor_id)?.camp_id
  const subCamps = supervisorCampId ? camps.filter(c => c.parent_camp_id === supervisorCampId) : []
  const campMap = Object.fromEntries(camps.map(c => [c.id, c.name]))

  return (
    <Modal open={visible} onClose={onClose} title={isAdd ? '➕ إضافة مستخدم' : `✏️ ${editUser?.full_name || ''}`} size="lg">
      <View style={styles.form}>
        <Field label="الاسم الكامل *" value={form.full_name} onChange={v => set('full_name', v)} error={errors.full_name} />

        {isAdd ? (
          <View>
            <Field label="رقم الهوية * (يُستخدم كاسم دخول)" value={form.national_id}
              onChange={v => set('national_id', v)} keyboardType="number-pad" error={errors.national_id} />
            <Text style={styles.hint}>🔑 هذا الرقم هو ما يُدخله المستخدم للدخول للنظام</Text>
          </View>
        ) : (
          <Field label="🪪 رقم الهوية (لا يمكن تعديله)" value={form.national_id} editable={false} disabled />
        )}

        <Field label="رقم الجوال" value={form.phone} onChange={v => set('phone', v)} keyboardType="phone-pad" />

        {/* الدور */}
        {isAdd ? (
          <View>
            <Text style={styles.label}>الدور *</Text>
            <View style={{ gap: 6 }}>
              {creatableRoles.map(r => {
                const active = form.role === r
                const cfg = ROLE_CONFIG[r]
                return (
                  <TouchableOpacity key={r} onPress={() => { set('role', r); set('assistant_camp_id', '') }}
                    style={[styles.roleBtn, active && { backgroundColor: cfg.bgColor, borderColor: cfg.borderColor }]}>
                    <Text style={{ fontSize: 14 }}>{cfg.icon}</Text>
                    <Text style={[styles.roleBtnText, active && { color: cfg.textColor }]}>{cfg.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        ) : (isOwner && editUser?.role !== 'platform_owner') && (
          <Select label="الدور" value={form.role} onChange={v => set('role', v)}
            options={['super_admin', 'camp_delegate', 'assistant'].map(r => ({ value: r, label: ROLE_CONFIG[r].label }))} />
        )}

        {/* المخيم — للمدير/المندوب */}
        {form.role !== 'super_admin' && form.role !== 'assistant' && (
          <View>
            <Select label="المخيم *" value={form.camp_id} onChange={v => set('camp_id', v)}
              placeholder="— اختر المخيم —"
              options={camps
                .filter(c => c.camp_type !== 'sub')
                .filter(c => isAdd ? !users.some(u => u.role === 'camp_delegate' && u.camp_id === c.id) : true)
                .map(c => ({ value: c.id, label: c.name }))} />
            {errors.camp_id && <Text style={styles.errorText}>{errors.camp_id}</Text>}
          </View>
        )}

        {/* تجاوز الموافقة — لملك المنصة فقط */}
        {isOwner && (isAdd ? form.role !== 'platform_owner' : editUser?.role !== 'platform_owner') && (
          <ToggleRow label="🔓 صلاحية دائمة (تجاوز موافقة ملك المنصة)"
            value={form.bypass_approval} onToggle={() => set('bypass_approval', !form.bypass_approval)} />
        )}

        {/* يقدر يوافق على طلبات */}
        {isOwner && ['super_admin', 'camp_delegate'].includes(form.role) && (
          <ToggleRow label="📋 يقدر يوافق على طلبات من تحته"
            value={form.can_review_approvals} onToggle={() => set('can_review_approvals', !form.can_review_approvals)} />
        )}

        {/* تابع لمدير إيواء — للمندوب */}
        {form.role === 'camp_delegate' && isOwner && (
          <Select label="👤 تابع لمدير إيواء" value={form.supervisor_id} onChange={v => set('supervisor_id', v)}
            placeholder="— اختر المدير —"
            options={users.filter(u => u.role === 'super_admin').map(u => ({ value: u.id, label: u.full_name }))} />
        )}

        {/* تابع لمندوب — للمساعد */}
        {form.role === 'assistant' && isCampDelegate && !isOwner && !isSuperAdmin && (
          <View>
            <Text style={styles.label}>🟠 تابع لمندوب</Text>
            <View style={styles.disabledBox}><Text style={styles.disabledText}>👤 تابع لك مباشرة</Text></View>
          </View>
        )}
        {form.role === 'assistant' && (isOwner || isSuperAdmin) && (
          <View>
            <Select label="🟠 تابع لمندوب *" value={form.supervisor_id}
              onChange={v => { set('supervisor_id', v); set('assistant_camp_id', '') }}
              placeholder="— اختر المندوب —"
              options={users.filter(u => u.role === 'camp_delegate').map(u => ({
                value: u.id, label: `${u.full_name}${u.camp_id && campMap[u.camp_id] ? ' — ' + campMap[u.camp_id] : ''}`,
              }))} />
            {errors.supervisor_id && <Text style={styles.errorText}>{errors.supervisor_id}</Text>}
            {!isAdd && form.supervisor_id && (
              <View style={styles.infoBox}>
                <Text style={styles.infoBoxLabel}>⛺ المخيم (تلقائي حسب المندوب)</Text>
                <Text style={styles.infoBoxValue}>
                  {campMap[users.find(u => u.id === form.supervisor_id)?.camp_id] || '— لم يُحدَّد مخيم للمندوب —'}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* مخيم المساعد — رئيسي أو فرع محدد */}
        {isAdd && form.role === 'assistant' && supervisorCampId && (
          <Select label="⛺ مخيم المساعد *" value={form.assistant_camp_id || supervisorCampId}
            onChange={v => set('assistant_camp_id', v)}
            options={[
              { value: supervisorCampId, label: `🏕️ ${campMap[supervisorCampId]} (شامل كل الفروع)` },
              ...subCamps.map(c => ({ value: c.id, label: `↳ ${c.name} (فرع محدد فقط)` })),
            ]} />
        )}

        <View style={styles.actions}>
          <TouchableOpacity onPress={onSave} disabled={saving} style={[styles.saveBtn, saving && styles.disabled]}>
            <Text style={styles.saveBtnText}>{saving ? 'جاري الحفظ...' : isAdd ? '✅ إنشاء المستخدم' : '💾 حفظ التعديلات'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>إلغاء</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

function Field({ label, value, onChange, error, disabled, ...props }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChange} editable={!disabled}
        placeholderTextColor={colors.muted}
        style={[styles.input, error && styles.inputError, disabled && styles.inputDisabled]}
        {...props}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  )
}

function ToggleRow({ label, value, onToggle }) {
  return (
    <TouchableOpacity onPress={onToggle} style={[styles.toggleRow, value && styles.toggleRowActive]}>
      <Text style={[styles.toggleLabel, value && { color: colors.accent }]}>{label}</Text>
      <View style={[styles.toggleTrack, value && styles.toggleTrackActive]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbActive]} />
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 10, color: colors.white, fontSize: 13, textAlign: 'right',
  },
  inputError: { borderColor: colors.red },
  inputDisabled: { opacity: 0.5 },
  errorText: { color: colors.red, fontSize: 11, marginTop: 4 },
  hint: { color: colors.muted, fontSize: 11, marginTop: 4 },
  roleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
  },
  roleBtnText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  disabledBox: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  disabledText: { color: colors.muted, fontSize: 13 },
  infoBox: { marginTop: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  infoBoxLabel: { color: colors.muted, fontSize: 11 },
  infoBoxValue: { color: colors.white, fontSize: 13, fontWeight: '700', marginTop: 2 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
  },
  toggleRowActive: { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: colors.accent },
  toggleLabel: { color: colors.muted, fontSize: 13, fontWeight: '700', flex: 1 },
  toggleTrack: { width: 40, height: 22, borderRadius: 11, backgroundColor: colors.border, justifyContent: 'center' },
  toggleTrackActive: { backgroundColor: colors.accent },
  toggleThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.white, marginLeft: 2 },
  toggleThumbActive: { marginLeft: 22 },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  saveBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
  saveBtnText: { color: colors.bg, fontWeight: '900', fontSize: 14 },
  cancelBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.6 },
})
