/**
 * MovementsScreen.jsx — حركات الأسر (دخول/خروج/نقل بين المخيمات)
 * منقول من camp-registry-react/src/pages/Movements/Movements.jsx
 *
 * تبسيط متعمد (موثَّق): تجاهل 'delta-sync' (كود ميت). تحميل مباشر + تحديث يدوي.
 * تكييف: navigator.onLine → isOnlineNow()، crypto.randomUUID() → generateId()
 */
import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { useApp }  from '../context/AppContext'
import { useDataScope } from '../lib/useDataScope'
import {
  ORG_ID, supabase, visibleFamilies,
  isExemptFromApproval, recordApprovalRequest, isOnlineNow,
} from '../lib/db'
import { generateId } from '../lib/utils'
import PageHeader from '../components/ui/PageHeader'
import EmptyState from '../components/ui/EmptyState'
import Select     from '../components/ui/Select'
import SafeScreen   from '../components/ui/SafeScreen'
import MovementCard, { TYPE_MAP } from '../components/movements/MovementCard'
import MovementForm from '../components/movements/MovementForm'
import { colors, radius } from '../theme'

const EMPTY_FORM = {
  family_id: '', type: 'entry', from_camp: '', to_camp: '',
  date: new Date().toISOString().split('T')[0], reason: '', notes: '',
}

