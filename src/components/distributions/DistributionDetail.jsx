/**
 * DistributionDetail.jsx — تفاصيل توزيع واحد (المرشَّحون + المستلمون)
 * مستخلص من camp-registry (المستودع القديم) — openDist/applyDistFilter/confirmDistribution
 *
 * تبسيط متعمد (موثَّق): الأصل به "استبعاد من استلم في أي توزيع آخر من
 * نفس النوع" (sameType check عبر استعلام شامل لكل camp_distributions من
 * نفس النوع) — منطق ثقيل ومكلف. هنا نكتفي باستبعاد من استلم في **هذا
 * التوزيع تحديداً** فقط، وهو الأهم عملياً (منع ازدواجية الاستلام لنفس
 * الدفعة). الاستبعاد الأشمل (نفس النوع عبر كل التوزيعات) يمكن إضافته
 * لاحقاً كميزة منفصلة إذا احتاجها محمود فعلياً.
 *
 * تكييف: window.prompt('ملاحظة...') → Alert.prompt (iOS فقط أصلاً في RN؛
 * Android لا يدعم prompt نصي بشكل أصلي) → استُبدل بحقل نصي في الشاشة نفسها.
 */
import { useState, useEffect, useMemo } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native'
import { supabase, ORG_ID, isOnlineNow } from '../../lib/db'
import { useApp } from '../../context/AppContext'
import Select from '../ui/Select'
import { colors, radius } from '../../theme'

const SORT_OPTIONS = [
  { value: 'priority',      label: '🔴 الأولوية أولاً' },
  { value: 'alpha',         label: '🔤 أبجدي' },
  { value: 'members_desc',  label: '👨‍👩‍👧 أكبر أسرة أولاً' },
  { value: 'members_asc',   label: '👤 أصغر أسرة أولاً' },
  { value: 'tent_asc',      label: '🏠 رقم خيمة تصاعدي' },
]

