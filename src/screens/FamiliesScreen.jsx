/**
 * FamiliesScreen.jsx — قائمة الأسر الكاملة
 * منقول من camp-registry-react/src/pages/Families/FamiliesList.jsx
 * نفس منطق الأعمال بالكامل: الفلاتر، البحث، كشف التكرارات، النواقص،
 * تفاصيل الأسرة، الحذف (مع نظام الموافقات)، عزل البيانات حسب الدور.
 *
 * تبسيطات متعمدة (وليست حذف وظيفة حقيقية — انظر التوثيق):
 *   - الأصل به طبقتا "تحميل من SQLite" و"مزامنة الخلفية" + الاستماع لحدث
 *     'delta-sync'. تم تأكيد أن هذه كود ميت (no-op): لا SQLite فعلي في db.js
 *     (يصرّح بذلك صريحاً)، ولا يوجد أي dispatchEvent('delta-sync') بكامل
 *     المشروع. هنا: تحميل مباشر من Supabase عند فتح الشاشة + زر تحديث يدوي.
 *   - navigator.onLine → isOnlineNow() من db.js
 *   - window.confirm (غير موجود في RN) → Alert.alert مع callback
 *   - <table> → FlatList مع بطاقات (أنسب لشاشة موبايل ضيقة من جدول أعمدة)
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Alert, ScrollView,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useAuth } from '../context/AuthContext'
import { useDataScope } from '../lib/useDataScope'
import { useApp } from '../context/AppContext'
import {
  ORG_ID, isExemptFromApproval, logFamilyActivity, recordApprovalRequest,
  supabase, useLocalDB, visibleFamilies, isOnlineNow,
} from '../lib/db'
import { formatDate } from '../lib/utils'
import { calcAge, checkFamilyIssues, isIncomplete, getMembers, getMemberIcon, isAgeInRange } from '../lib/helpers'
import PageHeader from '../components/ui/PageHeader'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import { colors, radius } from '../theme'

export default function FamiliesScreen() {
  const [families,    setFamilies]    = useState([])
  const [allMembers,  setAllMembers]  = useState([])
  const [campMap,     setCampMap]     = useState({})
  const [campsList,   setCampsList]   = useState([])
  const [search,      setSearch]      = useState('')
  const [filterCamp,  setFilterCamp]  = useState('')
  const [filterMiss,  setFilterMiss]  = useState('')
  const [filterApproval, setFilterApproval] = useState('approved')
  const [filterGender,setFilterGender]= useState('')
  const [ageMin,      setAgeMin]      = useState('')
  const [ageMax,      setAgeMax]      = useState('')
  const [loading,     setLoading]     = useState(true)
  const [syncing,     setSyncing]     = useState(false)
  const [selected,    setSelected]    = useState(null)
  const [selMembers,  setSelMembers]  = useState([])
  const [showFilters, setShowFilters] = useState(false)

  const { canWrite, canEdit, canDelete, profile, isOwner } = useAuth()
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope()
  const { query, upsert, bulkUpsert, remove } = useLocalDB()
  const { showToast } = useApp()
  const navigation = useNavigation()

  // ── تحميل عند فتح الشاشة (مباشرة من Supabase — لا تخزين محلي) ──
  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const campIds = getAllowedCampIds(campsList)
      let famsQuery = supabase.from('families').select('*').eq('org_id', ORG_ID)
      if (campIds !== null) {
        if (campIds.length === 0) famsQuery = famsQuery.eq('camp_id', 'NONE')
        else if (campIds.length === 1) famsQuery = famsQuery.eq('camp_id', campIds[0])
        else famsQuery = famsQuery.in('camp_id', campIds)
      }
      const [fRes, cRes] = await Promise.all([
        famsQuery.order('updated_at', { ascending: false }).limit(1000),
        supabase.from('camps').select('*').eq('org_id', ORG_ID),
      ])
      const fams  = fRes.data || []
      const camps = cRes.data || []

      let mems = []
      const ids = fams.map(f => f.id)
      const chunks = []
      for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200))
      if (chunks.length) {
        const res = await Promise.all(chunks.map(c =>
          supabase.from('family_members')
            .select('id,family_id,name,national_id,relation,dob,gender,health')
            .in('family_id', c)
        ))
        res.forEach(r => { if (!r.error && r.data) mems.push(...r.data) })
      }

      applyData(fams, camps, mems)
    } catch (e) {
      console.warn('[families] load:', e.message)
      showToast('فشل تحميل الأسر: ' + e.message, true)
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }

  async function manualRefresh() {
    if (!isOnlineNow()) { showToast('لا يوجد اتصال', true); return }
    setSyncing(true)
    await load()
    showToast('✅ تم التحديث')
  }

  function applyData(fams, camps, mems) {
    const cm = {}
    camps.forEach(c => { cm[c.id] = c.name })
    setCampMap(cm)
    setCampsList(camps)
    const visibleFams = visibleFamilies(fams, isOwner)
    const campIds = getAllowedCampIds(camps)
    const scopedFams = filterLocal(visibleFams, campIds)
    const scopedFamIds = new Set(scopedFams.map(f => f.id))
    const scopedMems = campIds === null ? mems : mems.filter(m => scopedFamIds.has(m.family_id))
    setFamilies(scopedFams)
    setAllMembers(scopedMems)
  }

  // ── فتح تفاصيل أسرة ──
  async function openFamily(family) {
    setSelected(family)
    setSelMembers(getMembers(allMembers, family)) // عرض فوري من الذاكرة
    if (isOnlineNow()) {
      const { data } = await supabase.from('family_members').select('*').eq('family_id', family.id)
      if (data) {
        setSelMembers(getMembers(data, family))
        setAllMembers(prev => {
          const others = prev.filter(m => m.family_id !== family.id)
          return [...others, ...data]
        })
      }
    }
  }

  // ── حذف أسرة ──
  function confirmDelete(id) {
    Alert.alert('حذف هذه الأسرة؟', 'لا يمكن التراجع عن هذا الإجراء.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => deleteFamily(id) },
    ])
  }

  async function deleteFamily(id) {
    try {
      const famBeforeDelete  = families.find(f => f.id === id)
      const membersBeforeDel = allMembers.filter(m => m.family_id === id)
      const actorId   = profile?.user_id || profile?.id || null
      const actorName = profile?.full_name || profile?.name || '—'
      const exempt = isExemptFromApproval(profile)

      if (!isOnlineNow()) { showToast('⚠️ لا يوجد اتصال — لم يتم الحذف من السيرفر', true); return }

      if (exempt) {
        await supabase.from('family_members').delete().eq('family_id', id)
        await supabase.from('families').delete().eq('id', id)
        logFamilyActivity({
          familyId: id, familyName: famBeforeDelete?.head_name,
          membersCount: membersBeforeDel.length, action: 'delete', actorId, actorName,
        })
        setFamilies(f => f.filter(x => x.id !== id))
        setAllMembers(m => m.filter(x => x.family_id !== id))
        setSelected(null)
        showToast('✅ تم الحذف')
      } else {
        await recordApprovalRequest({
          familyId: id, action: 'delete', oldData: famBeforeDelete, newData: null, changes: null,
          actorId, actorName, actorRole: profile?.role || null,
        })
        setFamilies(f => f.filter(x => x.id !== id))
        setSelected(null)
        showToast('✅ تم إرسال طلب الحذف — بانتظار موافقة ملك المنصة')
      }
    } catch (err) { showToast('خطأ: ' + err.message, true) }
  }

  // ── حساب التكرارات ──
  const { dupFamilyIds, dupPhoneFamilyIds } = useMemo(() => {
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
      if (f.phone1) { const p = cleanPh(f.phone1); phCount[p] = (phCount[p] || 0) + 1 }
    })
    const dupPhoneFamilyIds = new Set(
      families.filter(f => f.phone1 && (phCount[cleanPh(f.phone1)] || 0) > 1).map(f => f.id)
    )

    return { dupFamilyIds, dupPhoneFamilyIds }
  }, [families, allMembers])

  const counts = useMemo(() => {
    const base = filterCamp ? families.filter(f => f.camp_id === filterCamp) : families
    const memsByFam = {}
    allMembers.forEach(m => { if (!memsByFam[m.family_id]) memsByFam[m.family_id] = []; memsByFam[m.family_id].push(m) })
    return {
      incomplete: base.filter(f => isIncomplete(f, memsByFam[f.id])).length,
      dup_id:     base.filter(f => dupFamilyIds.has(f.id)).length,
      dup_phone:  base.filter(f => dupPhoneFamilyIds.has(f.id)).length,
      approved:   base.filter(f => (f.review_status || 'approved') === 'approved').length,
      pending:    base.filter(f => f.review_status === 'pending').length,
      rejected:   base.filter(f => f.review_status === 'rejected').length,
    }
  }, [families, allMembers, filterCamp, dupFamilyIds, dupPhoneFamilyIds])

  const memberCount = useMemo(() => {
    const mc = {}
    families.forEach(f => { mc[f.id] = getMembers(allMembers, f).length })
    return mc
  }, [families, allMembers])

  const filtered = useMemo(() => {
    let list = [...families]
    if (filterCamp)   list = list.filter(f => f.camp_id === filterCamp)
    if (filterGender) list = list.filter(f => f.head_gender === filterGender)
    if (filterApproval) list = list.filter(f => (f.review_status || 'approved') === filterApproval)
    const memsByFamF = {}
    allMembers.forEach(m => { if (!memsByFamF[m.family_id]) memsByFamF[m.family_id] = []; memsByFamF[m.family_id].push(m) })
    if (filterMiss === 'incomplete') list = list.filter(f => isIncomplete(f, memsByFamF[f.id]))
    if (filterMiss === 'dup_id')     list = list.filter(f => dupFamilyIds.has(f.id))
    if (filterMiss === 'dup_phone')  list = list.filter(f => dupPhoneFamilyIds.has(f.id))
    if (ageMin || ageMax) {
      const inRange = dob => isAgeInRange(dob, ageMin || '', ageMax || '')
      const memsByFam = {}
      allMembers.forEach(m => {
        if (!memsByFam[m.family_id]) memsByFam[m.family_id] = []
        memsByFam[m.family_id].push(m)
      })
      list = list.filter(f => inRange(f.head_dob) || (memsByFam[f.id] || []).some(m => inRange(m.dob)))
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
      list.sort((a, b) => checkFamilyIssues(b, memsByFamF[b.id]).length - checkFamilyIssues(a, memsByFamF[a.id]).length)
    } else {
      list.sort((a, b) => (memberCount[b.id] || 0) - (memberCount[a.id] || 0))
    }
    return list
  }, [families, allMembers, filterCamp, filterGender, filterMiss, filterApproval, ageMin, ageMax, search, dupFamilyIds, dupPhoneFamilyIds, memberCount])

  const hasFilter = filterCamp || filterMiss || filterGender || ageMin || ageMax || search || filterApproval !== 'approved'
  const visibleCampsList = useMemo(() => getVisibleCamps(campsList), [campsList])

  function resetFilters() {
    setFilterCamp(''); setFilterMiss(''); setFilterGender('')
    setAgeMin(''); setAgeMax(''); setSearch('')
  }

  const renderItem = useCallback(({ item: f, index: i }) => {
    const fMems      = allMembers.filter(m => m.family_id === f.id)
    const famIssues  = checkFamilyIssues(f, fMems)
    const incomplete = famIssues.length > 0
    const isDupId    = dupFamilyIds.has(f.id)
    const isDupPhone = dupPhoneFamilyIds.has(f.id)
    const mc         = (memberCount[f.id] || 0) + 1

    let borderColor = colors.border
    if (incomplete) borderColor = colors.red
    else if (isDupId) borderColor = colors.purple
    else if (isDupPhone) borderColor = colors.blue

    return (
      <TouchableOpacity onPress={() => openFamily(f)} activeOpacity={0.7}
        style={[styles.row, { borderRightColor: borderColor }]}>
        <Text style={styles.rowIndex}>{i + 1}</Text>
        <View style={styles.rowMain}>
          <Text style={styles.rowName}>{f.head_name || '—'}</Text>
          {!!f.head_id && <Text style={styles.rowId}>{f.head_id}</Text>}
          <View style={styles.badgeRow}>
            {f.review_status === 'pending' && <Badge color={colors.accent} text="🔍 قيد المراجعة" />}
            {f.review_status === 'rejected' && <Badge color={colors.red} text="❌ مرفوض" />}
            {incomplete && <Badge color={colors.red} text={`⚠️ ${famIssues.length} نقص`} />}
            {isDupId && <Badge color={colors.purple} text="🔁 هوية" />}
            {isDupPhone && <Badge color={colors.blue} text="📞 جوال" />}
            {!incomplete && !isDupId && !isDupPhone && <Text style={{ color: colors.green, fontSize: 11 }}>✅</Text>}
          </View>
          <Text style={styles.rowMeta}>{campMap[f.camp_id] || '—'} · {f.phone1 || '—'}</Text>
        </View>
        <View style={styles.rowCountWrap}>
          <Text style={styles.rowCount}>{mc}</Text>
        </View>
      </TouchableOpacity>
    )
  }, [allMembers, dupFamilyIds, dupPhoneFamilyIds, memberCount, campMap])

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <PageHeader icon="👨‍👩‍👧‍👦" title="قائمة الأسر"
          subtitle={`${filtered.length}/${families.length} أسرة`}
          action={
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={manualRefresh} disabled={syncing} style={styles.iconBtn}>
                <Text style={{ fontSize: 15 }}>{syncing ? '⏳' : '🔄'}</Text>
              </TouchableOpacity>
              {canWrite && (
                <TouchableOpacity onPress={() => navigation.navigate('FamilyForm')} style={styles.addBtn}>
                  <Text style={styles.addBtnText}>➕ إضافة</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />

        <TextInput value={search} onChangeText={setSearch}
          placeholder="🔍 بحث باسم رب الأسرة أو رقم الهوية أو الجوال..."
          placeholderTextColor={colors.muted} style={styles.searchInput} />

        <TouchableOpacity onPress={() => setShowFilters(s => !s)} style={styles.filterToggle}>
          <Text style={styles.filterToggleText}>
            {showFilters ? '▲ إخفاء الفلاتر' : '▼ الفلاتر'} {hasFilter ? `(${filtered.length} نتيجة)` : ''}
          </Text>
        </TouchableOpacity>

        {showFilters && (
          <View style={styles.filtersBox}>
            <FilterChips label="الحالة" value={filterMiss} onChange={setFilterMiss} options={[
              { value: '', label: `الكل (${families.length})` },
              { value: 'incomplete', label: `⚠️ ناقص (${counts.incomplete})` },
              { value: 'dup_id', label: `🔁 هوية (${counts.dup_id})` },
              { value: 'dup_phone', label: `📞 جوال (${counts.dup_phone})` },
            ]} />
            <FilterChips label="المراجعة" value={filterApproval} onChange={setFilterApproval} options={[
              { value: 'approved', label: `✅ مكتمل (${counts.approved})` },
              { value: 'pending', label: `🔍 مراجعة (${counts.pending})` },
              { value: 'rejected', label: `❌ مرفوض (${counts.rejected})` },
              { value: '', label: `الكل (${families.length})` },
            ]} />
            <FilterChips label="المخيم" value={filterCamp} onChange={setFilterCamp} options={[
              { value: '', label: `كل المخيمات (${families.length})` },
              ...visibleCampsList.map(c => ({
                value: c.id, label: `${c.name} (${families.filter(f => f.camp_id === c.id).length})`,
              })),
            ]} />
            <FilterChips label="الجنس" value={filterGender} onChange={setFilterGender} options={[
              { value: '', label: 'الكل' },
              { value: 'ذكر', label: '👨 ذكر' },
              { value: 'أنثى', label: '👩 أنثى' },
            ]} />
            <View style={styles.ageRow}>
              <Text style={styles.ageLabel}>🎂 العمر من</Text>
              <TextInput value={ageMin} onChangeText={setAgeMin} keyboardType="number-pad"
                style={styles.ageInput} placeholderTextColor={colors.muted} />
              <Text style={styles.ageLabel}>إلى</Text>
              <TextInput value={ageMax} onChangeText={setAgeMax} keyboardType="number-pad"
                style={styles.ageInput} placeholderTextColor={colors.muted} />
              <Text style={styles.ageLabel}>سنة</Text>
            </View>
            {hasFilter && (
              <TouchableOpacity onPress={resetFilters} style={styles.resetBtn}>
                <Text style={styles.resetBtnText}>↺ إعادة الفلاتر</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator color={colors.accent} size="large" /></View>
      ) : filtered.length === 0 ? (
        <EmptyState icon="🔍"
          title={families.length === 0 ? 'لا توجد بيانات' : 'لا توجد نتائج'}
          subtitle={families.length === 0 ? 'اضغط 🔄 لجلب البيانات من الخادم' : 'جرب تغيير الفلاتر'}
          action={families.length === 0 ? '🔄 جلب البيانات' : (hasFilter ? '↺ مسح الفلاتر' : null)}
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

      <Modal open={!!selected} onClose={() => { setSelected(null); setSelMembers([]) }} title="تفاصيل الأسرة" size="lg">
        {selected && (
          <FamilyDetails
            selected={selected} campMap={campMap} selMembers={selMembers}
            families={families} allMembers={allMembers}
            canEdit={canEdit} canDelete={canDelete}
            onEdit={() => { navigation.navigate('FamilyForm', { familyId: selected.id }); setSelected(null) }}
            onDelete={() => confirmDelete(selected.id)}
          />
        )}
      </Modal>
    </View>
  )
}

// ════════════════════════════════════════════════════════════
// مكونات فرعية
// ════════════════════════════════════════════════════════════

function Badge({ color, text }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '26', borderColor: color + '66' }]}>
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
  )
}

function FilterChips({ label, value, onChange, options }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.chipsLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {options.map(o => {
            const active = o.value === value
            return (
              <TouchableOpacity key={o.value} onPress={() => onChange(o.value)}
                style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
}

function FamilyDetails({ selected, campMap, selMembers, families, allMembers, canEdit, canDelete, onEdit, onDelete }) {
  const fields = [
    ['الاسم', selected.head_name],
    ['رقم الهوية', selected.head_id],
    ['الجوال', selected.phone1],
    ['جوال 2', selected.phone2],
    ['الجنس', selected.head_gender],
    ['الحالة الاجتماعية', selected.head_marital],
    ['المخيم', campMap[selected.camp_id]],
    ['الخيمة', selected.tent],
    ['المنطقة الأصلية', selected.original_address],
    ['العنوان التفصيلي', selected.address_details],
    ['تاريخ الميلاد', selected.head_dob ? formatDate(selected.head_dob) : null],
    ['العمر', calcAge(selected.head_dob) ? `${calcAge(selected.head_dob)} سنة` : null],
    ['تاريخ التسجيل', formatDate(selected.created_at)],
  ].filter(([, v]) => v)

  return (
    <View style={{ gap: 16 }}>
      <DuplicateWarnings family={selected} families={families} allMembers={allMembers} />

      <View style={styles.detailsCard}>
        <Text style={styles.detailsCardTitle}>👤 رب الأسرة</Text>
        <View style={styles.detailsGrid}>
          {fields.map(([k, v]) => (
            <View key={k} style={styles.detailsItem}>
              <Text style={styles.detailsKey}>{k}</Text>
              <Text style={styles.detailsValue}>{v}</Text>
            </View>
          ))}
        </View>
      </View>

      <FamilyMembersView members={selMembers} family={selected} />

      {selected.notes && (
        <View style={styles.notesBox}>
          <Text style={styles.notesLabel}>📝 ملاحظات</Text>
          <Text style={styles.notesText}>{selected.notes}</Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {canEdit && (
          <TouchableOpacity onPress={onEdit} style={styles.editBtn}>
            <Text style={styles.editBtnText}>✏️ تعديل</Text>
          </TouchableOpacity>
        )}
        {canDelete && (
          <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
            <Text style={styles.deleteBtnText}>🗑️ حذف</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

function DuplicateWarnings({ family, families, allMembers }) {
  const famMap = {}
  families.forEach(f => { famMap[f.id] = f })
  const issues = []

  const famMems = allMembers.filter(m => m.family_id === family.id)
  const allIssues = checkFamilyIssues(family, famMems)
  if (allIssues.length) {
    issues.push({ color: colors.red, icon: '⚠️', title: `${allIssues.length} نقص في بيانات الأسرة`, detail: allIssues })
  }

  if (family.head_id) {
    const names = []
    families.forEach(f => { if (f.id !== family.id && f.head_id === family.head_id) names.push(`رب الأسرة ${f.head_name}`) })
    allMembers.forEach(m => {
      if (m.family_id === family.id) return
      if (m.national_id === family.head_id) {
        const parentFam = famMap[m.family_id]
        names.push(`الفرد ${m.name} من أسرة ${parentFam ? parentFam.head_name : '؟'}`)
      }
    })
    if (names.length) issues.push({ color: colors.purple, icon: '🔁', title: 'هوية رب الأسرة مكررة مع', detail: names })
  }

  const myMembers = allMembers.filter(m => m.family_id === family.id && m.national_id)
  myMembers.forEach(m => {
    const names = []
    families.forEach(f => { if (f.id !== family.id && f.head_id === m.national_id) names.push(`رب الأسرة ${f.head_name}`) })
    allMembers.forEach(x => {
      if (x.family_id === family.id) return
      if (x.national_id === m.national_id) {
        const parentFam = famMap[x.family_id]
        names.push(`الفرد ${x.name} من أسرة ${parentFam ? parentFam.head_name : '؟'}`)
      }
    })
    if (names.length) issues.push({ color: colors.purple, icon: '🔁', title: `هوية الفرد "${m.name}" مكررة مع`, detail: names })
  })

  if (family.phone1) {
    const clean = p => (p || '').replace(/[\s-]/g, '')
    const myPhone = clean(family.phone1)
    const dupFams = families.filter(f => f.id !== family.id && clean(f.phone1) === myPhone)
    if (dupFams.length) {
      issues.push({ color: colors.blue, icon: '📞', title: `الجوال ${family.phone1} مكرر مع`, detail: dupFams.map(f => `رب الأسرة ${f.head_name}`) })
    }
  }

  if (!issues.length) return null

  return (
    <View style={{ gap: 8 }}>
      {issues.map((issue, i) => (
        <View key={i} style={[styles.warnBox, { backgroundColor: issue.color + '1A', borderColor: issue.color + '4D' }]}>
          <Text style={[styles.warnTitle, { color: issue.color }]}>{issue.icon} {issue.title}</Text>
          {(Array.isArray(issue.detail) ? issue.detail : [issue.detail]).map((line, j) => (
            <Text key={j} style={[styles.warnLine, { color: issue.color }]}>← {line}</Text>
          ))}
        </View>
      ))}
    </View>
  )
}

function FamilyMembersView({ members, family }) {
  const HEALTH_ICONS = { مريض: '🤒', معاق: '♿', مزمن: '💊', مصاب: '🩹' }
  const REL_ORDER = { 'زوجة': 0, 'زوج': 0 }
  const sorted = [...members].sort((a, b) => {
    const ra = REL_ORDER[a.relation?.trim()] ?? 1
    const rb = REL_ORDER[b.relation?.trim()] ?? 1
    if (ra !== rb) return ra - rb
    const da = a.dob ? new Date(a.dob).getTime() : Infinity
    const db = b.dob ? new Date(b.dob).getTime() : Infinity
    return da - db
  })

  if (!members.length) {
    return <Text style={styles.noMembers}>لا يوجد أفراد مسجلون</Text>
  }

  return (
    <View>
      <Text style={styles.membersTitle}>👨‍👩‍👧‍👦 أفراد الأسرة ({members.length + 1} فرد)</Text>
      <View style={{ gap: 6 }}>
        <View style={styles.headRow}>
          <Text style={{ fontSize: 20 }}>👑</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.memberName}>{family.head_name}</Text>
            <Text style={styles.memberMeta}>
              رب الأسرة{family.head_id ? ` · ${family.head_id}` : ''}{family.head_dob ? ` · ${calcAge(family.head_dob)} سنة` : ''}
            </Text>
          </View>
          <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700' }}>
            {family.head_gender === 'ذكر' ? '👨' : family.head_gender === 'أنثى' ? '👩' : ''}
          </Text>
        </View>
        {sorted.map(m => {
          const age = calcAge(m.dob)
          const icon = getMemberIcon(m.relation, m.gender)
          return (
            <View key={m.id} style={styles.memberRow}>
              <Text style={{ fontSize: 20 }}>{icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{m.name}</Text>
                <Text style={styles.memberMeta}>
                  {m.relation || '—'}{m.national_id ? ` · ${m.national_id}` : ''}
                  {age !== null ? ` · ${age} سنة` : m.dob ? ` · ${formatDate(m.dob)}` : ''}
                </Text>
              </View>
              {m.health && m.health !== 'سليم' && (
                <Text style={{ color: colors.red, fontSize: 10 }}>{HEALTH_ICONS[m.health] || '⚠️'} {m.health}</Text>
              )}
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16 },
  iconBtn: {
    width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  addBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8, justifyContent: 'center' },
  addBtnText: { color: colors.bg, fontWeight: '900', fontSize: 13 },
  searchInput: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 16, paddingVertical: 10, color: colors.white, fontSize: 13, marginBottom: 10, textAlign: 'right',
  },
  filterToggle: { paddingVertical: 8 },
  filterToggleText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  filtersBox: { paddingBottom: 8 },
  chipsLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', marginBottom: 6 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.white, fontSize: 11, fontWeight: '600' },
  chipTextActive: { color: colors.bg, fontWeight: '800' },
  ageRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  ageLabel: { color: colors.muted, fontSize: 11 },
  ageInput: {
    width: 50, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingVertical: 6, color: colors.white, fontSize: 12, textAlign: 'center',
  },
  resetBtn: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 6 },
  resetBtnText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  loadingWrap: { paddingVertical: 60, alignItems: 'center' },
  listContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 6 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRightWidth: 3, borderRadius: radius.md, padding: 10,
  },
  rowIndex: { color: colors.muted, fontSize: 10, width: 16 },
  rowMain: { flex: 1, gap: 2 },
  rowName: { color: colors.white, fontWeight: '700', fontSize: 13 },
  rowId: { color: colors.muted, fontSize: 10 },
  badgeRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginTop: 2 },
  badge: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 9, fontWeight: '700' },
  rowMeta: { color: colors.muted, fontSize: 10, marginTop: 2 },
  rowCountWrap: { alignItems: 'center', justifyContent: 'center', minWidth: 28 },
  rowCount: { color: colors.accent, fontWeight: '900', fontSize: 14 },
  detailsCard: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.accent + '33' },
  detailsCardTitle: { color: colors.accent, fontSize: 12, fontWeight: '700', marginBottom: 10 },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailsItem: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 8, minWidth: '46%', flexGrow: 1 },
  detailsKey: { color: colors.muted, fontSize: 9, marginBottom: 2 },
  detailsValue: { color: colors.white, fontWeight: '700', fontSize: 12 },
  notesBox: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: 10 },
  notesLabel: { color: colors.muted, fontSize: 10, marginBottom: 4 },
  notesText: { color: colors.white, fontSize: 12 },
  editBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  editBtnText: { color: colors.bg, fontWeight: '900', fontSize: 13 },
  deleteBtn: { flex: 1, backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  deleteBtnText: { color: colors.red, fontWeight: '700', fontSize: 13 },
  warnBox: { borderWidth: 1, borderRadius: radius.md, padding: 10 },
  warnTitle: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  warnLine: { fontSize: 11, opacity: 0.9, paddingVertical: 1 },
  noMembers: { color: colors.muted, fontSize: 12, textAlign: 'center', paddingVertical: 12 },
  membersTitle: { color: colors.accent, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.accent + '1A', borderWidth: 1, borderColor: colors.accent + '33' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.surface2 },
  memberName: { color: colors.white, fontSize: 12, fontWeight: '700' },
  memberMeta: { color: colors.muted, fontSize: 10 },
})