export default function MovementsScreen() {
  const [movements,  setMovements]  = useState([])
  const [camps,      setCamps]      = useState([])
  const [families,   setFamilies]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [syncing,    setSyncing]    = useState(false)
  const [filterType, setFilterType] = useState('')
  const [filterCamp, setFilterCamp] = useState('')
  const [showForm,   setShowForm]   = useState(false)
  const [search,     setSearch]     = useState('')
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [saving,     setSaving]     = useState(false)

  const { canWrite, isOwner, profile } = useAuth()
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope()
  const { showToast } = useApp()

  useEffect(() => { loadData() }, [filterType, filterCamp])

  async function loadData() {
    setLoading(true)
    try {
      const { data: campsData } = await supabase.from('camps').select('*').eq('org_id', ORG_ID)
      const visibleCamps = getVisibleCamps(campsData || [])
      setCamps(visibleCamps)

      const campIds = getAllowedCampIds(campsData || [])
      let q = supabase.from('family_movements')
        .select('*, families(head_name,head_id)')
        .eq('org_id', ORG_ID)
        .order('date', { ascending: false }).limit(200)

      if (filterType) q = q.eq('type', filterType)
      if (filterCamp) {
        q = q.or(`from_camp.eq.${filterCamp},to_camp.eq.${filterCamp}`)
      } else if (campIds !== null && campIds.length > 0) {
        q = q.or(campIds.map(id => `from_camp.eq.${id}`).concat(campIds.map(id => `to_camp.eq.${id}`)).join(','))
      }

      const { data } = await q
      setMovements((data || []).slice(0, 100))
    } catch (e) {
      showToast('فشل تحميل الحركات: ' + e.message, true)
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }

  async function manualRefresh() {
    if (!isOnlineNow()) { showToast('لا يوجد اتصال', true); return }
    setSyncing(true)
    await loadData()
    showToast('✅ تم التحديث')
  }

  async function loadFamilies() {
    const { data } = await supabase.from('families').select('*').eq('org_id', ORG_ID).limit(1000)
    const fams = visibleFamilies(data || [], isOwner)
    const campIds = getAllowedCampIds(camps)
    setFamilies(filterLocal(fams, campIds))
  }

  function openForm() {
    loadFamilies()
    setForm(EMPTY_FORM)
    setSearch('')
    setShowForm(true)
  }

  async function handleSave() {
    if (!canWrite) { showToast('⛔ لا تملك صلاحية تسجيل حركات الأسر', true); return }
    if (!form.family_id) { showToast('اختر أسرة', true); return }
    if (!form.date)       { showToast('التاريخ مطلوب', true); return }

    setSaving(true)
    try {
      const actorId   = profile?.user_id || profile?.id || null
      const actorName = profile?.full_name || '—'
      const exempt = isExemptFromApproval(profile)
      const data = {
        id: generateId(), org_id: ORG_ID,
        family_id: form.family_id, type: form.type,
        from_camp: form.from_camp || null, to_camp: form.to_camp || null,
        date: form.date, reason: form.reason || null, notes: form.notes || null,
        created_by: actorId, created_at: new Date().toISOString(),
      }

      if (exempt) {
        await supabase.from('family_movements').insert(data)
        showToast('✅ تم تسجيل الحركة')
      } else {
        await recordApprovalRequest({
          familyId: form.family_id, action: 'movement_' + form.type,
          oldData: null, newData: data, changes: null,
          actorId, actorName, actorRole: profile?.role || null,
        })
        showToast('✅ تم إرسال طلب تسجيل الحركة — بانتظار موافقة ملك المنصة')
      }
      setShowForm(false)
      await loadData()
    } catch (err) {
      showToast('خطأ: ' + err.message, true)
    } finally {
      setSaving(false)
    }
  }

  const campMap = Object.fromEntries(camps.map(c => [c.id, c.name]))

  const stats = { entry: 0, exit: 0, transfer: 0 }
  movements.forEach(m => { if (stats[m.type] !== undefined) stats[m.type]++ })

  const filteredFamilies = families.filter(f =>
    !search ||
    (f.head_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (f.head_id || '').includes(search)
  )

  return (
    <SafeScreen>
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          menu
          icon="🚶"
          title="حركات الأسر"
          subtitle={`${movements.length} حركة`}
          action={
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={manualRefresh} disabled={syncing} style={styles.iconBtn}>
                <Text>{syncing ? '⏳' : '🔄'}</Text>
              </TouchableOpacity>
              {canWrite && (
                <TouchableOpacity onPress={openForm} style={styles.addBtn}>
                  <Text style={styles.addBtnText}>➕ تسجيل</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />

        {/* إحصائيات */}
        <View style={styles.statsRow}>
          {Object.entries(TYPE_MAP).map(([k, v]) => (
            <View key={k} style={styles.statCard}>
              <Text style={[styles.statNumber, { color: v.color }]}>{stats[k] || 0}</Text>
              <Text style={styles.statLabel}>{v.label}</Text>
            </View>
          ))}
        </View>

        {/* الفلاتر */}
        <View style={styles.filterRow}>
          <View style={styles.filterCol}>
            <Select
              value={filterType}
              onChange={setFilterType}
              placeholder="كل الأنواع"
              options={Object.entries(TYPE_MAP).map(([k, v]) => ({ value: k, label: v.label }))}
            />
          </View>
          <View style={styles.filterCol}>
            <Select
              value={filterCamp}
              onChange={setFilterCamp}
              placeholder="كل المخيمات"
              options={camps.map(c => ({ value: c.id, label: c.name }))}
            />
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        ) : movements.length === 0 ? (
          <EmptyState icon="🚶" title="لا توجد حركات" />
        ) : (
          <View style={styles.list}>
            {movements.map(m => (
              <MovementCard key={m.id} movement={m} campMap={campMap} />
            ))}
          </View>
        )}
      </ScrollView>

      <MovementForm
        visible={showForm}
        onClose={() => setShowForm(false)}
        form={form}
        setForm={setForm}
        camps={camps}
        filteredFamilies={filteredFamilies}
        search={search}
        setSearch={setSearch}
        onSave={handleSave}
        saving={saving}
      />
    </View>
    </SafeScreen>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  addBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: colors.bg, fontWeight: '900', fontSize: 13 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: 12, alignItems: 'center',
  },
  statNumber: { fontSize: 20, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 10, marginTop: 2 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterCol: { flex: 1 },
  loadingWrap: { paddingVertical: 60, alignItems: 'center' },
  list: { gap: 8 },
})
