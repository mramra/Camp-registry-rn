/**
 * FamilyFormScreen.jsx — إضافة/تعديل أسرة
 * منقول من camp-registry-react/src/pages/Families/FamilyForm.jsx (994 سطر، أكبر ملف
 * في المشروع الأصلي)
 *
 * تبسيط متعمد (موثَّق، ليس حذف وظيفة حقيقية):
 *   - الأصل: حفظ SQLite أولاً (offline-first) ثم مزامنة Supabase في الخلفية.
 *     تأكدنا مسبقاً (بداية المشروع) أن db.js الفعلي لا يحتوي أي SQLite —
 *     useLocalDB يتصل بـ Supabase مباشرة. هنا: حفظ مباشر بـ Supabase،
 *     بدون طبقة "محلي أولاً" وهمية.
 *   - navigator.onLine → isOnlineNow()
 *   - crypto.randomUUID() → generateId() من utils.js
 *   - useNavigate/useParams (react-router) → useNavigation/useRoute
 *
 * محفوظ بالكامل (نفس منطق الأعمال):
 *   - فحص التكرار اللحظي (اسم/هوية) أثناء الكتابة
 *   - نظام الموافقة (exempt) لكل من: حفظ الأسرة + حركة الدخول التلقائية
 *   - حركة دخول تلقائية عند إضافة أسرة جديدة لها مخيم (أُضيفت اليوم للأصل)
 *   - سجل نشاط الأسرة (logFamilyActivity) بمقارنة التغييرات الفعلية
 *   - كل التحقق (اسم رباعي، Luhn، تاريخ غير مستقبلي)
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import {
  ORG_ID, diffFamilyFields, isExemptFromApproval, logFamilyActivity,
  parseJsonColumns, recordApprovalRequest, supabase, isOnlineNow,
} from '../lib/db'
import {
  calcAge, luhnCheck, validateName, validateDob, sortMembers,
} from '../lib/helpers'
import { emptyHealthFields } from '../lib/healthOptions'
import { generateId } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useDataScope } from '../lib/useDataScope'
import PageHeader from '../components/ui/PageHeader'
import Card       from '../components/ui/Card'
import Select     from '../components/ui/Select'
import DateInput  from '../components/ui/DateInput'
import SafeScreen   from '../components/ui/SafeScreen'
import MemberRow  from '../components/familyform/MemberRow'
import HealthStatusModal from '../components/familyform/HealthStatusModal'
import { colors, radius } from '../theme'

const FAMILY_CATEGORIES = [
  { key: 'martyr',  label: '🕊️ أسرة شهيد' },
  { key: 'captive', label: '⛓️ أسرة أسير' },
]
const ECONOMIC_LEVELS = [
  { key: 'extreme_poverty', label: '🔴 فقر مدقع' },
  { key: 'poor',            label: '🟠 فقير' },
  { key: 'worker',          label: '🟡 عامل / متوسط' },
  { key: 'employee',        label: '🟢 موظف / متوسط' },
  { key: 'well_off',        label: '🔵 ميسور' },
]
const MARITAL_BY_GENDER = {
  'ذكر':  ['متزوج', 'أعزب', 'مطلق', 'أرمل'],
  'أنثى': ['متزوجة', 'عزباء', 'مطلقة', 'أرملة'],
}
const REGIONS = ['شمال غزة', 'غزة', 'الوسطى', 'جنوب غزة', 'رفح']

const EMPTY_FORM = {
  head_name: '', head_id: '', phone1: '', phone2: '',
  head_gender: '', head_marital: '', head_dob: '',
  camp_id: '', tent: '', tent2: '',
  original_address: '', address_details: '', notes: '',
  categories: [], economic_level: '',
  head_orphan_status: null, head_orphan_cause: null, head_qualification: null,
  head_disabilities: [], head_injuries: [], head_chronic_diseases: [], head_female_status: [],
}

const newMember = () => ({
  id: generateId(),
  name: '', gender: '', relation: '',
  national_id: '', dob: '', health: 'سليم', qualification: null, actual_grade: null,
  ...emptyHealthFields(),
})

export default function FamilyFormScreen() {
  const route = useRoute()
  const navigation = useNavigation()
  const familyId = route.params?.familyId
  const isEdit = !!familyId

  const [form,      setForm]      = useState(EMPTY_FORM)
  const [members,   setMembers]   = useState([])
  const [camps,     setCamps]     = useState([])
  const [errors,    setErrors]    = useState({})
  const [dupAlert,  setDupAlert]  = useState('')
  const [loading,   setLoading]   = useState(isEdit)
  const [saving,    setSaving]    = useState(false)
  const submittingRef = useRef(false)
  const originalDataRef = useRef(null)
  const [healthModalFor, setHealthModalFor] = useState(null) // null | 'head' | memberId

  const { profile, canWrite, canEdit } = useAuth()
  const { showToast } = useApp()
  const { getVisibleCamps } = useDataScope()

  useEffect(() => { loadData() }, [familyId])

  async function loadData() {
    try {
      const { data: campsData } = await supabase.from('camps').select('*').eq('org_id', ORG_ID)
      setCamps(campsData || [])

      if (isEdit) {
        const [{ data: fam }, { data: mems }] = await Promise.all([
          supabase.from('families').select('*').eq('id', familyId).single(),
          supabase.from('family_members').select('*').eq('family_id', familyId),
        ])
        if (fam) {
          const parsed = parseJsonColumns('families', fam)
          setForm({
            ...EMPTY_FORM, ...parsed,
            categories: parsed.category_tags || fam.categories || [],
            economic_level: fam.economic_level || '',
            head_disabilities:     parsed.head_disabilities     || [],
            head_injuries:         parsed.head_injuries         || [],
            head_chronic_diseases: parsed.head_chronic_diseases || [],
            head_female_status:    parsed.head_female_status    || [],
          })
          originalDataRef.current = fam
        }
        setMembers(sortMembers(mems || []))
      }
    } catch (e) {
      showToast('فشل تحميل البيانات: ' + e.message, true)
    } finally {
      setLoading(false)
    }
  }

  const setF = useCallback((field, value) => {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => ({ ...e, [field]: null }))
  }, [])

  const checkDuplicate = useCallback(async (field, value) => {
    if (!value || value.length < 3) { setDupAlert(''); return }
    try {
      const { data } = await supabase.from('families').select('id,head_id,head_name').eq('org_id', ORG_ID)
      const dup = (data || []).find(f => {
        if (isEdit && f.id === familyId) return false
        if (field === 'head_id') return f.head_id === value
        if (field === 'head_name') return (f.head_name || '').trim() === value.trim()
        return false
      })
      setDupAlert(dup ? `⚠️ تكرار: "${field === 'head_id' ? 'رقم الهوية' : 'الاسم'}" موجود مسبقاً` : '')
    } catch { /* فشل الفحص ليس حرجاً — يُتجاهَل بصمت */ }
  }, [familyId, isEdit])

  const updateMember = useCallback((memberId, field, value) => {
    setMembers(m => m.map(x => {
      if (x.id !== memberId) return x
      const updated = { ...x, [field]: value }
      if (field === 'gender') updated.relation = ''
      return updated
    }))
  }, [])
  const updateMemberFields = useCallback((memberId, fields) => {
    setMembers(m => m.map(x => x.id === memberId ? { ...x, ...fields } : x))
  }, [])
  const removeMember = useCallback((memberId) => {
    setMembers(m => m.filter(x => x.id !== memberId))
  }, [])
  const addMember = useCallback(() => {
    setMembers(m => [...m, newMember()])
  }, [])

  function validate() {
    const errs = {}
    if (!form.head_name.trim()) errs.head_name = 'الاسم مطلوب'
    else {
      const e = validateName(form.head_name)
      if (e) errs.head_name = e
    }
    if (!form.head_id.trim()) errs.head_id = 'رقم الهوية مطلوب'
    else if (form.head_id.trim().length < 9) errs.head_id = '❌ رقم الهوية أقل من 9 أرقام'
    else if (!luhnCheck(form.head_id.trim())) errs.head_id = '❌ رقم الهوية غير صحيح'

    const dobErr = validateDob(form.head_dob)
    if (dobErr) errs.head_dob = dobErr
    if (!form.camp_id) errs.camp_id = 'اختر المخيم'

    members.forEach((m, i) => {
      if (!m.name.trim()) errs[`m_name_${i}`] = 'الاسم مطلوب'
      else {
        const e = validateName(m.name)
        if (e) errs[`m_name_${i}`] = e
      }
    })
    return errs
  }

  async function handleSubmit() {
    if (isEdit ? !canEdit : !canWrite) {
      showToast(isEdit ? '⛔ لا تملك صلاحية تعديل الأسر' : '⛔ لا تملك صلاحية إضافة أسر جديدة', true)
      return
    }
    if (submittingRef.current) return
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); showToast('يوجد أخطاء في البيانات', true); return }
    if (!isOnlineNow()) { showToast('⚠️ لا يوجد اتصال بالإنترنت — لا يمكن الحفظ الآن', true); return }

    submittingRef.current = true
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const newFamilyId = isEdit ? familyId : generateId()
      const actorId   = profile?.user_id || profile?.id || null
      const actorName = profile?.full_name || '—'
      const exempt = isExemptFromApproval(profile)

      const familyData = {
        id: newFamilyId, org_id: ORG_ID,
        camp_id: form.camp_id || null,
        head_name: form.head_name || '',
        head_id: form.head_id || null,
        head_gender: form.head_gender || null,
        head_dob: form.head_dob || null,
        head_marital: form.head_marital || null,
        phone1: form.phone1 || null, phone2: form.phone2 || null,
        tent: form.tent || null,
        original_address: form.original_address || null,
        address_details: form.address_details || null,
        notes: form.notes || null,
        category_tags: form.categories || [],
        economic_level: form.economic_level || null,
        head_qualification: form.head_qualification || null,
        head_orphan_status: form.head_orphan_status || null,
        head_orphan_cause: form.head_orphan_status ? (form.head_orphan_cause || null) : null,
        head_disabilities:     JSON.stringify(form.head_disabilities || []),
        head_injuries:         JSON.stringify(form.head_injuries || []),
        head_chronic_diseases: JSON.stringify(form.head_chronic_diseases || []),
        head_female_status:    JSON.stringify(form.head_female_status || []),
        created_at: isEdit ? (form.created_at || now) : now,
        updated_at: now,
        created_by: isEdit ? (form.created_by || null) : actorId,
        updated_by: isEdit ? actorId : null,
        review_status: exempt ? 'approved' : 'pending',
      }

      const memberDocs = members.map(m => ({
        id: m.id || generateId(),
        family_id: newFamilyId,
        name: m.name || '', gender: m.gender || '', relation: m.relation || '',
        national_id: m.national_id || null, dob: m.dob || null,
        health: m.health || 'سليم',
        qualification: m.qualification || null, actual_grade: m.actual_grade || null,
        orphan_status: m.orphan_status || null,
        orphan_cause: m.orphan_status ? (m.orphan_cause || null) : null,
        disabilities: m.disabilities || [], injuries: m.injuries || [],
        chronic_diseases: m.chronic_diseases || [], female_status: m.female_status || [],
        updated_at: now,
      }))

      const { data: savedFamily, error: fErr } = await supabase
        .from('families').upsert(familyData).select().single()

      if (fErr) throw fErr

      // مزامنة الأفراد: حذف المُزالين، ثم upsert الباقي
      const currentIds = new Set(memberDocs.map(m => m.id))
      const { data: existingMems } = await supabase.from('family_members').select('id').eq('family_id', newFamilyId)
      const removedIds = (existingMems || []).filter(m => !currentIds.has(m.id)).map(m => m.id)
      if (removedIds.length) await supabase.from('family_members').delete().in('id', removedIds)
      if (memberDocs.length) await supabase.from('family_members').upsert(memberDocs)

      const fieldChanges = isEdit ? diffFamilyFields(originalDataRef.current, familyData, {
        camp_id: (id) => camps.find(c => c.id === id)?.name || id,
      }) : null
      logFamilyActivity({
        familyId: newFamilyId, familyName: familyData.head_name,
        membersCount: memberDocs.length, action: isEdit ? 'update' : 'insert',
        actorId, actorName, changes: fieldChanges,
      })

      if (!exempt) {
        await recordApprovalRequest({
          familyId: newFamilyId, action: isEdit ? 'update' : 'insert',
          oldData: isEdit ? originalDataRef.current : null, newData: familyData,
          changes: fieldChanges, actorId, actorName, actorRole: profile?.role || null,
        })
      }

      // حركة دخول تلقائية — فقط عند الإضافة (لا التعديل)، ومع مخيم محدد
      if (!isEdit && familyData.camp_id) {
        const movementData = {
          id: generateId(), org_id: ORG_ID, family_id: newFamilyId,
          type: 'entry', from_camp: null, to_camp: familyData.camp_id,
          date: now.split('T')[0], reason: 'تسجيل أسرة جديدة', notes: null,
          created_by: actorId, created_at: now,
        }
        if (exempt) {
          supabase.from('family_movements').insert(movementData)
            .then(({ error }) => { if (error) console.warn('[auto-entry-movement]', error.message) })
        } else {
          await recordApprovalRequest({
            familyId: newFamilyId, action: 'movement_entry',
            oldData: null, newData: movementData, changes: null,
            actorId, actorName, actorRole: profile?.role || null,
          })
        }
      }

      showToast(exempt
        ? (isEdit ? '✅ تم تحديث الأسرة' : '✅ تمت إضافة الأسرة')
        : (isEdit ? '✅ تم حفظ التعديل — بانتظار موافقة ملك المنصة' : '✅ تمت إضافة الأسرة — بانتظار موافقة ملك المنصة')
      )

      navigation.navigate('Families')
    } catch (err) {
      showToast('خطأ: ' + err.message, true)
    } finally {
      setSaving(false)
      submittingRef.current = false
    }
  }

  const nameErr = form.head_name && !errors.head_name ? validateName(form.head_name) : null
  const idOk = form.head_id?.length >= 9 && luhnCheck(form.head_id)
  const idStatus = form.head_id?.length >= 9
    ? (idOk ? '✅ هوية صحيحة' : '❌ هوية غير صحيحة')
    : form.head_id?.length > 0 ? `أدخل ${9 - form.head_id.length} أرقام أخرى` : null

  const visibleCamps = getVisibleCamps(camps)
  const headAge = calcAge(form.head_dob)
  const disallowed = isEdit ? !canEdit : !canWrite

  if (loading) {
    return (
      <SafeScreen><View style={styles.loadingWrap}><ActivityIndicator color={colors.accent} size="large" /></View></SafeScreen>
    )
  }

  return (
    <SafeScreen>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <PageHeader icon={isEdit ? '✏️' : '➕'} title={isEdit ? 'تعديل أسرة' : 'إضافة أسرة جديدة'} back />

      {disallowed && (
        <View style={styles.warnBox}>
          <Text style={styles.warnBoxText}>
            ⛔ لا تملك صلاحية {isEdit ? 'تعديل' : 'إضافة'} الأسر. يمكنك التصفح فقط.
          </Text>
        </View>
      )}
      {!!dupAlert && (
        <View style={styles.warnBox}>
          <Text style={styles.warnBoxText}>{dupAlert}</Text>
        </View>
      )}

      {/* رب الأسرة */}
      <Card title="بيانات رب الأسرة" icon="👤">
        <View style={styles.form}>
          <View>
            <Text style={styles.label}>اسم رب الأسرة *</Text>
            <TextInput
              value={form.head_name}
              onChangeText={v => { setF('head_name', v); checkDuplicate('head_name', v) }}
              placeholder="محمد أحمد علي محمد"
              placeholderTextColor={colors.muted}
              style={[styles.input, errors.head_name && styles.inputError]}
            />
            {errors.head_name && <Text style={styles.errorText}>{errors.head_name}</Text>}
            {!errors.head_name && nameErr && <Text style={styles.warnText}>{nameErr}</Text>}
            {!errors.head_name && !nameErr && form.head_name.trim().split(/\s+/).length >= 4 && (
              <Text style={styles.okText}>✅ اسم رباعي صحيح</Text>
            )}
          </View>

          <View>
            <Text style={styles.label}>رقم الهوية *</Text>
            <TextInput
              value={form.head_id}
              onChangeText={v => { setF('head_id', v); checkDuplicate('head_id', v) }}
              keyboardType="number-pad" placeholder="1xxxxxxxxx" maxLength={10}
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.mono, errors.head_id ? styles.inputError : idOk && styles.inputOk]}
            />
            {errors.head_id && <Text style={styles.errorText}>{errors.head_id}</Text>}
            {!errors.head_id && idStatus && (
              <Text style={idOk ? styles.okText : styles.warnText}>{idStatus}</Text>
            )}
          </View>

          <View style={styles.row2}>
            <View style={styles.col}>
              <Text style={styles.label}>رقم الجوال</Text>
              <TextInput value={form.phone1} onChangeText={v => setF('phone1', v)}
                keyboardType="phone-pad" placeholder="05xxxxxxxx" placeholderTextColor={colors.muted}
                style={[styles.input, styles.mono]} />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>رقم بديل</Text>
              <TextInput value={form.phone2} onChangeText={v => setF('phone2', v)}
                keyboardType="phone-pad" placeholder="05xxxxxxxx" placeholderTextColor={colors.muted}
                style={[styles.input, styles.mono]} />
            </View>
          </View>

          <View style={styles.row2}>
            <View style={styles.col}>
              <Select label="الجنس" value={form.head_gender}
                onChange={v => { setF('head_gender', v); setF('head_marital', '') }}
                placeholder="اختر"
                options={[{ value: 'ذكر', label: 'ذكر' }, { value: 'أنثى', label: 'أنثى' }]} />
            </View>
            <View style={styles.col}>
              <Select label="الحالة الاجتماعية" value={form.head_marital}
                onChange={v => setF('head_marital', v)} placeholder="اختر"
                options={(MARITAL_BY_GENDER[form.head_gender] || [...MARITAL_BY_GENDER['ذكر'], ...MARITAL_BY_GENDER['أنثى']]).map(v => ({ value: v, label: v }))} />
            </View>
          </View>

          <View>
            <Text style={styles.label}>تاريخ الميلاد</Text>
            <DateInput value={form.head_dob || ''} onChange={v => setF('head_dob', v)} />
            {errors.head_dob && <Text style={styles.errorText}>{errors.head_dob}</Text>}
          </View>

          {headAge >= 18 && (
            <Select label="المؤهل العلمي" value={form.head_qualification || ''}
              onChange={v => setF('head_qualification', v || null)} placeholder="غير مُسجَّل"
              options={['دبلوم', 'بكالوريوس', 'ماجستير', 'دكتوراه'].map(q => ({ value: q, label: q }))} />
          )}

          <TouchableOpacity onPress={() => setHealthModalFor('head')} style={styles.healthBtn}>
            <Text style={styles.healthBtnText}>🩺 الحالات الصحية التفصيلية</Text>
            {(() => {
              const n = (form.head_disabilities?.length || 0) + (form.head_injuries?.length || 0)
                + (form.head_chronic_diseases?.length || 0) + (form.head_female_status?.length || 0)
                + (form.head_orphan_status ? 1 : 0)
              return n > 0 ? (
                <View style={styles.healthBadge}><Text style={styles.healthBadgeText}>{n}</Text></View>
              ) : null
            })()}
          </TouchableOpacity>
        </View>
      </Card>

      {/* بيانات السكن */}
      <Card title="بيانات السكن" icon="🏕️">
        <View style={styles.form}>
          <Select label="المخيم *" value={form.camp_id} onChange={v => setF('camp_id', v)}
            placeholder="— اختر المخيم —"
            options={visibleCamps.map(c => ({ value: c.id, label: c.name }))} />
          {errors.camp_id && <Text style={styles.errorText}>{errors.camp_id}</Text>}

          <View style={styles.row2}>
            <View style={styles.col}>
              <Text style={styles.label}>رقم الخيمة</Text>
              <TextInput value={form.tent} onChangeText={v => setF('tent', v)}
                placeholder="A-12" placeholderTextColor={colors.muted} style={styles.input} />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>خيمة ثانية</Text>
              <TextInput value={form.tent2} onChangeText={v => setF('tent2', v)}
                placeholder="اختياري" placeholderTextColor={colors.muted} style={styles.input} />
            </View>
          </View>

          <Select label="العنوان الأصلي" value={form.original_address}
            onChange={v => setF('original_address', v)} placeholder="اختر المنطقة"
            options={REGIONS.map(v => ({ value: v, label: v }))} />

          <View>
            <Text style={styles.label}>تفاصيل العنوان</Text>
            <TextInput value={form.address_details} onChangeText={v => setF('address_details', v)}
              placeholder="حي الشجاعية - شارع صلاح الدين" placeholderTextColor={colors.muted} style={styles.input} />
          </View>
        </View>
      </Card>

      {/* أفراد الأسرة */}
      <Card title={`أفراد الأسرة (${members.length})`} icon="👨‍👩‍👧">
        <View style={styles.form}>
          {members.length === 0 ? (
            <View style={styles.emptyMembers}>
              <Text style={styles.emptyMembersText}>لا يوجد أفراد مضافون بعد</Text>
            </View>
          ) : (
            members.map((m, i) => (
              <MemberRow
                key={m.id} member={m} index={i}
                onUpdate={updateMember} onRemove={removeMember}
                onOpenHealth={setHealthModalFor} errors={errors}
              />
            ))
          )}
          <TouchableOpacity onPress={addMember} style={styles.addMemberBtn}>
            <Text style={styles.addMemberBtnText}>➕ إضافة فرد</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* الفئات الاجتماعية */}
      <Card title="الفئات الاجتماعية" icon="🏷️">
        <View style={styles.form}>
          <View>
            <Text style={styles.label}>فئة الأسرة</Text>
            <View style={styles.chipsRow}>
              {FAMILY_CATEGORIES.map(cat => {
                const active = (form.categories || []).includes(cat.key)
                return (
                  <TouchableOpacity
                    key={cat.key}
                    onPress={() => setF('categories', active
                      ? (form.categories || []).filter(c => c !== cat.key)
                      : [...(form.categories || []), cat.key])}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
          <Select label="المستوى الاقتصادي" value={form.economic_level || ''}
            onChange={v => setF('economic_level', v)} placeholder="— غير محدد —"
            options={ECONOMIC_LEVELS.map(l => ({ value: l.key, label: l.label }))} />
        </View>
      </Card>

      {/* ملاحظات */}
      <Card title="ملاحظات" icon="📝">
        <TextInput
          value={form.notes || ''} onChangeText={v => setF('notes', v)}
          multiline numberOfLines={3} placeholder="أي ملاحظات..."
          placeholderTextColor={colors.muted} style={[styles.input, styles.textarea]}
        />
      </Card>

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={handleSubmit} disabled={saving || disallowed}
          style={[styles.saveBtn, (saving || disallowed) && styles.disabled]}
        >
          <Text style={styles.saveBtnText}>
            {saving ? 'جاري الحفظ...' : isEdit ? '💾 حفظ التعديلات' : '✅ إضافة الأسرة'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>إلغاء</Text>
        </TouchableOpacity>
      </View>

      {/* مودال الحالات الصحية — رب الأسرة */}
      {healthModalFor === 'head' && (
        <HealthStatusModal
          open onClose={() => setHealthModalFor(null)}
          subjectName={form.head_name || 'رب الأسرة'}
          gender={form.head_gender} dob={form.head_dob}
          initial={{
            orphan_status: form.head_orphan_status, orphan_cause: form.head_orphan_cause,
            disabilities: form.head_disabilities, injuries: form.head_injuries,
            chronic_diseases: form.head_chronic_diseases, female_status: form.head_female_status,
          }}
          onSave={(fields) => {
            setF('head_orphan_status', fields.orphan_status)
            setF('head_orphan_cause', fields.orphan_cause)
            setF('head_disabilities', fields.disabilities)
            setF('head_injuries', fields.injuries)
            setF('head_chronic_diseases', fields.chronic_diseases)
            setF('head_female_status', fields.female_status)
          }}
        />
      )}

      {/* مودال الحالات الصحية — فرد محدد */}
      {healthModalFor && healthModalFor !== 'head' && (() => {
        const m = members.find(x => x.id === healthModalFor)
        if (!m) return null
        return (
          <HealthStatusModal
            open onClose={() => setHealthModalFor(null)}
            subjectName={m.name || 'الفرد'} gender={m.gender} dob={m.dob}
            initial={{
              orphan_status: m.orphan_status, orphan_cause: m.orphan_cause,
              disabilities: m.disabilities, injuries: m.injuries,
              chronic_diseases: m.chronic_diseases, female_status: m.female_status,
            }}
            onSave={(fields) => updateMemberFields(m.id, fields)}
          />
        )
      })()}
    </ScrollView>
    </SafeScreen>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  warnBox: { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: radius.md, padding: 12, marginBottom: 12 },
  warnBoxText: { color: colors.red, fontSize: 12, fontWeight: '700' },
  form: { gap: 12 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 10, color: colors.white, fontSize: 13, textAlign: 'right',
  },
  inputError: { borderColor: colors.red },
  inputOk: { borderColor: colors.green },
  mono: { textAlign: 'left' },
  textarea: { textAlignVertical: 'top', minHeight: 70 },
  row2: { flexDirection: 'row', gap: 8 },
  col: { flex: 1 },
  errorText: { color: colors.red, fontSize: 11, marginTop: 4 },
  warnText: { color: colors.accent, fontSize: 11, marginTop: 4 },
  okText: { color: colors.green, fontSize: 11, marginTop: 4 },
  healthBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 11, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
    backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: radius.md,
  },
  healthBtnText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  healthBadge: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  healthBadgeText: { color: colors.bg, fontSize: 10, fontWeight: '900' },
  emptyMembers: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
  emptyMembersText: { color: colors.muted, fontSize: 12 },
  addMemberBtn: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.green, backgroundColor: 'rgba(16,185,129,0.05)', borderRadius: radius.md, paddingVertical: 11, alignItems: 'center' },
  addMemberBtnText: { color: colors.green, fontSize: 13, fontWeight: '700' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  chipActive: { backgroundColor: 'rgba(245,158,11,0.2)', borderColor: colors.accent },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: colors.accent },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 24 },
  saveBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
  saveBtnText: { color: colors.bg, fontWeight: '900', fontSize: 14 },
  cancelBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.6 },
})
