/**
 * DistributionsScreen.jsx — إدارة التوزيعات
 * منقول (مع تبسيط معماري موثَّق) من camp-registry (المستودع القديم) —
 * loadDistPage/saveNewRound/deleteDist
 *
 * تبسيط متعمد جوهري: الأصل مبني بالكامل على Dexie/IndexedDB (Offline-first
 * حقيقي) + بنية هرمية (جولة تحتوي عدة دفعات). هنا: اتصال مباشر بـ Supabase
 * (بدون تخزين محلي، اتساقاً مع باقي شاشات camp-registry-rn) + بنية مبسَّطة
 * بطبقة واحدة (كل توزيع = سجل واحد بكمية، لا جولات متعددة الدفعات).
 * القرار موثَّق في الذاكرة طويلة المدى لمحمود.
 */
import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { useApp }  from '../context/AppContext'
import { useDataScope } from '../lib/useDataScope'
import { ORG_ID, supabase, isOnlineNow } from '../lib/db'
import { generateId } from '../lib/utils'
import PageHeader from '../components/ui/PageHeader'
import EmptyState from '../components/ui/EmptyState'
import Select     from '../components/ui/Select'
import SafeScreen   from '../components/ui/SafeScreen'
import DistributionCard from '../components/distributions/DistributionCard'
import DistributionForm from '../components/distributions/DistributionForm'
import DistributionDetail from '../components/distributions/DistributionDetail'
import { colors, radius } from '../theme'

const EMPTY_FORM = {
  name: '', type: 'general', camp_id: '',
  date: new Date().toISOString().split('T')[0],
}

// نفس الحالات الأربع من camp-registry-react الأصلي (الجولات، لا الدفعات)
const STATUS_MAP = {
  draft:     { label: 'مسودة' },
  active:    { label: 'نشط' },
  completed: { label: 'مكتمل' },
  cancelled: { label: 'ملغي' },
}

