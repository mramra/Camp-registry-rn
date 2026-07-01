/**
 * MemberRow.jsx — صف فرد واحد داخل فورم الأسرة
 * منقول من camp-registry-react/src/pages/Families/FamilyForm.jsx (مكوّن محلي)
 *
 * نفس المنطق بالضبط:
 *   - قائمة صلة القرابة تتغيّر حسب الجنس المختار (RELATION_BY_GENDER)
 *   - الصف الدراسي الفعلي: يظهر فقط لمن بعمر الدراسة (4-17)، مُعبَّأ
 *     تلقائياً بالمتوقع حسب العمر، والخيارات المتاحة من المتوقع نازلاً
 *     فقط (لا معنى لصف أعلى من عمره)
 *   - المؤهل العلمي: يظهر فقط للبالغين (18+)
 *   - تحقق Luhn لحظي لرقم الهوية، تحقق اسم رباعي لحظي
 */
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import Select from '../ui/Select'
import DateInput from '../ui/DateInput'
import {
  calcAge, luhnCheck, validateName, validateDob,
  QUALIFICATION_OPTIONS, GRADE_OPTIONS, getExpectedGrade, isSchoolAge,
} from '../../lib/helpers'
import { colors, radius } from '../../theme'

const RELATION_BY_GENDER = {
  'ذكر':  ['زوج','ابن','أب','أخ','جد','حفيد','عم','خال','أخرى'],
  'أنثى': ['زوجة','ابنة','أم','أخت','جدة','حفيدة','عمة','خالة','أخرى'],
}
const ALL_RELATIONS = [...new Set([
  ...RELATION_BY_GENDER['ذكر'], ...RELATION_BY_GENDER['أنثى'],
])]
const HEALTH_OPTIONS = [
  { value: 'سليم', label: '✅ سليم' },
  { value: 'مريض', label: '🤒 مريض' },
  { value: 'معاق', label: '♿ معاق' },
  { value: 'مزمن', label: '💊 مرض مزمن' },
  { value: 'مصاب', label: '🩹 إصابة حرب' },
]

