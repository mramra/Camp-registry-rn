/**
 * DateInput.jsx — مدخل تاريخ (يوم/شهر/سنة منفصلين)
 * منقول من camp-registry-react/src/pages/Families/FamilyForm.jsx (مكوّن محلي داخل الملف)
 *
 * نفس المنطق بالضبط: 3 قوائم منسدلة (Select)، قيد فعلي يمنع تاريخ ميلاد
 * مستقبلي (لو السنة الحالية مختارة تُحجب الأشهر القادمة، ولو الشهر
 * الحالي كذلك تُحجب الأيام القادمة)، وعرض العمر المحسوب تلقائياً أسفل الحقل.
 *
 * تكييف: useRef+tick (حيلة لتفادي مشاكل focus في حقل <input> ويب) غير
 * ضرورية في React Native (Picker لا يعاني من نفس المشكلة) — استُبدلت
 * بـ useState عادية أبسط، بنفس النتيجة المنطقية بالضبط.
 */
import { View, Text, StyleSheet } from 'react-native'
import Select from './Select'
import { calcAge } from '../../lib/helpers'
import { colors } from '../../theme'

const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

export default function DateInput({ value, onChange, maxYear, minYear }) {
  const parts = (value || '').split('-')
  const yr = parts[0] || ''
  const mo = parts[1] || ''
  const dy = parts[2] || ''

  const today = new Date()
  const curYear  = today.getFullYear()
  const curMonth = today.getMonth() + 1
  const curDay   = today.getDate()
  const maxYr = maxYear || curYear
  const minYr = minYear || 1900
  const daysInMonth = mo && yr ? new Date(parseInt(yr), parseInt(mo), 0).getDate() : 31
  const age = calcAge(value)

  // نفس قيد الأصل بالضبط: يمنع اختيار تاريخ ميلاد في المستقبل
  const isCurYearSelected  = parseInt(yr) === curYear
  const maxMonthAllowed    = isCurYearSelected ? curMonth : 12
  const isCurMonthSelected = isCurYearSelected && parseInt(mo) === curMonth
  const maxDayAllowed      = isCurMonthSelected ? curDay : daysInMonth

  function select(field, val) {
    const next = { yr, mo, dy, [field]: val }
    if (next.yr && next.mo && next.dy) {
      onChange(`${String(next.yr).padStart(4,'0').slice(-4)}-${String(next.mo).padStart(2,'0')}-${String(next.dy).padStart(2,'0')}`)
    } else {
      // لسه ناقص جزء — نحتفظ بالاختيار الجزئي عبر تخزينه كـ "قيمة مؤقتة"
      // في نفس صيغة value (بعض الأجزاء فاضية) ليعاد استخدامها عند اختيار الباقي
      onChange(`${next.yr}-${next.mo}-${next.dy}`)
    }
  }

  const dayOptions = Array.from(
    { length: Math.min(daysInMonth, maxDayAllowed) }, (_, i) => i + 1
  ).map(d => ({ value: String(d).padStart(2, '0'), label: String(d) }))

  const monthOptions = MONTHS.slice(0, maxMonthAllowed).map((m, i) => ({
    value: String(i + 1).padStart(2, '0'), label: m,
  }))

  const yearOptions = Array.from(
    { length: maxYr - minYr + 1 }, (_, i) => maxYr - i
  ).map(y => ({ value: String(y), label: String(y) }))

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.col}>
          <Select value={dy} onChange={v => select('dy', v)} placeholder="يوم" options={dayOptions} />
        </View>
        <View style={[styles.col, { flex: 2 }]}>
          <Select value={mo} onChange={v => select('mo', v)} placeholder="الشهر" options={monthOptions} />
        </View>
        <View style={[styles.col, { flex: 2 }]}>
          <Select value={yr} onChange={v => select('yr', v)} placeholder="السنة" options={yearOptions} />
        </View>
      </View>
      {age !== null && (
        <Text style={styles.ageText}>العمر: {age} سنة</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  col: { flex: 1 },
  ageText: { color: colors.accent, fontSize: 11, marginTop: 4, textAlign: 'right' },
})
