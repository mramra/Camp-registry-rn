/**
 * CampsScreen.jsx — إدارة المخيمات (هرمية: رئيسي + فروع)
 * منقول من camp-registry-react/src/pages/Camps/CampsList.jsx
 *
 * تبسيط متعمد (موثَّق، ليس حذف وظيفة): تجاهل 'delta-sync' (كود ميت —
 * انظر التوثيق في الذاكرة وFamiliesScreen). تحميل مباشر + زر تحديث يدوي.
 *
 * تكييفات أخرى:
 *   - navigator.onLine → isOnlineNow()
 *   - window.confirm   → Alert.alert
 *   - crypto.randomUUID() → generateId() من utils.js
 */
import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useAuth } from '../context/AuthContext'
import { useApp }  from '../context/AppContext'
import { useDataScope } from '../lib/useDataScope'
import {
  ORG_ID, supabase, useLocalDB, visibleFamilies,
  isExemptFromApproval, recordApprovalRequest, isOnlineNow,
} from '../lib/db'
import { generateId } from '../lib/utils'
import PageHeader   from '../components/ui/PageHeader'
import EmptyState   from '../components/ui/EmptyState'
import SafeScreen    from '../components/ui/SafeScreen'
import CampCard     from '../components/camps/CampCard'
import CampForm     from '../components/camps/CampForm'
import { colors, radius } from '../theme'

const EMPTY_FORM = {
  name: '', camp_type: 'main', parent_camp_id: '', address: '',
  capacity: '', status: 'active', coordinates: '', manager_id: '',
}

