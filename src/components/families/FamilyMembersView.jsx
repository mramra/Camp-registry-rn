/**
 * FamilyMembersView.jsx — عرض قائمة أفراد أسرة واحدة
 * مستخلص من FamiliesScreen لإعادة الاستخدام في شاشات أخرى
 * (مثل FamilyForm عند تعديل أسرة، أو أي شاشة تعرض تفاصيل أسرة).
 *
 * Props:
 *   members — قائمة أفراد الأسرة (بدون رب الأسرة)
 *   family  — بيانات رب الأسرة (للعرض في أول السطر)
 */
import { View, Text, StyleSheet } from 'react-native'
import { calcAge } from '../../lib/helpers'
import { getMemberIcon } from '../../lib/helpers'
import { formatDate } from '../../lib/utils'
import { colors, radius } from '../../theme'

const HEALTH_ICONS = { مريض: '🤒', معاق: '♿', مزمن: '💊', مصاب: '🩹' }
const REL_ORDER    = { 'زوجة': 0, 'زوج': 0 }

export default function FamilyMembersView({ members, family }) {
  const sorted = [...members].sort((a, b) => {
    const ra = REL_ORDER[a.relation?.trim()] ?? 1
    const rb = REL_ORDER[b.relation?.trim()] ?? 1
    if (ra !== rb) return ra - rb
    const da = a.dob ? new Date(a.dob).getTime() : Infinity
    const db = b.dob ? new Date(b.dob).getTime() : Infinity
    return da - db
  })

  if (!members.length) {
    return <Text style={styles.empty}>لا يوجد أفراد مسجلون</Text>
  }

  return (
    <View>
      <Text style={styles.title}>👨‍👩‍👧‍👦 أفراد الأسرة ({members.length + 1} فرد)</Text>

      <View style={styles.list}>
        {/* رب الأسرة دائماً أول */}
        <View style={styles.headRow}>
          <Text style={styles.memberIcon}>👑</Text>
          <View style={styles.memberInfo}>
            <Text style={styles.memberName}>{family.head_name}</Text>
            <Text style={styles.memberMeta}>
              رب الأسرة
              {family.head_id   ? ` · ${family.head_id}` : ''}
              {family.head_dob  ? ` · ${calcAge(family.head_dob)} سنة` : ''}
            </Text>
          </View>
          <Text style={styles.genderBadge}>
            {family.head_gender === 'ذكر' ? '👨' : family.head_gender === 'أنثى' ? '👩' : ''}
          </Text>
        </View>

        {/* باقي الأفراد */}
        {sorted.map(m => {
          const age  = calcAge(m.dob)
          const icon = getMemberIcon(m.relation, m.gender)
          return (
            <View key={m.id} style={styles.memberRow}>
              <Text style={styles.memberIcon}>{icon}</Text>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{m.name}</Text>
                <Text style={styles.memberMeta}>
                  {m.relation || '—'}
                  {m.national_id ? ` · ${m.national_id}` : ''}
                  {age !== null  ? ` · ${age} سنة` : m.dob ? ` · ${formatDate(m.dob)}` : ''}
                </Text>
              </View>
              {m.health && m.health !== 'سليم' && (
                <Text style={styles.health}>
                  {HEALTH_ICONS[m.health] || '⚠️'} {m.health}
                </Text>
              )}
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, fontSize: 12, textAlign: 'center', paddingVertical: 12 },
  title: { color: colors.accent, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  list:  { gap: 6 },
  headRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.accent + '1A',
    borderWidth: 1, borderColor: colors.accent + '33',
  },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  memberIcon: { fontSize: 20 },
  memberInfo: { flex: 1 },
  memberName: { color: colors.white, fontSize: 12, fontWeight: '700' },
  memberMeta: { color: colors.muted, fontSize: 10 },
  genderBadge: { color: colors.accent, fontSize: 11, fontWeight: '700' },
  health: { color: colors.red, fontSize: 10 },
})