export default function DistributionsScreen() {
  const [dists,        setDists]        = useState([])
  const [camps,        setCamps]        = useState([])
  const [receivedCounts, setReceivedCounts] = useState({})
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [editDist,     setEditDist]     = useState(null)
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [saving,       setSaving]       = useState(false)
  const [openDist,     setOpenDist]     = useState(null) // التوزيع المفتوح حالياً للتفاصيل
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCamp,   setFilterCamp]   = useState('')

  const { canWrite, isOwner } = useAuth()
  const { getVisibleCamps } = useDataScope()
  const { showToast } = useApp()

  useEffect(() => { load() }, [filterStatus, filterCamp])

  async function load() {
    setLoading(true)
    try {
      let q = supabase.from('dist_rounds').select('*').eq('org_id', ORG_ID)
      if (filterStatus) q = q.eq('status', filterStatus)
      if (filterCamp)   q = q.eq('camp_id', filterCamp)

      const [{ data: distsData }, { data: campsData }] = await Promise.all([
        q.order('created_at', { ascending: false }),
        supabase.from('camps').select('*').eq('org_id', ORG_ID),
      ])
      const visibleCamps = getVisibleCamps(campsData || [])
      setCamps(visibleCamps)
      const visibleCampIds = new Set(visibleCamps.map(c => c.id))
      const visibleDists = isOwner
        ? (distsData || [])
        : (distsData || []).filter(d => !d.camp_id || visibleCampIds.has(d.camp_id))
      setDists(visibleDists)

      if (visibleDists.length) {
        const { data: recvData } = await supabase.from('camp_dist_families')
          .select('distribution_id').in('distribution_id', visibleDists.map(d => d.id))
        const counts = {}
        ;(recvData || []).forEach(r => { counts[r.distribution_id] = (counts[r.distribution_id] || 0) + 1 })
        setReceivedCounts(counts)
      }
    } catch (e) {
      showToast('فشل تحميل التوزيعات: ' + e.message, true)
    } finally {
      setLoading(false)
    }
  }

  async function manualRefresh() {
    if (!isOnlineNow()) { showToast('لا يوجد اتصال', true); return }
    await load()
    showToast('✅ تم التحديث')
  }

  function openAdd() {
    setEditDist(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(dist) {
    setEditDist(dist)
    setForm({
      name: dist.name || '', type: dist.type || 'general',
      camp_id: dist.camp_id || '',
      date: dist.created_at ? dist.created_at.split('T')[0] : EMPTY_FORM.date,
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!canWrite) { showToast('⛔ لا تملك صلاحية إدارة التوزيعات', true); return }
    if (!form.name.trim()) { showToast('اسم التوزيع مطلوب', true); return }

    setSaving(true)
    try {
      const data = {
        id: editDist?.id || generateId(),
        org_id: ORG_ID,
        name: form.name.trim(),
        type: form.type,
        camp_id: form.camp_id || null,
        status: editDist?.status || 'draft',
        created_at: form.date ? new Date(form.date).toISOString() : new Date().toISOString(),
      }

      if (editDist) {
        await supabase.from('dist_rounds').update(data).eq('id', editDist.id)
      } else {
        await supabase.from('dist_rounds').insert(data)
      }

      showToast(editDist ? '✅ تم التعديل' : '✅ تم إنشاء التوزيع')
      setShowForm(false)
      await load()
    } catch (err) {
      showToast('خطأ: ' + err.message, true)
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete(dist) {
    Alert.alert(
      `حذف "${dist.name}"؟`,
      'سيُحذف سجل الاستلام المرتبط أيضاً. لا يمكن التراجع.',
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'حذف', style: 'destructive', onPress: () => deleteDist(dist) },
      ]
    )
  }

  async function deleteDist(dist) {
    if (!isOnlineNow()) { showToast('⚠️ لا يوجد اتصال', true); return }
    try {
      await supabase.from('camp_dist_families').delete().eq('distribution_id', dist.id)
      await supabase.from('dist_rounds').delete().eq('id', dist.id)
      showToast('✅ تم الحذف')
      await load()
    } catch (err) {
      showToast('خطأ: ' + err.message, true)
    }
  }

  const campMap = Object.fromEntries(camps.map(c => [c.id, c.name]))

  // عرض شاشة تفاصيل توزيع مفتوح
  if (openDist) {
    return (
      <SafeScreen>
        <View style={styles.screen}>
          <View style={styles.content}>
            <DistributionDetail
              dist={openDist}
              allDists={dists}
              onBack={() => { setOpenDist(null); load() }}
              canConfirm={canWrite}
            />
          </View>
        </View>
      </SafeScreen>
    )
  }

  return (
    <SafeScreen>
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          icon="📦"
          title="التوزيعات"
          subtitle={`${dists.length} توزيع`}
          action={
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={manualRefresh} style={styles.iconBtn}>
                <Text>🔄</Text>
              </TouchableOpacity>
              {canWrite && (
                <TouchableOpacity onPress={openAdd} style={styles.addBtn}>
                  <Text style={styles.addBtnText}>➕ جديد</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />

        {/* الفلاتر */}
        <View style={styles.filterRow}>
          <View style={styles.filterCol}>
            <Select
              value={filterStatus}
              onChange={setFilterStatus}
              placeholder="كل الحالات"
              options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))}
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
        ) : dists.length === 0 ? (
          <EmptyState icon="📦" title="لا توجد توزيعات بعد" subtitle="اضغط ➕ جديد لإنشاء أول توزيع" />
        ) : (
          <View style={styles.list}>
            {dists.map(d => (
              <DistributionCard
                key={d.id}
                dist={d}
                campMap={campMap}
                receivedCount={receivedCounts[d.id]}
                onOpen={() => setOpenDist(d)}
                onEdit={openEdit}
                onDelete={confirmDelete}
                canWrite={canWrite}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <DistributionForm
        visible={showForm}
        onClose={() => setShowForm(false)}
        form={form}
        setForm={setForm}
        editDist={editDist}
        camps={camps}
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
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterCol: { flex: 1 },
  loadingWrap: { paddingVertical: 60, alignItems: 'center' },
  list: { gap: 8 },
})
