/**
 * CampForm.jsx — فورم إضافة/تعديل مخيم
 * منقول من <form> داخل camp-registry-react/src/pages/Camps/CampsList.jsx
 *
 * تكييف React Native:
 *   - navigator.geolocation → expo-location (ليس مثبتاً بعد؛ زر "استخدام موقعي
 *     الحالي" مُعطَّل مؤقتاً بدلاً من رمي خطأ — انظر تعليق lat/lng أدناه)
 *   - <a href maps.google.com> → Linking.openURL
 *
 * Props:
 *   visible, onClose — حالة Modal
 *   form, setForm     — حالة الفورم (مُدارة من الشاشة الأم)
 *   editCamp          — المخيم الجاري تعديله (null = إضافة جديد)
 *   mainCamps         — قائمة المخيمات الرئيسية (لاختيار الأب عند إضافة فرع)
 *   orgMembers        — كل الأعضاء (لاختيار مدير الإيواء)
 *   isOwner, isCampDelegate, isSuperAdmin, profile, camps — صلاحيات وسياق
 *   onSave            — callback الحفظ
 *   saving            — حالة جارٍ الحفظ
 */
import { View, Text, TextInput, TouchableOpacity, Linking, StyleSheet } from 'react-native'
import Modal from '../ui/Modal'
import Select, { DisabledField } from '../ui/Select'
import { colors, radius } from '../../theme'

export default function CampForm({
  visible, onClose, form, setForm, editCamp,
  mainCamps, orgMembers, isOwner, isCampDelegate, isSuperAdmin, profile, camps,
  onSave, saving,
}) {
  const isDelegateAdding = !editCamp && isCampDelegate && !isOwner && !isSuperAdmin

  function set(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  return (
    <Modal open={visible} onClose={onClose} title={editCamp ? '✏️ تعديل مخيم' : '➕ إضافة مخيم'} size="md">
      <View style={styles.form}>
        <View>
          <Text style={styles.label}>اسم المخيم *</Text>
          <TextInput
            value={form.name}
            onChangeText={v => set('name', v)}
            placeholder="مثال: مخيم العزايزة"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        </View>

        <View style={styles.row2}>
          <View style={styles.col}>
            {isDelegateAdding ? (
              <DisabledField label="النوع" text="🏕️ فرعي (تحت مخيمك)" />
            ) : (
              <Select
                label="النوع"
                value={form.camp_type}
                onChange={v => setForm(f => ({ ...f, camp_type: v, parent_camp_id: '' }))}
                options={[
                  { value: 'main', label: '🏕️ رئيسي' },
                  { value: 'sub',  label: '🏕️ فرعي' },
                ]}
              />
            )}
          </View>
          <View style={styles.col}>
            <Select
              label="الحالة"
              value={form.status}
              onChange={v => set('status', v)}
              options={[
                { value: 'active',    label: '✅ نشط' },
                { value: 'suspended', label: '⏸️ موقوف' },
                { value: 'closed',    label: '🔴 مغلق' },
              ]}
            />
          </View>
        </View>

        {form.camp_type === 'sub' && (
          isDelegateAdding ? (
            <DisabledField
              label="المخيم الرئيسي"
              text={`🏕️ ${camps.find(c => c.id === profile?.camp_id)?.name || 'مخيمك'}`}
            />
          ) : (
            <Select
              label="المخيم الرئيسي"
              value={form.parent_camp_id}
              onChange={v => set('parent_camp_id', v)}
              placeholder="— اختر —"
              options={mainCamps.map(c => ({ value: c.id, label: c.name }))}
            />
          )
        )}

        {isOwner && (
          <View>
            <Select
              label="🔴 مدير الإيواء"
              value={form.manager_id}
              onChange={v => set('manager_id', v)}
              placeholder={form.camp_type === 'sub' && form.parent_camp_id
                ? '— تلقائي من المخيم الرئيسي —'
                : '— بدون مدير إيواء —'}
              options={orgMembers.filter(m => m.role === 'super_admin').map(m => ({ value: m.id, label: m.full_name }))}
            />
            {form.camp_type === 'sub' && form.parent_camp_id && !form.manager_id && (
              <Text style={styles.hint}>سيُستخدم مدير المخيم الرئيسي تلقائياً ما لم تختر غيره</Text>
            )}
          </View>
        )}

        <View>
          <Text style={styles.label}>العنوان</Text>
          <TextInput
            value={form.address}
            onChangeText={v => set('address', v)}
            placeholder="موقع المخيم"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        </View>

        <View>
          <Text style={styles.label}>📍 إحداثيات GPS</Text>
          <TextInput
            value={form.coordinates}
            onChangeText={v => set('coordinates', v)}
            placeholder="31.547565,34.461274"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.mono]}
          />
          <Text style={styles.hintSmall}>الصيغة: خط_العرض,خط_الطول مثل 31.547565,34.461274</Text>
          {/* ⚠️ تكييف: "استخدام موقعي الحالي" يحتاج expo-location (غير مثبَّت بعد).
              يُترك للإدخال اليدوي حالياً — يمكن إضافة الزر لاحقاً عند تثبيت الحزمة. */}
          {!!form.coordinates && form.coordinates.includes(',') && (
            <TouchableOpacity
              onPress={() => Linking.openURL(`https://maps.google.com/?q=${form.coordinates.trim()}`)}
              style={styles.mapPreviewBtn}
            >
              <Text style={styles.mapPreviewText}>🗺️ معاينة على الخريطة</Text>
            </TouchableOpacity>
          )}
        </View>

        <View>
          <Text style={styles.label}>الطاقة الاستيعابية (أسرة)</Text>
          <TextInput
            value={String(form.capacity || '')}
            onChangeText={v => set('capacity', v)}
            placeholder="0 = غير محدد"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            style={styles.input}
          />
        </View>

        <View style={styles.actions}>
          <TouchableOpacity onPress={onSave} disabled={saving} style={[styles.saveBtn, saving && styles.disabled]}>
            <Text style={styles.saveBtnText}>{saving ? 'جاري الحفظ...' : editCamp ? '💾 حفظ' : '✅ إضافة'}</Text>
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
  row2: { flexDirection: 'row', gap: 8 },
  col: { flex: 1 },
  hint: { color: colors.muted, fontSize: 11, marginTop: 4 },
  hintSmall: { color: colors.muted, fontSize: 10, marginTop: 4 },
  mapPreviewBtn: {
    marginTop: 6, paddingVertical: 6, borderRadius: radius.md,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)', backgroundColor: 'rgba(59,130,246,0.05)',
    alignItems: 'center',
  },
  mapPreviewText: { color: colors.blue, fontSize: 11 },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  saveBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
  saveBtnText: { color: colors.bg, fontWeight: '900', fontSize: 14 },
  cancelBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.6 },
})