export default function MemberRow({ member, index, onUpdate, onRemove, onOpenHealth, errors }) {
  const relations = member.gender
    ? (RELATION_BY_GENDER[member.gender] || ALL_RELATIONS)
    : ALL_RELATIONS

  const dobErr = validateDob(member.dob)
  const age = calcAge(member.dob)
  const nameErr = member.name && !errors[`m_name_${index}`] ? validateName(member.name) : null
  const healthCount = (member.disabilities?.length || 0) + (member.injuries?.length || 0)
    + (member.chronic_diseases?.length || 0) + (member.female_status?.length || 0)
    + (member.orphan_status ? 1 : 0)

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>فرد {index + 1}</Text>
        <TouchableOpacity onPress={() => onRemove(member.id)} style={styles.removeBtn}>
          <Text style={styles.removeBtnText}>حذف</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        {/* الاسم */}
        <View>
          <Text style={styles.label}>الاسم *</Text>
          <TextInput
            value={member.name}
            onChangeText={v => onUpdate(member.id, 'name', v)}
            placeholder="الاسم الرباعي"
            placeholderTextColor={colors.muted}
            style={[styles.input, errors[`m_name_${index}`] && styles.inputError]}
          />
          {errors[`m_name_${index}`] && <Text style={styles.errorText}>{errors[`m_name_${index}`]}</Text>}
          {!errors[`m_name_${index}`] && nameErr && <Text style={styles.warnText}>{nameErr}</Text>}
          {!errors[`m_name_${index}`] && !nameErr && member.name && (
            <Text style={styles.okText}>✅ اسم صحيح</Text>
          )}
        </View>

        <View style={styles.row2}>
          <View style={styles.col}>
            <Select
              label="الجنس" value={member.gender}
              onChange={v => onUpdate(member.id, 'gender', v)}
              placeholder="اختر"
              options={[{ value: 'ذكر', label: 'ذكر' }, { value: 'أنثى', label: 'أنثى' }]}
            />
          </View>
          <View style={styles.col}>
            <Select
              label="صلة القرابة" value={member.relation}
              onChange={v => onUpdate(member.id, 'relation', v)}
              placeholder="اختر"
              options={relations.map(r => ({ value: r, label: r }))}
            />
          </View>
        </View>

        {/* رقم الهوية */}
        <View>
          <Text style={styles.label}>رقم الهوية</Text>
          <TextInput
            value={member.national_id}
            onChangeText={v => onUpdate(member.id, 'national_id', v)}
            keyboardType="number-pad" placeholder="9 أرقام" maxLength={9}
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.mono]}
          />
          {member.national_id?.length >= 9 && (
            <Text style={luhnCheck(member.national_id) ? styles.okText : styles.errText}>
              {luhnCheck(member.national_id) ? '✅ هوية صحيحة' : '❌ هوية غير صحيحة'}
            </Text>
          )}
        </View>

        {/* تاريخ الميلاد */}
        <View>
          <Text style={styles.label}>تاريخ الميلاد</Text>
          <DateInput value={member.dob || ''} onChange={v => onUpdate(member.id, 'dob', v)} />
          {dobErr && <Text style={styles.errorText}>{dobErr}</Text>}
        </View>

        {/* الصف الدراسي الفعلي — لعمر الدراسة (4-17) فقط */}
        {isSchoolAge(age) && (() => {
          const expected = getExpectedGrade(age)
          const current = member.actual_grade || expected
          const expIdx = GRADE_OPTIONS.indexOf(expected)
          const availableGrades = expIdx === -1 ? GRADE_OPTIONS : GRADE_OPTIONS.slice(0, expIdx + 1)
          return (
            <View>
              <Select
                label={`الصف الدراسي الفعلي${!member.actual_grade ? ' (تلقائي حسب العمر)' : ''}`}
                value={current || ''}
                onChange={v => onUpdate(member.id, 'actual_grade', v)}
                options={availableGrades.map(g => ({ value: g, label: g }))}
              />
              {member.actual_grade && member.actual_grade !== expected && (
                <Text style={styles.warnText}>⚠️ يختلف عن المتوقع لعمره ({expected}) — سيُحسَب متأخراً دراسياً</Text>
              )}
            </View>
          )
        })()}

        {/* المؤهل العلمي — للبالغين (18+) فقط */}
        {age >= 18 && (
          <Select
            label="المؤهل العلمي"
            value={member.qualification || ''}
            onChange={v => onUpdate(member.id, 'qualification', v || null)}
            placeholder="غير مُسجَّل"
            options={QUALIFICATION_OPTIONS.map(q => ({ value: q, label: q }))}
          />
        )}

        {/* الحالة الصحية */}
        <Select
          label="الحالة الصحية"
          value={member.health || 'سليم'}
          onChange={v => onUpdate(member.id, 'health', v)}
          options={HEALTH_OPTIONS}
        />

        {/* الحالات الصحية التفصيلية */}
        <TouchableOpacity onPress={() => onOpenHealth(member.id)} style={styles.healthBtn}>
          <Text style={styles.healthBtnText}>🩺 الحالات الصحية التفصيلية</Text>
          {healthCount > 0 && (
            <View style={styles.healthBadge}>
              <Text style={styles.healthBadgeText}>{healthCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  removeBtn: { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  removeBtnText: { color: colors.red, fontSize: 11, fontWeight: '700' },
  form: { gap: 10 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  input: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 8, color: colors.white, fontSize: 13, textAlign: 'right',
  },
  inputError: { borderColor: colors.red },
  mono: { textAlign: 'left' },
  row2: { flexDirection: 'row', gap: 8 },
  col: { flex: 1 },
  errorText: { color: colors.red, fontSize: 10, marginTop: 3 },
  errText:   { color: colors.red, fontSize: 10, marginTop: 3 },
  warnText:  { color: colors.accent, fontSize: 10, marginTop: 3 },
  okText:    { color: colors.green, fontSize: 10, marginTop: 3 },
  healthBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
    backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: radius.md,
  },
  healthBtnText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  healthBadge: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  healthBadgeText: { color: colors.bg, fontSize: 10, fontWeight: '900' },
})