export default function CampsScreen() {
  const [camps,          setCamps]          = useState([])
  const [pendingByCamp,  setPendingByCamp]  = useState({})
  const [pendingInserts, setPendingInserts] = useState(0)
  const [famCount,       setFamCount]       = useState({})
  const [memberMap,      setMemberMap]      = useState({})
  const [managerMap,     setManagerMap]     = useState({})
  const [orgMembers,     setOrgMembers]     = useState([])
  const [loading,        setLoading]        = useState(true)
  const [syncing,        setSyncing]        = useState(false)
  const [showForm,       setShowForm]       = useState(false)
  const [search,         setSearch]         = useState('')
  const [collapsed,      setCollapsed]      = useState(new Set())
  const [editCamp,       setEditCamp]       = useState(null)
  const [form,           setForm]           = useState(EMPTY_FORM)
  const [saving,         setSaving]         = useState(false)

  const { isOwner, isSuperAdmin, isCampDelegate, profile } = useAuth()
  const { showToast } = useApp()
  const { getVisibleCamps } = useDataScope()
  const { query, upsert, remove } = useLocalDB()
  const navigation = useNavigation()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [lCamps, lFamsRaw, lMems, lPending] = await Promise.all([
        query('camps'),
        query('families'),
        query('org_members'),
        supabase.from('family_history').select('action,old_data')
          .is('family_id', null).like('action', 'camp_%').eq('status', 'pending'),
      ])
      const lFams = visibleFamilies(lFamsRaw, isOwner)
      applyData(lCamps, lFams, lMems)

      const pm = {}
      ;(lPending?.data || []).forEach(r => { if (r.old_data?.id) pm[r.old_data.id] = r.action })
      setPendingByCamp(pm)
      setPendingInserts((lPending?.data || []).filter(r => r.action === 'camp_insert').length)
    } catch (e) {
      showToast('فشل تحميل المخيمات: ' + e.message, true)
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

  function applyData(campsData, fams, members) {
    const fc = {}
    fams.forEach(f => { fc[f.camp_id] = (fc[f.camp_id] || 0) + 1 })
    setFamCount(fc)
    computeMaps(campsData, members)
    setOrgMembers(members)
    setCamps(campsData)
  }

  /** memberMap (مندوبين) وmanagerMap (مديري إيواء) — مع وراثة بصرية للفروع بلا تعيين خاص */
  function computeMaps(campsData, members) {
    const mm = {}
    members.filter(m => m.role === 'camp_delegate' && m.camp_id)
      .forEach(m => { mm[m.camp_id] = m.full_name })
    campsData.forEach(c => {
      if (c.parent_camp_id && !mm[c.id] && mm[c.parent_camp_id]) mm[c.id] = mm[c.parent_camp_id]
    })
    setMemberMap(mm)

    const memberById = Object.fromEntries(members.map(m => [m.id, m]))
    const gm = {}
    campsData.forEach(c => {
      const mgr = c.manager_id ? memberById[c.manager_id] : null
      if (mgr?.full_name) gm[c.id] = mgr.full_name
    })
    campsData.forEach(c => {
      if (c.parent_camp_id && !gm[c.id] && gm[c.parent_camp_id]) gm[c.id] = gm[c.parent_camp_id]
    })
    setManagerMap(gm)
  }

  function visibleCamps() {
    if (isOwner || isSuperAdmin) return camps
    return getVisibleCamps(camps)
  }

  function toggleCollapse(id) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function openAdd() {
    setEditCamp(null)
    if (isCampDelegate && !isOwner && !isSuperAdmin) {
      setForm({ ...EMPTY_FORM, camp_type: 'sub', parent_camp_id: profile?.camp_id || '' })
    } else {
      setForm(EMPTY_FORM)
    }
    setShowForm(true)
  }

  function openEdit(camp) {
    setEditCamp(camp)
    setForm({
      name: camp.name || '',
      camp_type: camp.camp_type || 'main',
      parent_camp_id: camp.parent_camp_id || '',
      address: camp.address || '',
      capacity: camp.capacity || '',
      status: camp.status || 'active',
      coordinates: camp.latitude && camp.longitude ? `${camp.latitude},${camp.longitude}` : '',
      manager_id: camp.manager_id || '',
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { showToast('اسم المخيم مطلوب', true); return }

    const allowedToEdit = isOwner || isSuperAdmin || (isCampDelegate && editCamp && profile?.camp_id === editCamp.id)
    const canManageCamps = isOwner || isSuperAdmin || isCampDelegate
    if (editCamp ? !allowedToEdit : !canManageCamps) {
      showToast('⛔ لا تملك صلاحية ' + (editCamp ? 'تعديل' : 'إضافة') + ' المخيمات', true)
      return
    }
    if (!editCamp && isCampDelegate && !isOwner && !isSuperAdmin) {
      if (form.camp_type !== 'sub' || form.parent_camp_id !== profile?.camp_id) {
        showToast('⛔ يمكنك فقط إضافة فرع تحت مخيمك', true)
        return
      }
    }

    setSaving(true)
    try {
      const data = buildCampData(form, editCamp, camps, profile, isOwner, isSuperAdmin)
      const actorId   = profile?.user_id || profile?.id || null
      const actorName = profile?.full_name || '—'

      if (!isExemptFromApproval(profile)) {
        await recordApprovalRequest({
          familyId: null, action: editCamp ? 'camp_update' : 'camp_insert',
          oldData: editCamp || null, newData: data, changes: null,
          actorId, actorName, actorRole: profile?.role || null,
        })
        setShowForm(false)
        showToast(`✅ تم إرسال طلب ${editCamp ? 'التعديل' : 'الإضافة'} للمراجعة`)
        return
      }

      await upsert('camps', data)
      const newCamps = editCamp ? camps.map(c => c.id === data.id ? data : c) : [...camps, data]
      setCamps(newCamps)
      computeMaps(newCamps, orgMembers)
      setShowForm(false)
      showToast(editCamp ? '✅ تم التعديل' : '✅ تمت الإضافة')
    } catch (err) {
      showToast('خطأ: ' + err.message, true)
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete(camp) {
    const allowedToDelete = isOwner || isSuperAdmin || (isCampDelegate && profile?.camp_id === camp.id)
    if (!allowedToDelete) { showToast('⛔ لا تملك صلاحية حذف هذا المخيم', true); return }

    const subCount = camps.filter(c => c.parent_camp_id === camp.id).length
    if (subCount > 0) { showToast(`⛔ يوجد ${subCount} فرع تابع لهذا المخيم — احذف الفروع أولاً`, true); return }
    if ((famCount[camp.id] || 0) > 0) { showToast('⛔ يوجد أسر مسجَّلة بهذا المخيم — لا يمكن الحذف', true); return }

    const exempt = isExemptFromApproval(profile)
    Alert.alert(
      exempt ? `حذف "${camp.name}"؟` : `طلب حذف "${camp.name}"؟`,
      exempt ? 'لا يمكن التراجع عن هذا الإجراء.' : 'سيُرسل الطلب لانتظار موافقة ملك المنصة.',
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'حذف', style: 'destructive', onPress: () => deleteCamp(camp, exempt) },
      ]
    )
  }

  async function deleteCamp(camp, exempt) {
    if (!exempt) {
      try {
        const actorId   = profile?.user_id || profile?.id || null
        const actorName = profile?.full_name || '—'
        await recordApprovalRequest({
          familyId: null, action: 'camp_delete',
          oldData: camp, newData: null, changes: null,
          actorId, actorName, actorRole: profile?.role || null,
        })
        showToast('✅ تم إرسال طلب الحذف للمراجعة')
      } catch (err) { showToast('خطأ: ' + err.message, true) }
      return
    }

    if (!isOnlineNow()) { showToast('⚠️ لا يوجد اتصال — لم يتم الحذف', true); return }
    try {
      await remove('camps', camp.id)
      setCamps(prev => prev.filter(c => c.id !== camp.id))
      showToast('✅ تم الحذف')
    } catch (err) { showToast('خطأ: ' + err.message, true) }
  }

  // ── الحسابات المشتقة ──
  const visible     = visibleCamps()
  const visibleIds  = new Set(visible.map(c => c.id))
  const searchLower = search.trim().toLowerCase()
  const isSearching = !!searchLower

  const parents = isSearching
    ? visible.filter(c => c.name?.toLowerCase().includes(searchLower))
    : visible.filter(c => !c.parent_camp_id || !visibleIds.has(c.parent_camp_id))
  const children = isSearching
    ? []
    : visible.filter(c => !!c.parent_camp_id && visibleIds.has(c.parent_camp_id))
  const mainCamps = camps.filter(c => !c.parent_camp_id)

  const unmanaged = (isOwner || isSuperAdmin) ? visible.filter(c => !memberMap[c.id]) : []

  return (
    <SafeScreen>
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          menu
          icon="⛺"
          title="إدارة المخيمات"
          subtitle={`${visible.length} مخيم`}
          action={(isOwner || isSuperAdmin || isCampDelegate) && (
            <TouchableOpacity onPress={openAdd} style={styles.addBtn}>
              <Text style={styles.addBtnText}>➕ إضافة</Text>
            </TouchableOpacity>
          )}
        />

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="🔍 ابحث باسم المخيم..."
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
        />

        {pendingInserts > 0 && (
          <TouchableOpacity onPress={() => navigation.navigate('PendingRequests')} style={styles.pendingBanner}>
            <Text style={styles.pendingBannerText}>⏳ {pendingInserts} طلب إضافة مخيم بانتظار المراجعة</Text>
            <Text style={styles.pendingBannerArrow}>←</Text>
          </TouchableOpacity>
        )}

        {unmanaged.length > 0 && (
          <View style={styles.unmanagedBox}>
            <Text style={styles.unmanagedTitle}>⚠️ {unmanaged.length} مخيم بلا مندوب معيّن</Text>
            <Text style={styles.unmanagedList}>{unmanaged.map(c => c.name).join('، ')}</Text>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        ) : visible.length === 0 ? (
          <EmptyState icon="⛺" title="لا توجد مخيمات" />
        ) : (
          <View style={styles.list}>
            {parents.map(camp => (
              <CampCard
                key={camp.id}
                pending={pendingByCamp[camp.id]}
                camp={camp}
                sub={children.filter(c => c.parent_camp_id === camp.id)}
                famCount={famCount}
                memberMap={memberMap}
                managerMap={managerMap}
                isOwner={isOwner}
                isSuperAdmin={isSuperAdmin}
                isCampDelegate={isCampDelegate}
                profile={profile}
                onEdit={openEdit}
                onDelete={confirmDelete}
                collapsed={collapsed.has(camp.id)}
                onToggle={() => toggleCollapse(camp.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <CampForm
        visible={showForm}
        onClose={() => setShowForm(false)}
        form={form}
        setForm={setForm}
        editCamp={editCamp}
        mainCamps={mainCamps}
        orgMembers={orgMembers}
        isOwner={isOwner}
        isCampDelegate={isCampDelegate}
        isSuperAdmin={isSuperAdmin}
        profile={profile}
        camps={camps}
        onSave={handleSave}
        saving={saving}
      />
    </View>
    </SafeScreen>
  )
}

/** بناء سجل المخيم الكامل من الفورم — منطق حساب manager_id الهرمي (دالة صرفة) */
function buildCampData(form, editCamp, camps, profile, isOwner, isSuperAdmin) {
  const canSetManager = isOwner
  const parentCamp = form.parent_camp_id ? camps.find(c => c.id === form.parent_camp_id) : null
  const isNewMainCampBySuperAdmin = !editCamp && !form.parent_camp_id && isSuperAdmin && !isOwner

  const resolvedManagerId = (canSetManager && form.manager_id)
    ? form.manager_id
    : isNewMainCampBySuperAdmin
      ? profile?.id
      : form.parent_camp_id
        ? (parentCamp?.manager_id ?? editCamp?.manager_id ?? null)
        : (editCamp?.manager_id ?? null)

  let latitude = editCamp?.latitude || null
  let longitude = editCamp?.longitude || null
  const c = form.coordinates?.trim()
  if (c) {
    const parts = c.split(',')
    const lat = parseFloat(parts[0]?.trim())
    const lng = parseFloat(parts[1]?.trim())
    latitude = isNaN(lat) ? null : lat
    longitude = isNaN(lng) ? null : lng
  }

  return {
    id: editCamp?.id || generateId(),
    org_id: ORG_ID,
    name: form.name.trim(),
    camp_type: form.camp_type || 'main',
    parent_camp_id: form.parent_camp_id || null,
    address: form.address || null,
    capacity: form.capacity ? parseInt(form.capacity) : null,
    status: form.status || 'active',
    latitude, longitude,
    created_at: editCamp?.created_at || new Date().toISOString(),
    manager_id: resolvedManagerId,
    facilities: editCamp?.facilities || 0,
    portal_open: editCamp?.portal_open || false,
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  addBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: colors.bg, fontWeight: '900', fontSize: 13 },
  searchInput: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 16, paddingVertical: 10, color: colors.white, fontSize: 13, marginBottom: 12, textAlign: 'right',
  },
  pendingBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
    borderRadius: radius.md, padding: 12, marginBottom: 12,
  },
  pendingBannerText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  pendingBannerArrow: { color: colors.accent, fontSize: 14 },
  unmanagedBox: {
    backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: radius.md, padding: 12, marginBottom: 12,
  },
  unmanagedTitle: { color: colors.red, fontSize: 12, fontWeight: '700' },
  unmanagedList: { color: colors.muted, fontSize: 11, marginTop: 4 },
  loadingWrap: { paddingVertical: 60, alignItems: 'center' },
  list: { gap: 8 },
})
