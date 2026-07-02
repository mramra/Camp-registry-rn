/**
 * SMSScreen.jsx — إرسال رسائل SMS جماعية
 * منقول من camp-registry-react/src/pages/SMS/SMS.jsx
 *
 * المبدأ كما في الأصل: لا SMS Gateway، لا API خارجي. التطبيق يجهّز
 * الأرقام والنص ثم يفتح تطبيق الرسائل الافتراضي على الجهاز عبر
 * Linking.openURL('sms:...') — المستخدم يضغط إرسال يدوياً من هناك.
 * (تقنياً، إرسال SMS تلقائي بالكامل بدون تطبيق الرسائل ممكن فقط عبر
 * bare workflow + مكتبة native خاصة بأندرويد فقط — قرار معماري مؤجَّل،
 * موثَّق في الذاكرة. هذا هو "الحل الآمن" المتفَق عليه للمرحلة الحالية.)
 *
 * تكييفات:
 *   - window.location.href='sms:...' → Linking.openURL('sms:...')
 *   - navigator.clipboard → expo-clipboard (إن توفرت) أو نسخ يدوي بديل
 *   - <input type="checkbox"> → TouchableOpacity بأيقونة ✓/خانة فارغة
 */
import { useState, useEffect, useMemo } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Linking, Platform,
} from 'react-native'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { ORG_ID, supabase, visibleFamilies } from '../lib/db'
import { useDataScope } from '../lib/useDataScope'
import { checkFamilyIssues, isIncomplete } from '../lib/helpers'
import PageHeader from '../components/ui/PageHeader'
import Card       from '../components/ui/Card'
import Select     from '../components/ui/Select'
import SafeScreen   from '../components/ui/SafeScreen'
import { colors, radius } from '../theme'

/** توقيع الرسالة حسب مخيم الأسرة */
function getSig(campId, campMap) {
  const name = campMap[campId]
  return name ? `إدارة مخيم ${name}` : 'إدارة المخيم'
}

/** اسم مختصر للرسالة (٣ كلمات كحد أقصى) */
function shortName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 3) return parts.join(' ')
  return [parts[0], parts[1], parts[parts.length - 1]].join(' ')
}

