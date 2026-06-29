/**
 * FamilyDetails.jsx — لوحة تفاصيل أسرة كاملة
 * يُستدعى من FamiliesScreen داخل Modal، وقابل لإعادة الاستخدام في أي
 * شاشة تحتاج عرض بيانات أسرة (مثل PendingRequests عند مراجعة طلب).
 *
 * Props:
 *   selected   — بيانات الأسرة المختارة
 *   campMap    — { campId: campName } لتحويل المعرّف لاسم مقروء
 *   selMembers — أفراد هذه الأسرة
 *   families   — كل الأسر (لكشف التكرارات)
 *   allMembers — كل الأفراد (لكشف التكرارات)
 *   canEdit    — هل المستخدم يملك صلاحية التعديل
 *   canDelete  — هل المستخدم يملك صلاحية الحذف
 *   onEdit     — callback عند الضغط على تعديل
 *   onDelete   — callback عند الضغط على حذف
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { calcAge } from '../../lib/helpers'
import { formatDate } from '../../lib/utils'
import DuplicateWarnings from './DuplicateWarnings'
import FamilyMembersView from './FamilyMembersView'
import { colors, radius } from '../../theme'

export default function FamilyDetails({
  selected, campMap, selMembers,
  families, allMembers,
  canEdit, canDelete, onEdit, onDelete,
}) {
  const fields = buildFields(selected, campMap)

  return (
    <View style={styles.wrap}>
      <DuplicateWarnings family={selected} families={families} allMembers={allMembers} />

      {/* بيانات رب الأسرة */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>👤 رب الأسرة</Text>
        <View style={styles.grid}>
          {fields.map(([k, v]) => (
            <View key={k} style={styles.field}>
              <Text style={styles.fieldKey}>{k}</Text>
              <Text style={styles.fieldValue}>{v}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* أفراد الأسرة */}
      <FamilyMembersView members={selMembers} family={selected} />

      {/* ملاحظات */}
      {!!selected.notes && (
        <View style={styles.notes}>
          <Text style={styles.notesLabel}>📝 ملاحظات</Text>
          <Text style={styles.notesText}>{selected.notes}</Text>
        </View>
      )}

      {/* أزرار الإجراءات */}
      <View style={styles.actions}>
        {canEdit && (
          <TouchableOpacity onPress={onEdit} style={styles.editBtn} activeOpacity={0.8}>
            <Text style={styles.editBtnText}>✏️ تعديل</Text>
          </TouchableOpacity>
        )}
        {canDelete && (
          <TouchableOpacity onPress={onDelete} style={styles.deleteBtn} activeOpacity={0.8}>
            <Text style={styles.deleteBtnText}>🗑️ حذف</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

/** بناء قائمة الحقول المعروضة — دالة صرفة منفصلة عن الـ UI */
function buildFields(f, campMap) {
  return [
    ['الاسم',              f.head_name],
    ['رقم الهوية',         f.head_id],
    ['الجوال',             f.phone1],
    ['جوال 2',             f.phone2],
    ['الجنس',              f.head_gender],
    ['الحالة الاجتماعية',  f.head_marital],
    ['المخيم',             campMap[f.camp_id]],
    ['الخيمة',             f.tent],
    ['المنطقة الأصلية',    f.original_address],
    ['العنوان التفصيلي',   f.address_details],
    ['تاريخ الميلاد',      f.head_dob ? formatDate(f.head_dob) : null],
    ['العمر',              calcAge(f.head_dob) ? `${calcAge(f.head_dob)} سنة` : null],
    ['تاريخ التسجيل',      formatDate(f.created_at)],
  ].filter(([, v]) => v)
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  card: {
    backgroundColor: colors.surface2, borderRadius: radius.md, padding: 14,
    borderWidth: 1, borderColor: colors.accent + '33',
  },
  cardTitle: { color: colors.accent, fontSize: 12, fontWeight: '700', marginBottom: 10 },
  grid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: 8,
    minWidth: '46%', flexGrow: 1,
  },
  fieldKey:   { color: colors.muted, fontSize: 9, marginBottom: 2 },
  fieldValue: { color: colors.white, fontWeight: '700', fontSize: 12 },
  notes:      { backgroundColor: colors.surface2, borderRadius: radius.md, padding: 10 },
  notesLabel: { color: colors.muted, fontSize: 10, marginBottom: 4 },
  notesText:  { color: colors.white, fontSize: 12 },
  actions:    { flexDirection: 'row', gap: 8 },
  editBtn: {
    flex: 1, backgroundColor: colors.accent,
    borderRadius: radius.md, paddingVertical: 12, alignItems: 'center',
  },
  editBtnText: { color: colors.bg, fontWeight: '900', fontSize: 13 },
  deleteBtn: {
    flex: 1,
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: radius.md, paddingVertical: 12, alignItems: 'center',
  },
  deleteBtnText: { color: colors.red, fontWeight: '700', fontSize: 13 },
})
