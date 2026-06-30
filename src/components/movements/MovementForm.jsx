/**
 * MovementForm.jsx — فورم تسجيل حركة أسرة (دخول/خروج/نقل)
 * منقول من <form> داخل camp-registry-react/src/pages/Movements/Movements.jsx
 *
 * تكييف React Native:
 *   - <input type="date"> غير موجود → TextInput نصي بصيغة YYYY-MM-DD
 *     (تجنباً لإضافة مكتبة date-picker جديدة تتطلب بناء APK إضافي الآن؛
 *     يمكن الترقية لاحقاً عند الحاجة الفعلية لتجربة أفضل)
 *   - <textarea> → TextInput multiline
 *   - أزرار نوع الحركة (entry/exit/transfer) بقيت كأزرار مخصصة (نفس النمط
 *     البصري للأصل) بدل Select، لأنها 3 خيارات بصرية واضحة بالألوان
 */
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import Modal from '../ui/Modal'
import Select from '../ui/Select'
import { TYPE_MAP } from './MovementCard'
import { colors, radius } from '../../theme'

export default function MovementForm({
  visible, onClose, form, setForm,
  camps, filteredFamilies, search, setSearch,
  onSave, saving,
}) {
  function set(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  return (
    <Modal open={visible} onClose={onClose} title="➕ تسجيل حركة" size="md">
      <View style={styles.form}>
        <View>
          <Text style={styles.label}>بحث عن أسرة</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="اسم رب الأسرة أو رقم الهوية..."
            placeholderTextColor={colors.muted}
            style={[styles.input, { marginBottom: 8 }]}
          />
          <Select
            value={form.family_id}
            onChange={v => set('family_id', v)}
            placeholder="— اختر أسرة —"
            options={filteredFamilies.slice(0, 50).map(f => ({ value: f.id, label: f.head_name }))}
          />
        </View>

        <View>
          <Text style={styles.label}>نوع الحركة</Text>
          <View style={styles.typeRow}>
            {Object.entries(TYPE_MAP).map(([k, v]) => {
              const active = form.type === k
              return (
                <TouchableOpacity
                  key={k}
                  onPress={() => set('type', k)}
                  style={[
                    styles.typeBtn,
                    { borderColor: active ? v.color : colors.border, backgroundColor: active ? v.color + '22' : 'transparent' },
                  ]}
                >
                  <Text style={[styles.typeBtnText, { color: active ? v.color : colors.muted }]}>{v.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {(form.type === 'exit' || form.type === 'transfer') && (
          <Select
            label="من مخيم"
            value={form.from_camp}
            onChange={v => set('from_camp', v)}
            placeholder="— اختر —"
            options={camps.map(c => ({ value: c.id, label: c.name }))}
          />
        )}

        {(form.type === 'entry' || form.type === 'transfer') && (
          <Select
            label="إلى مخيم"
            value={form.to_camp}
            onChange={v => set('to_camp', v)}
            placeholder="— اختر —"
            options={camps.map(c => ({ value: c.id, label: c.name }))}
          />
        )}

        <View>
          <Text style={styles.label}>التاريخ</Text>
          <TextInput
            value={form.date}
            onChangeText={v => set('date', v)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.mono]}
          />
        </View>

        <View>
          <Text style={styles.label}>السبب</Text>
          <TextInput
            value={form.reason}
            onChangeText={v => set('reason', v)}
            placeholder="سبب الحركة..."
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        </View>

        <View>
          <Text style={styles.label}>ملاحظات</Text>
          <TextInput
            value={form.notes}
            onChangeText={v => set('notes', v)}
            placeholder=""
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={2}
            style={[styles.input, styles.textarea]}
          />
        </View>

        <View style={styles.actions}>
          <TouchableOpacity onPress={onSave} disabled={saving} style={[styles.saveBtn, saving && styles.disabled]}>
            <Text style={styles.saveBtnText}>{saving ? 'جاري الحفظ...' : '✅ تسجيل'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>إلغاء</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10,
    color: colors.white, fontSize: 13, textAlign: 'right',
  },
  mono: { textAlign: 'left', fontFamily: 'monospace' },
  textarea: { textAlignVertical: 'top', minHeight: 60 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, alignItems: 'center' },
  typeBtnText: { fontSize: 11, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  saveBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
  saveBtnText: { color: colors.bg, fontWeight: '900', fontSize: 14 },
  cancelBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.6 },
})
