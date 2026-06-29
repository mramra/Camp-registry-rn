/**
 * DuplicateWarnings.jsx — تحذيرات التكرار والنواقص لأسرة معيّنة
 * مستخلص من FamiliesScreen لإعادة الاستخدام في FamilyForm وأي شاشة
 * تعرض تفاصيل أسرة أو تطلب التحقق من بياناتها.
 *
 * Props:
 *   family     — بيانات الأسرة المفحوصة
 *   families   — كل الأسر (للمقارنة بها عند كشف التكرارات)
 *   allMembers — كل الأفراد (للمقارنة بها)
 */
import { View, Text, StyleSheet } from 'react-native'
import { checkFamilyIssues } from '../../lib/helpers'
import { colors, radius } from '../../theme'

export default function DuplicateWarnings({ family, families, allMembers }) {
  const issues = buildIssues(family, families, allMembers)
  if (!issues.length) return null

  return (
    <View style={styles.wrap}>
      {issues.map((issue, i) => (
        <View key={i} style={[
          styles.box,
          { backgroundColor: issue.color + '1A', borderColor: issue.color + '4D' },
        ]}>
          <Text style={[styles.title, { color: issue.color }]}>
            {issue.icon} {issue.title}
          </Text>
          {(Array.isArray(issue.detail) ? issue.detail : [issue.detail]).map((line, j) => (
            <Text key={j} style={[styles.line, { color: issue.color }]}>← {line}</Text>
          ))}
        </View>
      ))}
    </View>
  )
}

/** منطق بناء قائمة المشاكل — دالة صرفة منفصلة عن الـ UI */
function buildIssues(family, families, allMembers) {
  const issues  = []
  const famMap  = Object.fromEntries(families.map(f => [f.id, f]))

  // ── 1. النواقص ──
  const famMems   = allMembers.filter(m => m.family_id === family.id)
  const allIssues = checkFamilyIssues(family, famMems)
  if (allIssues.length) {
    issues.push({
      color: colors.red, icon: '⚠️',
      title: `${allIssues.length} نقص في بيانات الأسرة`,
      detail: allIssues,
    })
  }

  // ── 2. تكرار هوية رب الأسرة ──
  if (family.head_id) {
    const names = []
    families.forEach(f => {
      if (f.id !== family.id && f.head_id === family.head_id)
        names.push(`رب الأسرة ${f.head_name}`)
    })
    allMembers.forEach(m => {
      if (m.family_id === family.id) return
      if (m.national_id === family.head_id) {
        const parent = famMap[m.family_id]
        names.push(`الفرد ${m.name} من أسرة ${parent ? parent.head_name : '؟'}`)
      }
    })
    if (names.length) {
      issues.push({ color: colors.purple, icon: '🔁', title: 'هوية رب الأسرة مكررة مع', detail: names })
    }
  }

  // ── 3. تكرار هويات الأفراد ──
  const myMembers = allMembers.filter(m => m.family_id === family.id && m.national_id)
  myMembers.forEach(m => {
    const names = []
    families.forEach(f => {
      if (f.id !== family.id && f.head_id === m.national_id)
        names.push(`رب الأسرة ${f.head_name}`)
    })
    allMembers.forEach(x => {
      if (x.family_id === family.id) return
      if (x.national_id === m.national_id) {
        const parent = famMap[x.family_id]
        names.push(`الفرد ${x.name} من أسرة ${parent ? parent.head_name : '؟'}`)
      }
    })
    if (names.length) {
      issues.push({ color: colors.purple, icon: '🔁', title: `هوية الفرد "${m.name}" مكررة مع`, detail: names })
    }
  })

  // ── 4. تكرار الجوال ──
  if (family.phone1) {
    const clean    = p => (p || '').replace(/[\s-]/g, '')
    const myPhone  = clean(family.phone1)
    const dupFams  = families.filter(f => f.id !== family.id && clean(f.phone1) === myPhone)
    if (dupFams.length) {
      issues.push({
        color: colors.blue, icon: '📞',
        title: `الجوال ${family.phone1} مكرر مع`,
        detail: dupFams.map(f => `رب الأسرة ${f.head_name}`),
      })
    }
  }

  return issues
}

const styles = StyleSheet.create({
  wrap:  { gap: 8 },
  box:   { borderWidth: 1, borderRadius: radius.md, padding: 10 },
  title: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  line:  { fontSize: 11, opacity: 0.9, paddingVertical: 1 },
})