export default function SMSScreen() {
  const [families,   setFamilies]   = useState([])
  const [members,    setMembers]    = useState([])
  const [camps,      setCamps]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [filterCamp, setFilterCamp] = useState('')
  const [search,     setSearch]     = useState('')
  const [selected,   setSelected]   = useState(new Set())
  const [message,    setMessage]    = useState('')

  const { showToast } = useApp()
  const { isOwner } = useAuth()
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [{ data: fams }, { data: campsData }, { data: mems }] = await Promise.all([
        supabase.from('families').select('*').eq('org_id', ORG_ID).limit(1000),
        supabase.from('camps').select('*').eq('org_id', ORG_ID),
        supabase.from('family_members').select('*'),
      ])
      const vis = visibleFamilies(fams || [], isOwner)
      const campIds = getAllowedCampIds(campsData || [])
      const scoped = filterLocal(vis, campIds)
      setFamilies(scoped)
      setCamps(getVisibleCamps(campsData || []))
      setMembers(mems || [])
      // تحديد افتراضي: كل من معه رقم جوال
      setSelected(new Set(scoped.filter(f => f.phone1).map(f => f.id)))
    } catch (e) {
      showToast('فشل تحميل الأسر: ' + e.message, true)
    } finally {
      setLoading(false)
    }
  }

  const campMap = useMemo(() => {
    return Object.fromEntries(camps.map(c => [c.id, c.name]))
  }, [camps])

  const memsByFam = useMemo(() => {
    const map = {}
    members.forEach(m => {
      if (!map[m.family_id]) map[m.family_id] = []
      map[m.family_id].push(m)
    })
    return map
  }, [members])

  const filtered = useMemo(() => {
    let list = families
    if (filterCamp) list = list.filter(f => f.camp_id === filterCamp)
    const q = search.trim().toLowerCase()
    if (q) list = list.filter(f =>
      (f.head_name || '').toLowerCase().includes(q) || (f.phone1 || '').includes(q)
    )
    return [...list].sort((a, b) => (a.head_name || '').localeCompare(b.head_name || '', 'ar'))
  }, [families, filterCamp, search])

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll()   { setSelected(new Set(filtered.filter(f => f.phone1).map(f => f.id))) }
  function deselectAll() { setSelected(new Set()) }
  function selectIncomplete() {
    setSelected(new Set(filtered.filter(f => f.phone1 && isIncomplete(f, memsByFam[f.id])).map(f => f.id)))
  }

  const selectedFamilies = useMemo(
    () => families.filter(f => selected.has(f.id) && f.phone1),
    [families, selected]
  )

  async function sendSMS() {
    const sel  = selectedFamilies
    const text = message.trim()
    if (!sel.length) { showToast('⚠️ لم تختر أي مستلم', true); return }
    if (!text)       { showToast('⚠️ يرجى كتابة نص الرسالة', true); return }

    // Android يدعم فاصل أرقام متعددة (;)، iOS لا يدعم هذا فعلياً عبر sms: scheme
    const sep = Platform.OS === 'android' ? ';' : ','

    if (sel.length === 1) {
      const f   = sel[0]
      const msg = text.replace(/\{اسم\}/g, shortName(f.head_name)) + '\n' + getSig(f.camp_id, campMap)
      await Linking.openURL(`sms:${f.phone1}?body=${encodeURIComponent(msg)}`)
      showToast('📨 جارٍ فتح تطبيق الرسائل...')
      return
    }

    const sig  = getSig(sel[0].camp_id, campMap)
    const tmpl = text.replace(/\{اسم\}/g, 'المستفيد') + '\n' + sig
    const nums = sel.map(f => f.phone1).filter(Boolean).join(sep)
    if (!nums) { showToast('⚠️ لا توجد أرقام صحيحة', true); return }
    await Linking.openURL(`sms:${nums}?body=${encodeURIComponent(tmpl)}`)
    showToast(`📨 إرسال لـ ${sel.length} مستلم...`)
  }

  return (
    <SafeScreen>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <PageHeader menu icon="💬" title="إرسال رسائل SMS" subtitle={`${selected.size} محدَّد`} />

      {/* الفلاتر والبحث */}
      <Card title="المستلمون" icon="🎯">
        <View style={{ gap: 8, marginBottom: 12 }}>
          <Select
            value={filterCamp}
            onChange={setFilterCamp}
            placeholder="⛺ كل المخيمات"
            options={camps.map(c => ({ value: c.id, label: c.name }))}
          />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="بحث بالاسم أو الجوال..."
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity onPress={selectAll} style={styles.smallBtn}>
            <Text style={styles.smallBtnText}>تحديد الكل</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={deselectAll} style={styles.smallBtn}>
            <Text style={styles.smallBtnText}>إلغاء الكل</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={selectIncomplete} style={styles.smallBtnDanger}>
            <Text style={styles.smallBtnDangerText}>⚠️ الناقصين</Text>
          </TouchableOpacity>
        </View>

        {/* قائمة الأسماء */}
        <View style={styles.list}>
          {loading ? (
            <Text style={styles.emptyText}>جارٍ التحميل...</Text>
          ) : filtered.length === 0 ? (
            <Text style={styles.emptyText}>لا توجد أسر</Text>
          ) : (
            <ScrollView style={styles.listScroll} nestedScrollEnabled>
              {filtered.map(f => {
                const hasPhone = !!f.phone1
                const issues   = checkFamilyIssues(f, memsByFam[f.id])
                const checked  = selected.has(f.id)
                return (
                  <TouchableOpacity
                    key={f.id}
                    onPress={() => hasPhone && toggle(f.id)}
                    disabled={!hasPhone}
                    style={[styles.row, !hasPhone && styles.rowDisabled]}
                  >
                    <View style={styles.rowLeft}>
                      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                        {checked && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowName}>{f.head_name}</Text>
                        <Text style={styles.rowMeta}>
                          — {campMap[f.camp_id] || '—'}
                          {issues.length > 0 && `  ⚠️ ${issues.length} ناقص`}
                          {!hasPhone && '  📵 لا جوال'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.rowPhone}>{f.phone1 || '—'}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          )}
        </View>
      </Card>

      {/* نص الرسالة */}
      <Card title="نص الرسالة" icon="✍️">
        <Text style={styles.hint}>
          💡 {'{اسم}'} يُستبدل باسم رب الأسرة تلقائياً
        </Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="مثال: السيد/ة {اسم}، يرجى مراجعتنا لاستكمال بياناتكم."
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={4}
          style={styles.textarea}
        />
        <View style={styles.charRow}>
          <Text style={styles.charText}>{message.length} حرف</Text>
          <Text style={styles.charText}>{Math.ceil(message.length / 160) || 0} رسالة</Text>
        </View>
        <TouchableOpacity
          onPress={sendSMS}
          disabled={!selected.size}
          style={[styles.sendBtn, !selected.size && styles.disabled]}
        >
          <Text style={styles.sendBtnText}>📨 إرسال لـ {selectedFamilies.length} مستلم</Text>
        </TouchableOpacity>
        <Text style={styles.footnote}>
          📱 يفتح تطبيق الرسائل بالأرقام المحددة — اضغط إرسال وسيُرسل للكل.
        </Text>
      </Card>
    </ScrollView>
    </SafeScreen>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  searchInput: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 10, color: colors.white, fontSize: 13, textAlign: 'right',
  },
  actionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  smallBtn: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6,
  },
  smallBtnText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  smallBtnDanger: {
    backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: colors.red,
    borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6,
  },
  smallBtnDangerText: { color: colors.red, fontSize: 11, fontWeight: '700' },
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden' },
  listScroll: { maxHeight: 288 },
  emptyText: { color: colors.muted, fontSize: 12, textAlign: 'center', paddingVertical: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowDisabled: { opacity: 0.5 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  checkbox: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: colors.bg, fontSize: 12, fontWeight: '900' },
  rowName: { color: colors.white, fontSize: 13, fontWeight: '700' },
  rowMeta: { color: colors.muted, fontSize: 10, marginTop: 2 },
  rowPhone: { color: colors.accent, fontSize: 11 },
  hint: { color: colors.muted, fontSize: 11, marginBottom: 8 },
  textarea: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 10, color: colors.white, fontSize: 13,
    textAlign: 'right', textAlignVertical: 'top', minHeight: 90, marginBottom: 8,
  },
  charRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  charText: { color: colors.muted, fontSize: 11 },
  sendBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
  sendBtnText: { color: colors.bg, fontWeight: '900', fontSize: 14 },
  disabled: { opacity: 0.6 },
  footnote: { color: colors.muted, fontSize: 10, marginTop: 8, lineHeight: 15 },
})
