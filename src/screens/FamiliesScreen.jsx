/**
 * FamiliesScreen.jsx — قائمة الأسر
 * منقول من camp-registry-react/src/pages/Families/FamiliesList.jsx
 *
 * الملف الحالي يحتوي فقط على:
 *   - حالة الشاشة (useState)
 *   - جلب البيانات من Supabase
 *   - منطق الفلترة والفرز (useMemo)
 *   - renderItem وهيكل الشاشة الرئيسي
 *
 * المكوّنات الفرعية مفصولة في ملفات مستقلة:
 *   src/components/ui/Badge.jsx
 *   src/components/ui/FilterChips.jsx
 *   src/components/families/FamilyDetails.jsx
 *   src/components/families/DuplicateWarnings.jsx
 *   src/components/families/FamilyMembersView.jsx
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useAuth }      from '../context/AuthContext'
import { useDataScope } from '../lib/useDataScope'
import { useApp }       from '../context/AppContext'
import {
  ORG_ID, isExemptFromApproval, logFamilyActivity,
  recordApprovalRequest, supabase, useLocalDB,
  visibleFamilies, isOnlineNow,
} from '../lib/db'
import {
  calcAge, checkFamilyIssues, isIncomplete,
  getMembers, isAgeInRange,
} from '../lib/helpers'
import PageHeader      from '../components/ui/PageHeader'
import EmptyState      from '../components/ui/EmptyState'
import Modal           from '../components/ui/Modal'
import Badge           from '../components/ui/Badge'
import FilterChips     from '../components/ui/FilterChips'
import FamilyDetails   from '../components/families/FamilyDetails'
import { colors, radius } from '../theme'

// ════════════════════════════════════════════════════════════
// الشاشة الرئيسية
// ════════════════════════════════════════════════════════════

export default function FamiliesScreen() {
  // ── الحالة ──
  const [families,       setFamilies]       = useState([])
  const [allMembers,     setAllMembers]      = useState([])
  const [campMap,        setCampMap]         = useState({})
  const [campsList,      setCampsList]       = useState([])
  const [loading,        setLoading]         = useState(true)
  const [syncing,        setSyncing]         = useState(false)
  const [selected,       setSelected]        = useState(null)
  const [selMembers,     setSelMembers]      = useState([])
  const [showFilters,    setShowFilters]     = useState(false)

  // الفلاتر
  const [search,         setSearch]          = useState('')
  const [filterCamp,     setFilterCamp]      = useState('')
  const [filterMiss,     setFilterMiss]      = useState('')
  const [filterApproval, setFilterApproval]  = useState('approved')
  const [filterGender,   setFilterGender]    = useState('')
  const [ageMin,         setAgeMin]          = useState('')
  const [ageMax,         setAgeMax]          = useState('')

  // ── الخدمات ──
  const { canWrite, canEdit, canDelete, profile, isOwner } = useAuth()
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope()
  const { remove } = useLocalDB()
  const { showToast } = useApp()
  const navigation = useNavigation()

  // ════════════════════════════════════════════════════════════
  // جلب البيانات
  // ════════════════════════════════════════════════════════════

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const campIds = getAllowedCampIds(campsList)
      let famsQuery = supabase.from('families').select('*').eq('org_id', ORG_ID)
      if (campIds !== null) {
        if      (campIds.length === 0) famsQuery = famsQuery.eq('camp_id', 'NONE')
        else if (campIds.length === 1) famsQuery = famsQuery.eq('camp_id', campIds[0])
        else                           famsQuery = famsQuery.in('camp_id', campIds)
      }

      const [fRes, cRes] = await Promise.all([
        famsQuery.order('updated_at', { ascending: false }).limit(1000),
        supabase.from('camps').select('*').eq('org_id', ORG_ID),
      ])

      const fams  = fRes.data || []
      const camps = cRes.data || []
      const mems  = await fetchMembers(fams.map(f => f.id))

      applyData(fams, camps, mems)
    } catch (e) {
      showToast('فشل تحميل الأسر: ' + e.message, true)
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }

  async function fetchMembers(familyIds) {
    if (!familyIds.length) return []
    const chunks = []
    for (let i = 0; i < familyIds.length; i += 200)
      chunks.push(familyIds.slice(i, i + 200))
    const results = await Promise.all(
      chunks.map(c =>
        supabase.from('family_members')
          .select('id,family_id,name,national_id,relation,dob,gender,health')
          .in('family_id', c)
      )
    )
    return results.flatMap(r => (!r.error && r.data) ? r.data : [])
  }

  function applyData(fams, camps, mems) {
    setCampMap(Object.fromEntries(camps.map(c => [c.id, c.name])))
    setCampsList(camps)
    const campIds     = getAllowedCampIds(camps)
    const scopedFams  = filterLocal(visibleFamilies(fams, isOwner), campIds)
    const scopedFamIds = new Set(scopedFams.map(f => f.id))
    const scopedMems  = campIds === null
      ? mems
      : mems.filter(m => scopedFamIds.has(m.family_id))
    setFamilies(scopedFams)
    setAllMembers(scopedMems)
  }

  async function manualRefresh() {
    if (!isOnlineNow()) { showToast('لا يوجد اتصال', true); return }
    setSyncing(true)
    await load()
    showToast('✅ تم التحديث')
  }

  // ════════════════════════════════════════════════════════════
  // فتح تفاصيل أسرة
  // ════════════════════════════════════════════════════════════

  async function openFamily(family) {
    setSelected(family)
    setSelMembers(getMembers(allMembers, family))
    if (!isOnlineNow()) return
    const { data } = await supabase.from('family_members').select('*').eq('family_id', family.id)
    if (data) {
      setSelMembers(getMembers(data, family))
      setAllMembers(prev => [...prev.filter(m => m.family_id !== family.id), ...data])
    }
  }

  // ════════════════════════════════════════════════════════════
  // حذف أسرة
  // ════════════════════════════════════════════════════════════

  function confirmDelete(id) {
    Alert.alert('حذف هذه الأسرة؟', 'لا يمكن التراجع عن هذا الإجراء.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => deleteFamily(id) },
    ])
  }

  async function deleteFamily(id) {
    if (!isOnlineNow()) { showToast('⚠️ لا يوجد اتصال', true); return }
    try {
      const famBeforeDelete  = families.find(f => f.id === id)
      const membersBeforeDel = allMembers.filter(m => m.family_id === id)
      const actorId   = profile?.user_id || profile?.id || null
      const actorName = profile?.full_name || '—'

      if (isExemptFromApproval(profile)) {
        await supabase.from('family_members').delete().eq('family_id', id)
        await supabase.from('families').delete().eq('id', id)
        logFamilyActivity({
          familyId: id, familyName: famBeforeDelete?.head_name,
          membersCount: membersBeforeDel.length, action: 'delete', actorId, actorName,
        })
        setFamilies(prev => prev.filter(f => f.id !== id))
        setAllMembers(prev => prev.filter(m => m.family_id !== id))
        setSelected(null)
        showToast('✅ تم الحذف')
      } else {
        await recordApprovalRequest({
          familyId: id, action: 'delete',
          oldData: famBeforeDelete, newData: null, changes: null,
          actorId, actorName, actorRole: profile?.role || null,
        })
        setFamilies(prev => prev.filter(f => f.id !== id))
        setSelected(null)
        showToast('✅ تم إرسال طلب الحذف — بانتظار موافقة ملك المنصة')
      }
    } catch (err) {
      showToast('خطأ: ' + err.message, true)
    }
  }

  // ════════════════════════════════════════════════════════════
  // الحسابات المشتقة (useMemo)
  // ════════════════════════════════════════════════════════════

  const { dupFamilyIds, dupPhoneFamilyIds } = useMemo(
    () => buildDuplicateSets(families, allMembers),
    [families, allMembers]
  )

  const memberCount = useMemo(() => {
    return Object.fromEntries(families.map(f => [f.id, getMembers(allMembers, f).length]))
  }, [families, allMembers])

  const counts = useMemo(
    () => buildCounts(families, allMembers, filterCamp, dupFamilyIds, dupPhoneFamilyIds),
    [families, allMembers, filterCamp, dupFamilyIds, dupPhoneFamilyIds]
  )

  const filtered = useMemo(
    () => applyFilters(families, allMembers, {
      filterCamp, filterGender, filterApproval, filterMiss,
      ageMin, ageMax, search, dupFamilyIds, dupPhoneFamilyIds, memberCount,
    }),
    [families, allMembers, filterCamp, filterGender, filterApproval,
     filterMiss, ageMin, ageMax, search, dupFamilyIds, dupPhoneFamilyIds, memberCount]
  )

  const visibleCampsList = useMemo(
    () => getVisibleCamps(campsList),
    [campsList]
  )

  const hasFilter = !!(filterCamp || filterMiss || filterGender || ageMin || ageMax || search
    || filterApproval !== 'approved')

  function resetFilters() {
    setFilterCamp(''); setFilterMiss(''); setFilterGender('')
    setAgeMin(''); setAgeMax(''); setSearch('')
    setFilterApproval('approved')
  }

  // ════════════════════════════════════════════════════════════
  // renderItem
  // ════════════════════════════════════════════════════════════

  const renderItem = useCallback(({ item: f, index: i }) => {
    const fMems      = allMembers.filter(m => m.family_id === f.id)
    const famIssues  = checkFamilyIssues(f, fMems)
    const incomplete = famIssues.length > 0
    const isDupId    = dupFamilyIds.has(f.id)
    const isDupPhone = dupPhoneFamilyIds.has(f.id)
    const mc         = (memberCount[f.id] || 0) + 1
    const borderColor = incomplete ? colors.red : isDupId ? colors.purple : isDupPhone ? colors.blue : colors.border

    return (
      <TouchableOpacity
        onPress={() => openFamily(f)}
        activeOpacity={0.7}
        style={[styles.row, { borderRightColor: borderColor }]}
      >
        <Text style={styles.rowIndex}>{i + 1}</Text>

        <View style={styles.rowMain}>
          <Text style={styles.rowName}>{f.head_name || '—'}</Text>
          {!!f.head_id && <Text style={styles.rowId}>{f.head_id}</Text>}

          <View style={styles.badgeRow}>
            {f.review_status === 'pending'  && <Badge color={colors.accent} text="🔍 قيد المراجعة" />}
            {f.review_status === 'rejected' && <Badge color={colors.red}    text="❌ مرفوض" />}
            {incomplete  && <Badge color={colors.red}    text={`⚠️ ${famIssues.length} نقص`} />}
            {isDupId     && <Badge color={colors.purple} text="🔁 هوية" />}
            {isDupPhone  && <Badge color={colors.blue}   text="📞 جوال" />}
            {!incomplete && !isDupId && !isDupPhone &&
              <Text style={styles.okMark}>✅</Text>}
          </View>

          <Text style={styles.rowMeta}>{campMap[f.camp_id] || '—'} · {f.phone1 || '—'}</Text>
        </View>

        <Text style={styles.rowCount}>{mc}</Text>
      </TouchableOpacity>
    )
  }, [allMembers, dupFamilyIds, dupPhoneFamilyIds, memberCount, campMap])

  // ════════════════════════════════════════════════════════════
  // الواجهة
  // ════════════════════════════════════════════════════════════

  return (
    <View style={styles.screen}>
      {/* الرأس والبحث والفلاتر */}
      <View style={styles.header}>
        <PageHeader
          icon="👨‍👩‍👧‍👦"
          title="قائمة الأسر"
          subtitle={`${filtered.length}/${families.length} أسرة`}
          action={
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={manualRefresh} disabled={syncing} style={styles.iconBtn}>
                <Text>{syncing ? '⏳' : '🔄'}</Text>
              </TouchableOpacity>
              {canWrite && (
                <TouchableOpacity onPress={() => navigation.navigate('FamilyForm')} style={styles.addBtn}>
                  <Text style={styles.addBtnText}>➕ إضافة</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="🔍 بحث باسم أو هوية أو جوال..."
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
        />

        <TouchableOpacity onPress={() => setShowFilters(s => !s)} style={styles.filterToggle}>
          <Text style={styles.filterToggleText}>
            {showFilters ? '▲ إخفاء الفلاتر' : '▼ الفلاتر'}
            {hasFilter ? ` · ${filtered.length} نتيجة` : ''}
          </Text>
          {hasFilter && (
            <TouchableOpacity onPress={resetFilters}>
              <Text style={styles.resetText}>↺ إعادة</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        {showFilters && (
          <View style={styles.filtersBox}>
            <FilterChips
              label="الحالة"
              value={filterMiss}
              onChange={setFilterMiss}
              options={[
                { value: '',            label: `الكل (${families.length})` },
                { value: 'incomplete',  label: `⚠️ ناقص (${counts.incomplete})` },
                { value: 'dup_id',      label: `🔁 هوية (${counts.dup_id})` },
                { value: 'dup_phone',   label: `📞 جوال (${counts.dup_phone})` },
              ]}
            />
            <FilterChips
              label="المراجعة"
              value={filterApproval}
              onChange={setFilterApproval}
              options={[
                { value: 'approved', label: `✅ مكتمل (${counts.approved})` },
                { value: 'pending',  label: `🔍 مراجعة (${counts.pending})` },
                { value: 'rejected', label: `❌ مرفوض (${counts.rejected})` },
                { value: '',         label: `الكل (${families.length})` },
              ]}
            />
            <FilterChips
              label="المخيم"
              value={filterCamp}
              onChange={setFilterCamp}
              options={[
                { value: '', label: `كل المخيمات (${families.length})` },
                ...visibleCampsList.map(c => ({
                  value: c.id,
                  label: `${c.name} (${families.filter(f => f.camp_id === c.id).length})`,
                })),
              ]}
            />
            <FilterChips
              label="الجنس"
              value={filterGender}
              onChange={setFilterGender}
              options={[
                { value: '',      label: 'الكل' },
                { value: 'ذكر',   label: '👨 ذكر' },
                { value: 'أنثى',  label: '👩 أنثى' },
              ]}
            />
            <View style={styles.ageRow}>
              <Text style={styles.ageLabel}>🎂 العمر من</Text>
              <TextInput value={ageMin} onChangeText={setAgeMin} keyboardType="number-pad"
                style={styles.ageInput} placeholderTextColor={colors.muted} />
              <Text style={styles.ageLabel}>إلى</Text>
              <TextInput value={ageMax} onChangeText={setAgeMax} keyboardType="number-pad"
                style={styles.ageInput} placeholderTextColor={colors.muted} />
              <Text style={styles.ageLabel}>سنة</Text>
            </View>
          </View>
        )}
      </View>

      {/* القائمة أو حالة التحميل أو الفراغ */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🔍"
          title={families.length === 0 ? 'لا توجد بيانات' : 'لا توجد نتائج'}
          subtitle={families.length === 0 ? 'اضغط 🔄 لجلب البيانات' : 'جرب تغيير الفلاتر'}
          action={families.length === 0 ? '🔄 جلب' : (hasFilter ? '↺ مسح الفلاتر' : null)}
          onAction={families.length === 0 ? manualRefresh : (hasFilter ? resetFilters : null)}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={f => f.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Modal تفاصيل الأسرة */}
      <Modal
        open={!!selected}
        onClose={() => { setSelected(null); setSelMembers([]) }}
        title="تفاصيل الأسرة"
        size="lg"
      >
        {selected && (
          <FamilyDetails
            selected={selected}
            campMap={campMap}
            selMembers={selMembers}
            families={families}
            allMembers={allMembers}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={() => { navigation.navigate('FamilyForm', { familyId: selected.id }); setSelected(null) }}
            onDelete={() => confirmDelete(selected.id)}
          />
        )}
      </Modal>
    </View>
  )
}

// ════════════════════════════════════════════════════════════
// دوال صرفة خارج المكوّن (لا تعتمد على State — أسرع، قابلة للاختبار)
// ════════════════════════════════════════════════════════════

function buildDuplicateSets(families, allMembers) {
  const idToFams = {}
  families.forEach(f => {
    if (f.head_id) {
      if (!idToFams[f.head_id]) idToFams[f.head_id] = new Set()
      idToFams[f.head_id].add(f.id)
    }
  })
  allMembers.forEach(m => {
    if (m.national_id && m.family_id) {
      if (!idToFams[m.national_id]) idToFams[m.national_id] = new Set()
      idToFams[m.national_id].add(m.family_id)
    }
  })
  const dupFamilyIds = new Set()
  families.forEach(f => {
    if (f.head_id && (idToFams[f.head_id]?.size || 0) > 1) dupFamilyIds.add(f.id)
    allMembers.filter(m => m.family_id === f.id).forEach(m => {
      if (m.national_id && (idToFams[m.national_id]?.size || 0) > 1) dupFamilyIds.add(f.id)
    })
  })

  const cleanPh = p => (p || '').replace(/\s/g, '')
  const phCount = {}
  families.forEach(f => {
    if (f.phone1) phCount[cleanPh(f.phone1)] = (phCount[cleanPh(f.phone1)] || 0) + 1
  })
  const dupPhoneFamilyIds = new Set(
    families.filter(f => f.phone1 && (phCount[cleanPh(f.phone1)] || 0) > 1).map(f => f.id)
  )
  return { dupFamilyIds, dupPhoneFamilyIds }
}

function buildCounts(families, allMembers, filterCamp, dupFamilyIds, dupPhoneFamilyIds) {
  const base = filterCamp ? families.filter(f => f.camp_id === filterCamp) : families
  const memsByFam = {}
  allMembers.forEach(m => {
    if (!memsByFam[m.family_id]) memsByFam[m.family_id] = []
    memsByFam[m.family_id].push(m)
  })
  return {
    incomplete: base.filter(f => isIncomplete(f, memsByFam[f.id])).length,
    dup_id:     base.filter(f => dupFamilyIds.has(f.id)).length,
    dup_phone:  base.filter(f => dupPhoneFamilyIds.has(f.id)).length,
    approved:   base.filter(f => (f.review_status || 'approved') === 'approved').length,
    pending:    base.filter(f => f.review_status === 'pending').length,
    rejected:   base.filter(f => f.review_status === 'rejected').length,
  }
}

function applyFilters(families, allMembers, opts) {
  const {
    filterCamp, filterGender, filterApproval, filterMiss,
    ageMin, ageMax, search, dupFamilyIds, dupPhoneFamilyIds, memberCount,
  } = opts

  let list = [...families]
  if (filterCamp)     list = list.filter(f => f.camp_id === filterCamp)
  if (filterGender)   list = list.filter(f => f.head_gender === filterGender)
  if (filterApproval) list = list.filter(f => (f.review_status || 'approved') === filterApproval)

  const memsByFam = {}
  allMembers.forEach(m => {
    if (!memsByFam[m.family_id]) memsByFam[m.family_id] = []
    memsByFam[m.family_id].push(m)
  })

  if (filterMiss === 'incomplete') list = list.filter(f => isIncomplete(f, memsByFam[f.id]))
  if (filterMiss === 'dup_id')     list = list.filter(f => dupFamilyIds.has(f.id))
  if (filterMiss === 'dup_phone')  list = list.filter(f => dupPhoneFamilyIds.has(f.id))

  if (ageMin || ageMax) {
    list = list.filter(f =>
      isAgeInRange(f.head_dob, ageMin, ageMax) ||
      (memsByFam[f.id] || []).some(m => isAgeInRange(m.dob, ageMin, ageMax))
    )
  }

  if (search) {
    const q = search.toLowerCase()
    list = list.filter(f =>
      (f.head_name || '').toLowerCase().includes(q) ||
      (f.head_id   || '').includes(q) ||
      (f.phone1    || '').includes(q)
    )
  }

  if (filterMiss === 'incomplete') {
    list.sort((a, b) =>
      checkFamilyIssues(b, memsByFam[b.id]).length -
      checkFamilyIssues(a, memsByFam[a.id]).length
    )
  } else {
    list.sort((a, b) => (memberCount[b.id] || 0) - (memberCount[a.id] || 0))
  }

  return list
}

// ════════════════════════════════════════════════════════════
// الأنماط
// ════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16 },

  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 36, height: 36, borderRadius: radius.md,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtn: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 8, justifyContent: 'center',
  },
  addBtnText: { color: colors.bg, fontWeight: '900', fontSize: 13 },

  searchInput: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10,
    color: colors.white, fontSize: 13, marginBottom: 8, textAlign: 'right',
  },

  filterToggle: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 6, marginBottom: 6,
  },
  filterToggleText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  resetText:        { color: colors.muted, fontSize: 12, fontWeight: '700' },

  filtersBox: { paddingBottom: 8 },
  ageRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  ageLabel:   { color: colors.muted, fontSize: 11 },
  ageInput:   {
    width: 50, backgroundColor: colors.surface2, borderWidth: 1,
    borderColor: colors.border, borderRadius: radius.sm,
    paddingVertical: 6, color: colors.white, fontSize: 12, textAlign: 'center',
  },

  loadingWrap:  { paddingVertical: 60, alignItems: 'center' },
  listContent:  { paddingHorizontal: 16, paddingBottom: 24, gap: 6 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRightWidth: 3, borderRadius: radius.md, padding: 10,
  },
  rowIndex:  { color: colors.muted, fontSize: 10, width: 18 },
  rowMain:   { flex: 1, gap: 2 },
  rowName:   { color: colors.white, fontWeight: '700', fontSize: 13 },
  rowId:     { color: colors.muted, fontSize: 10 },
  badgeRow:  { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginTop: 2 },
  okMark:    { color: colors.green, fontSize: 11 },
  rowMeta:   { color: colors.muted, fontSize: 10, marginTop: 2 },
  rowCount:  { color: colors.accent, fontWeight: '900', fontSize: 14, minWidth: 24, textAlign: 'center' },
})
