import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import {
  fetchCamps,
  fetchFamilyById,
  fetchFamilyMembers,
  createFamily,
  updateFamily,
  saveFamilyMembers,
  supabase,
} from '../../lib/supabase';
import { luhnCheck, validateName, validateDob } from '../../lib/helpers';
import {
  RELATION_BY_GENDER,
  ALL_RELATIONS,
  HEALTH_OPTIONS,
  MARITAL_BY_GENDER,
  FAMILY_CATEGORIES,
  REGIONS,
  INCOME_SOURCE_OPTIONS,
  HOUSING_TYPE_OPTIONS,
  HOUSING_CONDITION_OPTIONS,
  DISPLACEMENT_STATUS_OPTIONS,
} from '../../lib/formOptions';
import { showError, showSuccess } from '../../utils/toast';
import { emptyHealthFields, healthSummaryCount } from '../../lib/healthOptions';
import HealthStatusModal from '../../components/ui/HealthStatusModal';
import FormSection from '../../components/ui/FormSection';
import FormInput from '../../components/ui/FormInput';
import SelectField from '../../components/ui/SelectField';
import colors from '../../theme/colors';

const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

let localIdSeq = 0;
const genLocalId = () => `local_${Date.now()}_${localIdSeq++}`;

function splitDob(dob) {
  if (!dob) return { day: null, month: null, year: null };
  const d = new Date(dob);
  if (isNaN(d)) return { day: null, month: null, year: null };
  return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
}