export default function DistributionDetail({ dist, onBack, canConfirm }) {
  const [tab,        setTab]        = useState('pending') // pending | received
  const [families,   setFamilies]   = useState([])
  const [members,    setMembers]    = useState([])
  const [receivedRecords, setReceivedRecords] = useState([])
  const [camps,      setCamps]      = useState({})
  const [loading,    setLoading]    = useState(true)
  const [sortMode,   setSortMode]   = useState('priority')
  const [selected,   setSelected]   = useState(new Set())
  const [note,       setNote]       = useState('')
  const [confirming, setConfirming] = useState(false)

  const { showToast } = useApp()

  useEffect(() => { load() }, [dist.id])

  async function load() {
    setLoading(true)
    try {
      const [{ data: fams }, { data: mems }, { data: recv }, { data: campsData }] = await Promise.all([
        supabase.from('families').select('id,head_name,head_id,camp_id,status,tent,phone1').eq('org_id', ORG_ID).limit(1000),
        supabase.from('family_members').select('id,family_id'),
        supabase.from('camp_dist_families').select('*').eq('distribution_id', dist.id),
        supabase.from('camps').select('id,name'),
      ])
      setFamilies(fams || [])
      setMembers(mems || [])
      setReceivedRecords(recv || [])
      setCamps(Object.fromEntries((campsData || []).map(c => [c.id, c.name])))
    } catch (e) {
      showToast('فشل تحميل البيانات: ' + e.message, true)
    } finally {
      setLoading(false)
    }
  }

  const receivedIds = useMemo(() => new Set(receivedRecords.map(r => r.family_id)), [receivedRecords])

  const memberCountMap = useMemo(() => {
    const map = {}
    members.forEach(m => { map[m.family_id] = (map[m.family_id] || 0) + 1 })
    return map
  }, [members])

  const candidates = useMemo(() => {
    let list = families.filter(f => !receivedIds.has(f.id))
    if (dist.camp_id) list = list.filter(f => f.camp_id === dist.camp_id)

    if (sortMode === 'priority') {
      const pri = { urgent: 0, need: 1, ok: 2 }
      list = [...list].sort((a, b) => (pri[a.status] ?? 2) - (pri[b.status] ?? 2))
    } else if (sortMode === 'alpha') {
      list = [...list].sort((a, b) => (a.head_name || '').localeCompare(b.head_name || '', 'ar'))
    } else if (sortMode === 'members_desc') {
      list = [...list].sort((a, b) => (memberCountMap[b.id] || 0) - (memberCountMap[a.id] || 0))
    } else if (sortMode === 'members_asc') {
      list = [...list].sort((a, b) => (memberCountMap[a.id] || 0) - (memberCountMap[b.id] || 0))
    } else if (sortMode === 'tent_asc') {
      list = [...list].sort((a, b) => {
        const ta = (a.tent || '').trim(), tb = (b.tent || '').trim()
        if (!ta && !tb) return 0
        if (!ta) return 1
        if (!tb) return -1
        const na = parseFloat(ta), nb = parseFloat(tb)
        return (!isNaN(na) && !isNaN(nb)) ? na - nb : ta.localeCompare(tb, 'ar', { numeric: true })
      })
    }
    return list
  }, [families, receivedIds, dist.camp_id, sortMode, memberCountMap])

  const receivedFamilies = useMemo(
    () => families.filter(f => receivedIds.has(f.id)),
    [families, receivedIds]
  )

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function selectAll()   { setSelected(new Set(candidates.map(f => f.id))) }
  function deselectAll() { setSelected(new Set()) }

  async function confirmReceipt() {
    if (!selected.size) { showToast('لم تختر أي أسرة', true); return }
    if (!isOnlineNow()) { showToast('لا يوجد اتصال', true); return }

    setConfirming(true)
    try {
      const records = [...selected].map(familyId => ({
        distribution_id: dist.id,
        family_id: familyId,
        round_id: dist.id, // مبسَّط: الجولة = التوزيع نفسه
        org_id: ORG_ID,
        received_at: new Date().toISOString(),
        notes: note.trim() || null,
      }))
      const { error } = await supabase.from('camp_dist_families').insert(records)
      if (error) throw error

      showToast(`✅ تم تسجيل استلام ${selected.size} أسرة`)
      setSelected(new Set())
      setNote('')
      await load()
    } catch (e) {
      showToast('خطأ: ' + e.message, true)
    } finally {
      setConfirming(false)
    }
  }

  function confirmUnmark(familyId, familyName) {
    Alert.alert(`إلغاء استلام "${familyName}"؟`, '', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', style: 'destructive', onPress: () => unmarkReceived(familyId) },
    ])
  }

  async function unmarkReceived(familyId) {
    try {
      await supabase.from('camp_dist_families').delete()
        .eq('distribution_id', dist.id).eq('family_id', familyId)
      showToast('✅ تم الإلغاء')
      await load()
    } catch (e) {
      showToast('خطأ: ' + e.message, true)
    }
  }

  const remaining = (dist.quantity || 0) - receivedIds.size

  return (
    <View style={styles.screen}>
      {/* رأس التوزيع */}
      <View style={styles.headerCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{dist.name}</Text>
            <Text style={styles.subtitle}>{dist.camp_id ? (camps[dist.camp_id] || '—') : 'كل المخيمات'}</Text>
          </View>
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.backText}>← رجوع</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.statsRow}>
          <Stat value={dist.quantity || 0} label="📦 الكمية" color={colors.accent} />
          <Stat value={receivedIds.size} label="✅ استلموا" color={colors.green} />
          <Stat value={remaining} label="📋 متبقي" color={remaining > 0 ? colors.blue : colors.green} />
        </View>
      </View>

      {/* التبويبات */}
      <View style={styles.tabs}>
        <TouchableOpacity onPress={() => setTab('pending')} style={[styles.tab, tab === 'pending' && styles.tabActive]}>
          <Text style={[styles.tabText, tab === 'pending' && styles.tabTextActive]}>⏳ لم يستلموا</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab('received')} style={[styles.tab, tab === 'received' && styles.tabActive]}>
          <Text style={[styles.tabText, tab === 'received' && styles.tabTextActive]}>✅ استلموا</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <Text style={styles.emptyText}>جارٍ التحميل...</Text>
      ) : tab === 'pending' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          <Select value={sortMode} onChange={setSortMode} options={SORT_OPTIONS} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryText}>📋 {candidates.length} أسرة لم تستلم</Text>
            {!!dist.quantity && (
              <Text style={[styles.summaryRemaining, { color: remaining >= 0 ? colors.blue : colors.red }]}>
                متبقي: {remaining} من {dist.quantity}
              </Text>
            )}
          </View>

          {canConfirm && candidates.length > 0 && (
            <View style={styles.selectRow}>
              <TouchableOpacity onPress={selectAll} style={styles.smallBtn}>
                <Text style={styles.smallBtnText}>☑️ الكل</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={deselectAll} style={styles.smallBtn}>
                <Text style={styles.smallBtnText}>⬜ إلغاء</Text>
              </TouchableOpacity>
              <Text style={styles.selCount}>{selected.size} ✓</Text>
            </View>
          )}

          {candidates.length === 0 ? (
            <Text style={styles.emptyText}>✅ كل الأسر استلمت</Text>
          ) : (
            candidates.map(f => {
              const checked = selected.has(f.id)
              return (
                <TouchableOpacity
                  key={f.id}
                  onPress={() => canConfirm && toggle(f.id)}
                  style={styles.row}
                  activeOpacity={canConfirm ? 0.6 : 1}
                >
                  {canConfirm && (
                    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                      {checked && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{f.head_name || '—'}</Text>
                    <Text style={styles.rowMeta}>
                      {camps[f.camp_id] || '—'}{f.tent ? ` · خيمة ${f.tent}` : ''} · 👥 {(memberCountMap[f.id] || 0) + 1} فرد
                    </Text>
                  </View>
                  <Text style={[styles.statusBadge, { color: f.status === 'urgent' ? colors.red : f.status === 'need' ? colors.accent : colors.muted }]}>
                    {f.status === 'urgent' ? '🚨' : f.status === 'need' ? '⚠️' : '✅'}
                  </Text>
                </TouchableOpacity>
              )
            })
          )}

          {canConfirm && candidates.length > 0 && (
            <View style={styles.confirmBox}>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="ملاحظة على هذا التوزيع (اختياري)"
                placeholderTextColor={colors.muted}
                style={styles.noteInput}
              />
              <TouchableOpacity
                onPress={confirmReceipt}
                disabled={confirming || !selected.size}
                style={[styles.confirmBtn, (confirming || !selected.size) && styles.disabled]}
              >
                <Text style={styles.confirmBtnText}>
                  {confirming ? 'جاري الحفظ...' : `✅ تأكيد الاستلام للمحددين (${selected.size})`}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {receivedFamilies.length === 0 ? (
            <Text style={styles.emptyText}>لا يوجد مستلمون بعد</Text>
          ) : (
            receivedFamilies.map(f => {
              const rec = receivedRecords.find(r => r.family_id === f.id)
              return (
                <View key={f.id} style={styles.receivedRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{f.head_name || '—'}</Text>
                    <Text style={styles.rowMeta}>
                      {camps[f.camp_id] || '—'}
                      {rec?.received_at ? ` · ${new Date(rec.received_at).toLocaleDateString('ar-EG')}` : ''}
                    </Text>
                    {!!rec?.notes && <Text style={styles.noteText}>📝 {rec.notes}</Text>}
                  </View>
                  {canConfirm && (
                    <TouchableOpacity onPress={() => confirmUnmark(f.id, f.head_name)}>
                      <Text style={styles.unmarkBtn}>↺ إلغاء</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            })
          )}
        </ScrollView>
      )}
    </View>
  )
}

function Stat({ value, label, color }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: 14, marginBottom: 12,
  },
  title: { color: colors.white, fontWeight: '700', fontSize: 14 },
  subtitle: { color: colors.muted, fontSize: 11, marginTop: 2 },
  backText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  statBox: { flex: 1, backgroundColor: colors.surface2, borderRadius: radius.sm, padding: 8, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 10, marginTop: 2 },
  tabs: {
    flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.md,
    padding: 4, marginBottom: 12, gap: 0,
  },
  tab: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center' },
  tabActive: { backgroundColor: colors.accent },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: colors.bg },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surface2, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8, marginVertical: 10,
  },
  summaryText: { color: colors.muted, fontSize: 12 },
  summaryRemaining: { fontSize: 12, fontWeight: '700' },
  selectRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10 },
  smallBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 6, alignItems: 'center' },
  smallBtnText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  selCount: { color: colors.accent, fontSize: 12, fontWeight: '700', minWidth: 50, textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 12, textAlign: 'center', paddingVertical: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: colors.bg, fontSize: 12, fontWeight: '900' },
  rowName: { color: colors.white, fontSize: 13, fontWeight: '700' },
  rowMeta: { color: colors.muted, fontSize: 10, marginTop: 2 },
  statusBadge: { fontSize: 13 },
  confirmBox: { marginTop: 14, gap: 8 },
  noteInput: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 10, color: colors.white, fontSize: 13, textAlign: 'right',
  },
  confirmBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
  confirmBtnText: { color: colors.bg, fontWeight: '900', fontSize: 14 },
  disabled: { opacity: 0.6 },
  receivedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  noteText: { color: colors.muted, fontSize: 10, marginTop: 4 },
  unmarkBtn: { color: colors.red, fontSize: 11, fontWeight: '700' },
})
