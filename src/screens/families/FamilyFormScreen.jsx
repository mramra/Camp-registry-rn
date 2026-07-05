import React, { useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  HelperText,
  Menu,
  Checkbox,
  SegmentedButtons,
  IconButton,
  Divider,
} from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  fetchCamps,
  fetchFamilyMembers,
  createFamily,
  updateFamily,
  saveFamilyMembers,
  supabase,
} from '../../lib/supabase';
import { showError, showSuccess, showInfo } from '../../utils/toast';
import { luhnCheck, validateName, validateDob } from '../../lib/helpers';
import { RELATION_BY_GENDER, ALL_RELATIONS, HEALTH_OPTIONS } from '../../lib/formOptions';
import spacing from '../../theme/spacing';

const MARITAL_BY_GENDER = {
  'ذكر': ['متزوج', 'أعزب', 'مطلق', 'أرمل'],
  'أنثى': ['متزوجة', 'عزباء', 'مطلقة', 'أرملة'],
};

const FAMILY_CATEGORIES = [
  { key: 'martyr', label: '🕊️ أسرة شهيد' },
  { key: 'captive', label: '⛓️ أسرة أسير' },
];

const ECONOMIC_LEVELS = [
  { key: '', label: '— غير محدد —' },
  { key: 'extreme_poverty', label: '🔴 فقر مدقع' },
  { key: 'poor', label: '🟠 فقير' },
  { key: 'worker', label: '🟡 عامل / متوسط' },
  { key: 'employee', label: '🟢 موظف / متوسط' },
  { key: 'well_off', label: '🔵 ميسور' },
];

const REGIONS = ['شمال غزة', 'غزة', 'الوسطى', 'جنوب غزة', 'رفح'];

const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

let localIdCounter = 0;
const genLocalId = () => `local_${Date.now()}_${localIdCounter++}`;

function parseDob(dob) {
  if (!dob) return { day: null, month: null, year: null };
  const d = new Date(dob);
  if (isNaN(d)) return { day: null, month: null, year: null };
  return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
}

function buildDob(day, month, year) {
  if (!day || !month || !year) return null;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

const SelectField = ({ value, options, onSelect, placeholder = 'اختر' }) => {
  const [visible, setVisible] = useState(false);
  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={
        <Button mode="outlined" onPress={() => setVisible(true)} icon="chevron-down" contentStyle={{ justifyContent: 'space-between', flexDirection: 'row-reverse' }}>
          {value || placeholder}
        </Button>
      }
    >
      {options.map((opt) => (
        <Menu.Item key={opt} title={opt} onPress={() => { onSelect(opt); setVisible(false); }} />
      ))}
    </Menu>
  );
};

const newMember = () => ({
  localId: genLocalId(),
  name: '',
  gender: '',
  relation: '',
  national_id: '',
  day: null,
  month: null,
  year: null,
  health: 'سليم',
});

const FamilyFormScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const familyId = route.params?.familyId || null;
  const { orgId, user } = useAuth();
  const { colors } = useTheme();

  const [camps, setCamps] = useState([]);
  const [campMenuVisible, setCampMenuVisible] = useState(false);
  const [econMenuVisible, setEconMenuVisible] = useState(false);

  const [headName, setHeadName] = useState('');
  const [headId, setHeadId] = useState('');
  const [phone1, setPhone1] = useState('');
  const [phone2, setPhone2] = useState('');
  const [headGender, setHeadGender] = useState('');
  const [headMarital, setHeadMarital] = useState('');
  const [dobDay, setDobDay] = useState(null);
  const [dobMonth, setDobMonth] = useState(null);
  const [dobYear, setDobYear] = useState(null);

  const [campId, setCampId] = useState(null);
  const [tent, setTent] = useState('');
  const [tent2, setTent2] = useState('');
  const [originalAddress, setOriginalAddress] = useState('');
  const [addressDetails, setAddressDetails] = useState('');

  const [categories, setCategories] = useState([]);
  const [economicLevel, setEconomicLevel] = useState('');
  const [notes, setNotes] = useState('');
  const [members, setMembers] = useState([]);

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!familyId);
  const [existingFamily, setExistingFamily] = useState(null);

  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const arr = [];
    for (let y = currentYear; y >= 1900; y--) arr.push(y);
    return arr;
  }, [currentYear]);
  const days = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), []);

  useEffect(() => {
    if (!orgId) return;
    fetchCamps(orgId).then(setCamps);
  }, [orgId]);

  useEffect(() => {
    if (!familyId) return;
    (async () => {
      const { data, error } = await supabase.from('families').select('*').eq('id', familyId).single();
      if (error || !data) {
        showError('تعذّر تحميل بيانات الأسرة');
        setLoading(false);
        return;
      }
      setExistingFamily(data);
      setHeadName(data.head_name || '');
      setHeadId(data.head_id || '');
      setPhone1(data.phone1 || '');
      setPhone2(data.phone2 || '');
      setHeadGender(data.head_gender || '');
      setHeadMarital(data.head_marital || '');
      const dob = parseDob(data.head_dob);
      setDobDay(dob.day);
      setDobMonth(dob.month);
      setDobYear(dob.year);
      setCampId(data.camp_id || null);
      setTent(data.tent || '');
      setTent2(data.tent2 || '');
      setOriginalAddress(data.original_address || '');
      setAddressDetails(data.address_details || '');
      setEconomicLevel(data.economic_level || '');
      setNotes(data.notes || '');
      try {
        const cats = typeof data.category_tags === 'string' ? JSON.parse(data.category_tags) : data.category_tags;
        setCategories(Array.isArray(cats) ? cats : []);
      } catch {
        setCategories([]);
      }

      // تحميل أفراد الأسرة الحاليين
      try {
        const mems = await fetchFamilyMembers([familyId]);
        setMembers(
          mems.map((m) => {
            const d = parseDob(m.dob);
            return {
              localId: m.id,
              dbId: m.id,
              name: m.name || '',
              gender: m.gender || '',
              relation: m.relation || '',
              national_id: m.national_id || '',
              day: d.day,
              month: d.month,
              year: d.year,
              health: m.health || 'سليم',
            };
          })
        );
      } catch (e) {
        showError('تعذّر تحميل أفراد الأسرة');
      }

      setLoading(false);
    })();
  }, [familyId]);

  const maritalOptions = headGender
    ? MARITAL_BY_GENDER[headGender] || []
    : [...MARITAL_BY_GENDER['ذكر'], ...MARITAL_BY_GENDER['أنثى']];

  const toggleCategory = (key) => {
    setCategories((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));
  };

  const addMember = () => setMembers((prev) => [...prev, newMember()]);
  const removeMember = (localId) => setMembers((prev) => prev.filter((m) => m.localId !== localId));
  const updateMember = (localId, field, value) => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m.localId !== localId) return m;
        const updated = { ...m, [field]: value };
        if (field === 'gender') updated.relation = ''; // إعادة ضبط الصلة عند تغيير الجنس
        return updated;
      })
    );
  };

  const validate = () => {
    const e = {};
    if (!headName.trim()) e.headName = 'الاسم مطلوب';
    else {
      const nameErr = validateName(headName);
      if (nameErr) e.headName = nameErr;
    }

    if (!headId.trim()) e.headId = 'رقم الهوية مطلوب';
    else if (headId.trim().length < 9) e.headId = '❌ رقم الهوية أقل من 9 أرقام';
    else if (!luhnCheck(headId.trim())) e.headId = '❌ رقم الهوية غير صحيح';

    const dobStr = buildDob(dobDay, dobMonth, dobYear);
    const dobErr = validateDob(dobStr);
    if (dobErr) e.dob = dobErr;

    if (!campId) e.campId = 'اختر المخيم';

    members.forEach((m, i) => {
      if (!m.name.trim()) e[`m_name_${i}`] = 'اسم الفرد مطلوب';
      else {
        const nameErr = validateName(m.name);
        if (nameErr) e[`m_name_${i}`] = nameErr;
      }
    });

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const dobStr = buildDob(dobDay, dobMonth, dobYear);

      if (!familyId || headId.trim() !== existingFamily?.head_id) {
        const { data: dupRows } = await supabase
          .from('families')
          .select('id, head_name')
          .eq('org_id', orgId)
          .eq('head_id', headId.trim())
          .neq('id', familyId || '00000000-0000-0000-0000-000000000000');
        if (dupRows && dupRows.length > 0) {
          showInfo(`⚠️ تنبيه: رقم الهوية مستخدم بالفعل لأسرة "${dupRows[0].head_name}"`);
        }
      }

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
        tent2: tent2.trim() || null,
        original_address: originalAddress || null,
        address_details: addressDetails.trim() || null,
        category_tags: JSON.stringify(categories),
        economic_level: economicLevel || null,
        notes: notes.trim() || null,
        _deleted: false,
      };

      let result;
      let finalFamilyId = familyId;
      if (familyId) {
        result = await updateFamily(familyId, payload);
      } else {
        result = await createFamily({
          ...payload,
          review_status: 'approved',
          pending_delete: false,
          created_by: user?.id || null,
        });
        if (result.success) finalFamilyId = result.data.id;
      }

      if (!result.success) {
        showError(result.error || 'فشل حفظ الأسرة');
        return;
      }

      // حفظ أفراد الأسرة (يستبدل القائمة بالكامل)
      try {
        await saveFamilyMembers(
          finalFamilyId,
          members.map((m) => ({
            name: m.name.trim(),
            relation: m.relation || null,
            national_id: m.national_id?.trim() || null,
            dob: buildDob(m.day, m.month, m.year),
            gender: m.gender || null,
            health: m.health || null,
          }))
        );
      } catch (memErr) {
        showError('تم حفظ الأسرة لكن حدث خطأ بحفظ الأفراد: ' + memErr.message);
      }

      // قاعدة عمل: عند إضافة أسرة جديدة بمخيم، تُسجَّل حركة دخول تلقائياً
      if (!familyId) {
        try {
          await supabase.from('family_movements').insert([
            {
              family_id: finalFamilyId,
              org_id: orgId,
              type: 'entry',
              to_camp: campId,
              date: new Date().toISOString().slice(0, 10),
              created_by: user?.id || null,
            },
          ]);
        } catch (movErr) {
          console.warn('[family entry movement]', movErr.message);
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

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.lg, paddingBottom: spacing['3xl'] },
    card: { padding: spacing.sm, marginBottom: spacing.lg },
    sectionTitle: { color: colors.text, fontWeight: 'bold', marginBottom: spacing.md },
    input: { marginBottom: spacing.xs },
    row: { flexDirection: 'row', gap: spacing.sm },
    flex1: { flex: 1 },
    fieldLabel: { color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.sm },
    menuAnchor: { marginBottom: spacing.xs },
    checkboxRow: { flexDirection: 'row', alignItems: 'center' },
    saveButton: { marginTop: spacing.sm, borderRadius: 8 },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    memberCard: { backgroundColor: colors.surface2, borderRadius: 10, padding: spacing.md, marginBottom: spacing.md },
    memberHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
    memberTitle: { color: colors.primary, fontWeight: 'bold', fontSize: 12 },
    emptyMembers: { textAlign: 'center', color: colors.textMuted, paddingVertical: spacing.lg, fontSize: 12 },
    addMemberBtn: { borderStyle: 'dashed', marginTop: spacing.xs },
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loaderContainer}>
          <Text style={{ color: colors.textMuted }}>جاري التحميل...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* بيانات رب الأسرة */}
        <Card mode="elevated" style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>👤 بيانات رب الأسرة</Text>

            <TextInput
              mode="outlined"
              label="اسم رب الأسرة *"
              placeholder="محمد أحمد علي محمد"
              value={headName}
              onChangeText={setHeadName}
              error={!!errors.headName}
              style={styles.input}
            />
            <HelperText type="error" visible={!!errors.headName}>{errors.headName}</HelperText>

            <TextInput
              mode="outlined"
              label="رقم الهوية *"
              placeholder="1xxxxxxxxx"
              value={headId}
              onChangeText={setHeadId}
              keyboardType="number-pad"
              maxLength={10}
              error={!!errors.headId}
              style={styles.input}
            />
            <HelperText type="error" visible={!!errors.headId}>{errors.headId}</HelperText>

            <View style={styles.row}>
              <TextInput
                mode="outlined"
                label="رقم الجوال"
                placeholder="05xxxxxxxx"
                value={phone1}
                onChangeText={setPhone1}
                keyboardType="phone-pad"
                style={[styles.input, styles.flex1]}
              />
              <TextInput
                mode="outlined"
                label="رقم بديل"
                placeholder="05xxxxxxxx"
                value={phone2}
                onChangeText={setPhone2}
                keyboardType="phone-pad"
                style={[styles.input, styles.flex1]}
              />
            </View>

            <Text style={styles.fieldLabel}>الجنس</Text>
            <SegmentedButtons
              value={headGender}
              onValueChange={(v) => { setHeadGender(v); setHeadMarital(''); }}
              buttons={[
                { value: 'ذكر', label: 'ذكر' },
                { value: 'أنثى', label: 'أنثى' },
              ]}
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>الحالة الاجتماعية</Text>
            <SelectField value={headMarital} options={maritalOptions} onSelect={setHeadMarital} placeholder="اختر الحالة الاجتماعية" />

            <Text style={styles.fieldLabel}>تاريخ الميلاد</Text>
            <View style={styles.row}>
              <View style={styles.flex1}>
                <SelectField value={dobDay ? String(dobDay) : null} options={days.map(String)} onSelect={(v) => setDobDay(Number(v))} placeholder="اليوم" />
              </View>
              <View style={styles.flex1}>
                <SelectField value={dobMonth ? MONTHS[dobMonth - 1] : null} options={MONTHS} onSelect={(v) => setDobMonth(MONTHS.indexOf(v) + 1)} placeholder="الشهر" />
              </View>
              <View style={styles.flex1}>
                <SelectField value={dobYear ? String(dobYear) : null} options={years.map(String)} onSelect={(v) => setDobYear(Number(v))} placeholder="السنة" />
              </View>
            </View>
            <HelperText type="error" visible={!!errors.dob}>{errors.dob}</HelperText>
          </Card.Content>
        </Card>

        {/* بيانات السكن */}
        <Card mode="elevated" style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>🏕️ بيانات السكن</Text>

            <Menu
              visible={campMenuVisible}
              onDismiss={() => setCampMenuVisible(false)}
              anchor={
                <Button mode="outlined" onPress={() => setCampMenuVisible(true)} style={styles.menuAnchor} icon="chevron-down">
                  {camps.find((c) => c.id === campId)?.name || '— اختر المخيم — *'}
                </Button>
              }
            >
              {camps.map((c) => (
                <Menu.Item key={c.id} title={c.name} onPress={() => { setCampId(c.id); setCampMenuVisible(false); }} />
              ))}
            </Menu>
            <HelperText type="error" visible={!!errors.campId}>{errors.campId}</HelperText>

            <View style={styles.row}>
              <TextInput mode="outlined" label="رقم الخيمة" value={tent} onChangeText={setTent} style={[styles.input, styles.flex1]} />
              <TextInput mode="outlined" label="خيمة ثانية" value={tent2} onChangeText={setTent2} style={[styles.input, styles.flex1]} />
            </View>

            <Text style={styles.fieldLabel}>العنوان الأصلي</Text>
            <SelectField value={originalAddress} options={REGIONS} onSelect={setOriginalAddress} placeholder="اختر المنطقة" />

            <TextInput mode="outlined" label="تفاصيل العنوان" value={addressDetails} onChangeText={setAddressDetails} style={[styles.input, { marginTop: spacing.sm }]} />
          </Card.Content>
        </Card>

        {/* أفراد الأسرة */}
        <Card mode="elevated" style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>👨‍👩‍👧 أفراد الأسرة ({members.length})</Text>

            {members.length === 0 && (
              <Text style={styles.emptyMembers}>لا يوجد أفراد مضافون بعد</Text>
            )}

            {members.map((m, i) => {
              const relations = m.gender ? RELATION_BY_GENDER[m.gender] || ALL_RELATIONS : ALL_RELATIONS;
              return (
                <View key={m.localId} style={styles.memberCard}>
                  <View style={styles.memberHeader}>
                    <Text style={styles.memberTitle}>فرد {i + 1}</Text>
                    <IconButton icon="delete-outline" size={18} iconColor={colors.error} onPress={() => removeMember(m.localId)} />
                  </View>

                  <TextInput
                    mode="outlined"
                    label="الاسم *"
                    placeholder="الاسم الرباعي"
                    value={m.name}
                    onChangeText={(v) => updateMember(m.localId, 'name', v)}
                    error={!!errors[`m_name_${i}`]}
                    dense
                    style={styles.input}
                  />
                  <HelperText type="error" visible={!!errors[`m_name_${i}`]}>{errors[`m_name_${i}`]}</HelperText>

                  <View style={styles.row}>
                    <View style={styles.flex1}>
                      <SelectField value={m.gender} options={['ذكر', 'أنثى']} onSelect={(v) => updateMember(m.localId, 'gender', v)} placeholder="الجنس" />
                    </View>
                    <View style={styles.flex1}>
                      <SelectField value={m.relation} options={relations} onSelect={(v) => updateMember(m.localId, 'relation', v)} placeholder="صلة القرابة" />
                    </View>
                  </View>

                  <TextInput
                    mode="outlined"
                    label="رقم الهوية (اختياري)"
                    placeholder="9 أرقام"
                    value={m.national_id}
                    onChangeText={(v) => updateMember(m.localId, 'national_id', v)}
                    keyboardType="number-pad"
                    maxLength={9}
                    dense
                    style={[styles.input, { marginTop: spacing.sm }]}
                  />
                  {m.national_id?.length >= 9 && (
                    <HelperText type={luhnCheck(m.national_id) ? 'info' : 'error'} visible>
                      {luhnCheck(m.national_id) ? '✅ هوية صحيحة' : '❌ هوية غير صحيحة'}
                    </HelperText>
                  )}

                  <Text style={styles.fieldLabel}>تاريخ الميلاد</Text>
                  <View style={styles.row}>
                    <View style={styles.flex1}>
                      <SelectField value={m.day ? String(m.day) : null} options={days.map(String)} onSelect={(v) => updateMember(m.localId, 'day', Number(v))} placeholder="اليوم" />
                    </View>
                    <View style={styles.flex1}>
                      <SelectField value={m.month ? MONTHS[m.month - 1] : null} options={MONTHS} onSelect={(v) => updateMember(m.localId, 'month', MONTHS.indexOf(v) + 1)} placeholder="الشهر" />
                    </View>
                    <View style={styles.flex1}>
                      <SelectField value={m.year ? String(m.year) : null} options={years.map(String)} onSelect={(v) => updateMember(m.localId, 'year', Number(v))} placeholder="السنة" />
                    </View>
                  </View>

                  <Text style={styles.fieldLabel}>الحالة الصحية</Text>
                  <SelectField
                    value={HEALTH_OPTIONS.find((h) => h.v === m.health)?.label || m.health}
                    options={HEALTH_OPTIONS.map((h) => h.label)}
                    onSelect={(label) => updateMember(m.localId, 'health', HEALTH_OPTIONS.find((h) => h.label === label)?.v || label)}
                  />
                </View>
              );
            })}

            <Button mode="outlined" icon="plus" onPress={addMember} style={styles.addMemberBtn}>
              إضافة فرد
            </Button>
          </Card.Content>
        </Card>

        {/* الفئات الاجتماعية */}
        <Card mode="elevated" style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>🏷️ الفئات الاجتماعية</Text>

            <Text style={styles.fieldLabel}>فئة الأسرة</Text>
            {FAMILY_CATEGORIES.map((cat) => (
              <View key={cat.key} style={styles.checkboxRow}>
                <Checkbox status={categories.includes(cat.key) ? 'checked' : 'unchecked'} onPress={() => toggleCategory(cat.key)} />
                <Text style={{ color: colors.text }}>{cat.label}</Text>
              </View>
            ))}

            <Text style={styles.fieldLabel}>المستوى الاقتصادي</Text>
            <Menu
              visible={econMenuVisible}
              onDismiss={() => setEconMenuVisible(false)}
              anchor={
                <Button mode="outlined" onPress={() => setEconMenuVisible(true)} icon="chevron-down">
                  {ECONOMIC_LEVELS.find((l) => l.key === economicLevel)?.label || '— غير محدد —'}
                </Button>
              }
            >
              {ECONOMIC_LEVELS.map((l) => (
                <Menu.Item key={l.key || 'none'} title={l.label} onPress={() => { setEconomicLevel(l.key); setEconMenuVisible(false); }} />
              ))}
            </Menu>
          </Card.Content>
        </Card>

        {/* ملاحظات */}
        <Card mode="elevated" style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>📝 ملاحظات</Text>
            <TextInput mode="outlined" value={notes} onChangeText={setNotes} multiline numberOfLines={3} />
          </Card.Content>
        </Card>

        <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving} style={styles.saveButton}>
          {familyId ? '✅ حفظ التعديلات' : '✅ إضافة الأسرة'}
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
};

export default FamilyFormScreen;