function joinDob(day, month, year) {
  if (!day || !month || !year) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const emptyMember = () => ({
  localId: genLocalId(),
  name: '',
  gender: '',
  relation: '',
  national_id: '',
  day: null,
  month: null,
  year: null,
  health: 'سليم',
  ...emptyHealthFields(),
});

export default function FamilyFormScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const familyId = route.params?.familyId || null;
  const { orgId, user } = useAuth();

  const [camps, setCamps] = useState([]);
  const [existingFamily, setExistingFamily] = useState(null);
  const [loading, setLoading] = useState(!!familyId);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const [headName, setHeadName] = useState('');
  const [headId, setHeadId] = useState('');
  const [idDupWarning, setIdDupWarning] = useState('');
  const [phone1, setPhone1] = useState('');
  const [phone2, setPhone2] = useState('');
  const [headGender, setHeadGender] = useState('');
  const [headMarital, setHeadMarital] = useState('');
  const [dobDay, setDobDay] = useState(null);
  const [dobMonth, setDobMonth] = useState(null);
  const [dobYear, setDobYear] = useState(null);

  const [campId, setCampId] = useState(null);
  const [tent, setTent] = useState('');
  const [originalAddress, setOriginalAddress] = useState('');
  const [addressDetails, setAddressDetails] = useState('');
  const [currentAddress, setCurrentAddress] = useState('');
  const [governorateCurrent, setGovernorateCurrent] = useState('');
  const [displacementStatus, setDisplacementStatus] = useState('');
  const [incomeSource, setIncomeSource] = useState('');
  const [housingType, setHousingType] = useState('');
  const [housingCondition, setHousingCondition] = useState('');

  const [categories, setCategories] = useState([]);
  const [notes, setNotes] = useState('');
  const [members, setMembers] = useState([]);
  const [headHealth, setHeadHealth] = useState(emptyHealthFields());
  const [healthModalFor, setHealthModalFor] = useState(null); // null | 'head' | localId

  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const arr = [];
    for (let y = currentYear; y >= 1900; y--) arr.push(String(y));
    return arr;
  }, [currentYear]);
  const days = useMemo(() => Array.from({ length: 31 }, (_, i) => String(i + 1)), []);

  useEffect(() => {
    if (orgId) fetchCamps(orgId).then(setCamps);
  }, [orgId]);

  // فحص تكرار رقم الهوية أثناء الكتابة (مع تأخير بسيط بعد التوقف) -- يشمل
  // رؤساء الأسر الأخرى وأفراد أي أسرة ثانية كمان (مو رؤساء الأسر بس زي
  // فحص لحظة الحفظ القديم)، وتحذير ثابت واضح بدل توست عابر يختفي بسرعة.
  useEffect(() => {
    const id = headId.trim();
    if (!orgId || id.length < 9) {
      setIdDupWarning('');
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const [{ data: famRows }, { data: memRows }] = await Promise.all([
          supabase
            .from('families')
            .select('id, head_name')
            .eq('org_id', orgId)
            .eq('head_id', id)
            .neq('id', familyId || '00000000-0000-0000-0000-000000000000')
            .limit(1),
          supabase
            .from('family_members')
            .select('id, name, family_id, families!inner(head_name, org_id)')
            .eq('families.org_id', orgId)
            .eq('national_id', id)
            .neq('family_id', familyId || '00000000-0000-0000-0000-000000000000')
            .limit(1),
        ]);
        if (famRows?.length > 0) {
          setIdDupWarning(`⚠️ نفس رقم الهوية مسجَّل لرب أسرة "${famRows[0].head_name}"`);
        } else if (memRows?.length > 0) {
          setIdDupWarning(`⚠️ نفس رقم الهوية مسجَّل لفرد اسمه "${memRows[0].name}" بأسرة "${memRows[0].families?.head_name}"`);
        } else {
          setIdDupWarning('');
        }
      } catch {
        // فحص التكرار غير حرج -- تجاهل أي عطل فيه بصمت
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [headId, orgId, familyId]);

  useEffect(() => {
    if (!familyId) return;
    (async () => {
      try {
        const data = await fetchFamilyById(familyId);
        setExistingFamily(data);
        setHeadName(data.head_name || '');
        setHeadId(data.head_id || '');
        setPhone1(data.phone1 || '');
        setPhone2(data.phone2 || '');
        setHeadGender(data.head_gender || '');
        setHeadMarital(data.head_marital || '');
        const d = splitDob(data.head_dob);
        setDobDay(d.day);
        setDobMonth(d.month);
        setDobYear(d.year);
        setCampId(data.camp_id || null);
        setTent(data.tent || '');
        setOriginalAddress(data.original_address || '');
        setAddressDetails(data.address_details || '');
        setCurrentAddress(data.address || '');
        setGovernorateCurrent(data.governorate_current || '');
        setDisplacementStatus(data.displacement_status || '');
        setIncomeSource(data.income_source || '');
        setHousingType(data.housing_type || '');
        setHousingCondition(data.housing_condition || '');
        setNotes(data.notes || '');
        setHeadHealth({
          orphan_status: data.head_orphan_status || null,
          orphan_cause: data.head_orphan_cause || null,
          disabilities: data.head_disabilities || [],
          injuries: data.head_injuries || [],
          chronic_diseases: data.head_chronic_diseases || [],
          female_status: data.head_female_status || [],
          needs: data.head_needs || [],
        });
        try {
          const cats = typeof data.category_tags === 'string' ? JSON.parse(data.category_tags) : data.category_tags;
          setCategories(Array.isArray(cats) ? cats : []);
        } catch {
          setCategories([]);
        }

        const mems = await fetchFamilyMembers([familyId]);
        // ترتيب حسب تاريخ الميلاد (الأكبر سناً أولاً) -- الأفراد بلا تاريخ
        // ميلاد مسجَّل ينزلوا لآخر القائمة بدل ما يتصدروها عشوائياً.
        const sortedMems = [...mems].sort((a, b) => {
          if (!a.dob && !b.dob) return 0;
          if (!a.dob) return 1;
          if (!b.dob) return -1;
          return new Date(a.dob) - new Date(b.dob);
        });
        setMembers(
          sortedMems.map((m) => {
            const d2 = splitDob(m.dob);
            return {
              localId: m.id,
              name: m.name || '',
              gender: m.gender || '',
              relation: m.relation || '',
              national_id: m.national_id || '',
              day: d2.day,
              month: d2.month,
              year: d2.year,
              health: m.health || 'سليم',
              orphan_status: m.orphan_status || null,
              orphan_cause: m.orphan_cause || null,
              disabilities: m.disabilities || [],
              injuries: m.injuries || [],
              chronic_diseases: m.chronic_diseases || [],
              female_status: m.female_status || [],
              needs: m.needs || [],
            };
          })
        );
      } catch (e) {
        showError('تعذّر تحميل بيانات الأسرة');
      } finally {
        setLoading(false);
      }
    })();
  }, [familyId]);

  const maritalOptions = headGender
    ? MARITAL_BY_GENDER[headGender]
    : [...MARITAL_BY_GENDER['ذكر'], ...MARITAL_BY_GENDER['أنثى']];

  const toggleCategory = (key) =>
    setCategories((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));

  const addMember = () => setMembers((prev) => [...prev, emptyMember()]);
  const removeMember = (localId) => setMembers((prev) => prev.filter((m) => m.localId !== localId));
  const updateMember = (localId, field, value) =>
    setMembers((prev) =>
      prev.map((m) => {
        if (m.localId !== localId) return m;
        const next = { ...m, [field]: value };
        if (field === 'gender') next.relation = '';
        return next;
      })
    );

  const validate = () => {
    const e = {};
    if (!headName.trim()) e.headName = 'الاسم مطلوب';
    else {
      const err = validateName(headName);
      if (err) e.headName = err;
    }

    if (!headId.trim()) e.headId = 'رقم الهوية مطلوب';
    else if (headId.trim().length < 9) e.headId = 'رقم الهوية أقل من 9 أرقام';
    else if (!luhnCheck(headId.trim())) e.headId = 'رقم الهوية غير صحيح';

    const dobErr = validateDob(joinDob(dobDay, dobMonth, dobYear));
    if (dobErr) e.dob = dobErr;

    if (!campId) e.campId = 'اختر المخيم';

    members.forEach((m, i) => {
      if (!m.name.trim()) e[`member_${i}`] = 'اسم الفرد مطلوب';
    });

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    // فحص أخير قبل الحفظ (يحمي من حالات السباق لو الفحص الفوري ما وصل
    // وقته) -- يشمل رؤساء الأسر والأفراد، وحاجز فعلي يوقف الحفظ لحد ما
    // المستخدم يأكّد صراحة إنه قاصد يكمل رغم التكرار.
    if (!familyId || headId.trim() !== existingFamily?.head_id) {
      const id = headId.trim();
      const [{ data: dupRows }, { data: memRows }] = await Promise.all([
        supabase
          .from('families')
          .select('id, head_name')
          .eq('org_id', orgId)
          .eq('head_id', id)
          .neq('id', familyId || '00000000-0000-0000-0000-000000000000'),
        supabase
          .from('family_members')
          .select('id, name, families!inner(head_name, org_id)')
          .eq('families.org_id', orgId)
          .eq('national_id', id)
          .neq('family_id', familyId || '00000000-0000-0000-0000-000000000000')
          .limit(1),
      ]);
      const conflictText =
        dupRows?.length > 0
          ? `رقم الهوية مستخدم بالفعل لرب أسرة "${dupRows[0].head_name}"`
          : memRows?.length > 0
          ? `رقم الهوية مستخدم بالفعل لفرد اسمه "${memRows[0].name}" بأسرة "${memRows[0].families?.head_name}"`
          : '';
      if (conflictText) {
        const proceed = await new Promise((resolve) => {
          Alert.alert(
            '⚠️ رقم هوية مكرر',
            `${conflictText}\n\nمتأكد تبي تكمل الحفظ رغم التكرار؟`,
            [
              { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
              { text: 'متابعة الحفظ', style: 'destructive', onPress: () => resolve(true) },
            ]
          );
        });
        if (!proceed) return;
      }
    }

    setSaving(true);
    try {
      const dobStr = joinDob(dobDay, dobMonth, dobYear);

      const payload = {
        org_id: orgId,
        camp_id: campId,
        head_name: headName.trim(),
        head_id: headId.trim(),
        phone1: phone1.trim() || null,
        phone2: phone2.trim() || null,
        head_gender: headGender || null,
        head_marital: headMarital || null,
        head_dob: dobStr,
        tent: tent.trim() || null,
        original_address: originalAddress || null,
        address_details: addressDetails.trim() || null,
        address: currentAddress.trim() || null,
        governorate_current: governorateCurrent || null,
        displacement_status: displacementStatus || null,
        income_source: incomeSource || null,
        housing_type: housingType || null,
        housing_condition: housingCondition || null,
        category_tags: JSON.stringify(categories),
        notes: notes.trim() || null,
        head_orphan_status: headHealth.orphan_status || null,
        head_orphan_cause: headHealth.orphan_cause || null,
        head_disabilities: headHealth.disabilities || [],
        head_injuries: headHealth.injuries || [],
        head_chronic_diseases: headHealth.chronic_diseases || [],
        head_female_status: headHealth.female_status || [],
        head_needs: headHealth.needs || [],
        _deleted: false,
      };

      let result;
      let finalId = familyId;
      if (familyId) {
        result = await updateFamily(familyId, payload);
      } else {
        result = await createFamily({
          ...payload,
          review_status: 'approved',
          pending_delete: false,
          created_by: user?.id || null,
        });
        if (result.success) finalId = result.data.id;
      }

      if (!result.success) {
        showError(result.error || 'فشل حفظ الأسرة');
        return;
      }

      try {
        await saveFamilyMembers(
          finalId,
          members.map((m) => ({
            name: m.name.trim(),
            relation: m.relation || null,
            national_id: m.national_id?.trim() || null,
            dob: joinDob(m.day, m.month, m.year),
            gender: m.gender || null,
            health: m.health || null,
            orphan_status: m.orphan_status || null,
            orphan_cause: m.orphan_cause || null,
            disabilities: m.disabilities || [],
            injuries: m.injuries || [],
            chronic_diseases: m.chronic_diseases || [],
            female_status: m.female_status || [],
            needs: m.needs || [],
          }))
        );
      } catch (memErr) {
        showError('تم حفظ الأسرة، لكن حدث خطأ بحفظ الأفراد: ' + memErr.message);
      }

      if (!familyId) {
        try {
          await supabase.from('family_movements').insert([
            {
              family_id: finalId,
              org_id: orgId,
              type: 'entry',
              to_camp: campId,
              date: new Date().toISOString().slice(0, 10),
              created_by: user?.id || null,
            },
          ]);
        } catch {
          // حركة الدخول التلقائية غير حرجة — تجاهل الفشل بصمت
        }
      }

      showSuccess(familyId ? 'تم تحديث بيانات الأسرة' : 'تم إضافة الأسرة بنجاح');
      navigation.goBack();
    } catch (e) {
      showError('حدث خطأ غير متوقع: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <FormSection title="👤 بيانات رب الأسرة">
          <FormInput
            label="اسم رب الأسرة *"
            placeholder="محمد أحمد علي محمد"
            value={headName}
            onChangeText={setHeadName}
            error={errors.headName}
          />
          <FormInput
            label="رقم الهوية *"
            placeholder="1xxxxxxxxx"
            value={headId}
            onChangeText={setHeadId}
            keyboardType="number-pad"
            maxLength={10}
            error={errors.headId}
          />
          {!!idDupWarning && !errors.headId && (
            <View style={styles.dupWarnBox}>
              <Text style={styles.dupWarnText}>{idDupWarning}</Text>
            </View>
          )}
          <View style={styles.row}>
            <FormInput
              label="رقم الجوال"
              placeholder="05xxxxxxxx"
              value={phone1}
              onChangeText={setPhone1}
              keyboardType="phone-pad"
              style={styles.halfInput}
            />
            <FormInput
              label="رقم بديل"
              placeholder="05xxxxxxxx"
              value={phone2}
              onChangeText={setPhone2}
              keyboardType="phone-pad"
              style={styles.halfInput}
            />
          </View>

          <Text style={styles.fieldLabel}>الجنس</Text>
          <View style={styles.segmentRow}>
            {['ذكر', 'أنثى'].map((g) => (
              <Pressable
                key={g}
                style={[styles.segmentBtn, headGender === g && styles.segmentBtnActive]}
                onPress={() => {
                  setHeadGender(g);
                  setHeadMarital('');
                  if (g !== 'أنثى') setCategories((prev) => prev.filter((c) => c !== 'martyr' && c !== 'captive'));
                }}
              >
                <Text style={[styles.segmentText, headGender === g && styles.segmentTextActive]}>{g}</Text>
              </Pressable>
            ))}
          </View>

          <SelectField
            label="الحالة الاجتماعية"
            value={headMarital}
            options={maritalOptions}
            onSelect={setHeadMarital}
            placeholder="اختر الحالة الاجتماعية"
          />

          <Text style={styles.fieldLabel}>تاريخ الميلاد</Text>
          <View style={styles.row}>
            <View style={styles.thirdInput}>
              <SelectField value={dobDay ? String(dobDay) : null} options={days} onSelect={(v) => setDobDay(Number(v))} placeholder="اليوم" />
            </View>
            <View style={styles.thirdInput}>
              <SelectField value={dobMonth ? MONTHS[dobMonth - 1] : null} options={MONTHS} onSelect={(v) => setDobMonth(MONTHS.indexOf(v) + 1)} placeholder="الشهر" />
            </View>
            <View style={styles.thirdInput}>
              <SelectField value={dobYear ? String(dobYear) : null} options={years} onSelect={(v) => setDobYear(Number(v))} placeholder="السنة" />
            </View>
          </View>
          {!!errors.dob && <Text style={styles.errorText}>{errors.dob}</Text>}

          <Pressable style={styles.healthBtn} onPress={() => setHealthModalFor('head')}>
            <Text style={styles.healthBtnText}>
              🩺 حالات صحية تفصيلية{healthSummaryCount(headHealth) > 0 ? ` (${healthSummaryCount(headHealth)})` : ''}
            </Text>
          </Pressable>
        </FormSection>

        <FormSection title="🏕️ بيانات السكن">
          {familyId ? (
            <View style={styles.campLockedBox}>
              <View>
                <Text style={styles.campLockedLabel}>المخيم</Text>
                <Text style={styles.campLockedValue}>{camps.find((c) => c.id === campId)?.name || '—'}</Text>
              </View>
              <Text style={styles.campLockedHint}>🔒 لتغيير مخيم الأسرة استخدم "نقل" بصفحة حركات الأسر</Text>
            </View>
          ) : (
            <SelectField
              value={camps.find((c) => c.id === campId)?.name}
              options={camps.map((c) => ({ value: c.id, label: c.name }))}
              onSelect={setCampId}
              placeholder="اختر المخيم *"
              error={errors.campId}
            />
          )}
          <FormInput label="رقم الخيمة" value={tent} onChangeText={setTent} />
          <SelectField
            label="المنطقة الأصلية"
            value={originalAddress}
            options={REGIONS}
            onSelect={setOriginalAddress}
            placeholder="اختر المنطقة"
          />
          <FormInput label="تفاصيل العنوان" value={addressDetails} onChangeText={setAddressDetails} />

          <SelectField
            label="حالة النزوح"
            value={displacementStatus}
            options={DISPLACEMENT_STATUS_OPTIONS}
            onSelect={setDisplacementStatus}
            placeholder="نازح / مقيم"
          />
          <FormInput label="السكن الحالي (وصف)" value={currentAddress} onChangeText={setCurrentAddress} />
          <SelectField
            label="محافظة السكن الحالي"
            value={governorateCurrent}
            options={REGIONS}
            onSelect={setGovernorateCurrent}
            placeholder="اختر المحافظة"
          />
          <SelectField
            label="نوع المسكن"
            value={housingType}
            options={HOUSING_TYPE_OPTIONS}
            onSelect={setHousingType}
            placeholder="اختر نوع المسكن"
          />
          <SelectField
            label="حالة المسكن"
            value={housingCondition}
            options={HOUSING_CONDITION_OPTIONS}
            onSelect={setHousingCondition}
            placeholder="اختر حالة المسكن"
          />
          <SelectField
            label="مصدر دخل رب الأسرة"
            value={incomeSource}
            options={INCOME_SOURCE_OPTIONS}
            onSelect={setIncomeSource}
            placeholder="اختر مصدر الدخل"
          />
        </FormSection>

        <FormSection title={`👨‍👩‍👧 أفراد الأسرة (${members.length})`}>
          {members.length === 0 && <Text style={styles.emptyMembers}>لا يوجد أفراد مضافون بعد</Text>}

          {members.map((m, i) => {
            const relations = m.gender ? RELATION_BY_GENDER[m.gender] : ALL_RELATIONS;
            return (
              <View key={m.localId} style={styles.memberCard}>
                <View style={styles.memberHeader}>
                  <Text style={styles.memberTitle}>فرد {i + 1}</Text>
                  <Pressable onPress={() => removeMember(m.localId)}>
                    <Text style={styles.removeIcon}>🗑️</Text>
                  </Pressable>
                </View>

                <FormInput
                  label="الاسم *"
                  placeholder="الاسم الرباعي"
                  value={m.name}
                  onChangeText={(v) => updateMember(m.localId, 'name', v)}
                  error={errors[`member_${i}`]}
                />

                <View style={styles.row}>
                  <View style={styles.halfInput}>
                    <SelectField value={m.gender} options={['ذكر', 'أنثى']} onSelect={(v) => updateMember(m.localId, 'gender', v)} placeholder="الجنس" />
                  </View>
                  <View style={styles.halfInput}>
                    <SelectField value={m.relation} options={relations} onSelect={(v) => updateMember(m.localId, 'relation', v)} placeholder="صلة القرابة" />
                  </View>
                </View>

                <FormInput
                  label="رقم الهوية (اختياري)"
                  placeholder="9 أرقام"
                  value={m.national_id}
                  onChangeText={(v) => updateMember(m.localId, 'national_id', v)}
                  keyboardType="number-pad"
                  maxLength={9}
                />
                {m.national_id?.length >= 9 && (
                  <Text style={[styles.hint, { color: luhnCheck(m.national_id) ? colors.green : colors.red }]}>
                    {luhnCheck(m.national_id) ? '✅ هوية صحيحة' : '❌ هوية غير صحيحة'}
                  </Text>
                )}

                <Text style={styles.fieldLabel}>تاريخ الميلاد</Text>
                <View style={styles.row}>
                  <View style={styles.thirdInput}>
                    <SelectField value={m.day ? String(m.day) : null} options={days} onSelect={(v) => updateMember(m.localId, 'day', Number(v))} placeholder="اليوم" />
                  </View>
                  <View style={styles.thirdInput}>
                    <SelectField value={m.month ? MONTHS[m.month - 1] : null} options={MONTHS} onSelect={(v) => updateMember(m.localId, 'month', MONTHS.indexOf(v) + 1)} placeholder="الشهر" />
                  </View>
                  <View style={styles.thirdInput}>
                    <SelectField value={m.year ? String(m.year) : null} options={years} onSelect={(v) => updateMember(m.localId, 'year', Number(v))} placeholder="السنة" />
                  </View>
                </View>

                <SelectField
                  label="الحالة الصحية"
                  value={HEALTH_OPTIONS.find((h) => h.v === m.health)?.label}
                  options={HEALTH_OPTIONS.map((h) => ({ value: h.v, label: h.label }))}
                  onSelect={(v) => updateMember(m.localId, 'health', v)}
                />

                <Pressable style={styles.healthBtn} onPress={() => setHealthModalFor(m.localId)}>
                  <Text style={styles.healthBtnText}>
                    🩺 حالات صحية تفصيلية{healthSummaryCount(m) > 0 ? ` (${healthSummaryCount(m)})` : ''}
                  </Text>
                </Pressable>
              </View>
            );
          })}

          <Pressable style={styles.addMemberBtn} onPress={addMember}>
            <Text style={styles.addMemberText}>➕ إضافة فرد</Text>
          </Pressable>
        </FormSection>

        <FormSection title="🏷️ الفئات الاجتماعية">
          <Text style={styles.fieldLabel}>فئة الأسرة</Text>
          {FAMILY_CATEGORIES.filter((cat) => !cat.femaleOnly || headGender === 'أنثى').map((cat) => (
            <Pressable key={cat.key} style={styles.checkboxRow} onPress={() => toggleCategory(cat.key)}>
              <Text style={styles.checkbox}>{categories.includes(cat.key) ? '☑️' : '⬜'}</Text>
              <Text style={styles.checkboxLabel}>{cat.label}</Text>
            </Pressable>
          ))}
        </FormSection>

        <FormSection title="📝 ملاحظات">
          <FormInput value={notes} onChangeText={setNotes} multiline numberOfLines={3} style={{ textAlignVertical: 'top' }} />
        </FormSection>

        <Pressable style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.saveBtnText}>{familyId ? '✅ حفظ التعديلات' : '✅ إضافة الأسرة'}</Text>
          )}
        </Pressable>
      </ScrollView>

      <HealthStatusModal
        visible={healthModalFor === 'head'}
        onClose={() => setHealthModalFor(null)}
        subjectName={headName || 'رب الأسرة'}
        gender={headGender}
        dob={joinDob(dobDay, dobMonth, dobYear)}
        initial={headHealth}
        onSave={setHeadHealth}
      />

      {members.map((m) =>
        healthModalFor === m.localId ? (
          <HealthStatusModal
            key={m.localId}
            visible
            onClose={() => setHealthModalFor(null)}
            subjectName={m.name || 'فرد'}
            gender={m.gender}
            dob={joinDob(m.day, m.month, m.year)}
            initial={m}
            onSave={(fields) => setMembers((prev) => prev.map((mm) => (mm.localId === m.localId ? { ...mm, ...fields } : mm)))}
          />
        ) : null
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  dupWarnBox: {
    backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: 10, padding: 10, marginTop: -6, marginBottom: 12,
  },
  dupWarnText: { color: colors.red, fontSize: 11, textAlign: 'right', lineHeight: 16, fontWeight: 'bold' },
  campLockedBox: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 12 },
  campLockedLabel: { color: colors.muted, fontSize: 11, textAlign: 'right' },
  campLockedValue: { color: colors.white, fontWeight: 'bold', fontSize: 14, marginTop: 2, textAlign: 'right' },
  campLockedHint: { color: colors.accent, fontSize: 10, marginTop: 8, textAlign: 'right' },
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', gap: 10 },
  halfInput: { flex: 1 },
  thirdInput: { flex: 1 },
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: 'bold', marginBottom: 6, marginTop: 4, textAlign: 'right' },
  errorText: { color: colors.red, fontSize: 11, textAlign: 'right' },
  hint: { fontSize: 11, marginBottom: 8, textAlign: 'right' },

  segmentRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  segmentBtn: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segmentBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  segmentText: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
  segmentTextActive: { color: '#000' },

  memberCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
  },
  memberHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  memberTitle: { color: colors.accent, fontWeight: 'bold', fontSize: 12 },
  removeIcon: { fontSize: 16 },
  emptyMembers: { color: colors.muted, fontSize: 12, textAlign: 'center', paddingVertical: 12 },
  addMemberBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addMemberText: { color: colors.accent, fontWeight: 'bold', fontSize: 13 },

  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  checkbox: { fontSize: 16 },
  checkboxLabel: { color: colors.white, fontSize: 13 },

  saveBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 14 },
  healthBtn: {
    backgroundColor: 'rgba(139,92,246,0.1)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)',
    borderRadius: 12, paddingVertical: 11, alignItems: 'center', marginTop: 4,
  },
  healthBtnText: { color: colors.purple, fontWeight: 'bold', fontSize: 12 },
});
