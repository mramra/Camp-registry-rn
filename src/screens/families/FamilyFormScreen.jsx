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
} from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  fetchCamps,
  createFamily,
  updateFamily,
  supabase,
} from '../../lib/supabase';
import { showError, showSuccess, showInfo } from '../../utils/toast';
import { luhnCheck, validateName, validateDob } from '../../lib/helpers';
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

// حقل اختيار بسيط عبر قائمة منسدلة (Menu) — مستخدم لعدة حقول اختيار بهذه الشاشة
const SelectField = ({ label, value, options, onSelect, placeholder = 'اختر' }) => {
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
        <Menu.Item
          key={opt}
          title={opt}
          onPress={() => {
            onSelect(opt);
            setVisible(false);
          }}
        />
      ))}
    </Menu>
  );
};

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
      setLoading(false);
    })();
  }, [familyId]);

  const maritalOptions = headGender
    ? MARITAL_BY_GENDER[headGender] || []
    : [...MARITAL_BY_GENDER['ذكر'], ...MARITAL_BY_GENDER['أنثى']];

  const toggleCategory = (key) => {
    setCategories((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));
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

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const dobStr = buildDob(dobDay, dobMonth, dobYear);

      // فحص هوية مكررة (تنبيه فقط، لا يمنع الحفظ - نفس سلوك النسخة الأصلية)
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
      if (familyId) {
        result = await updateFamily(familyId, payload);
      } else {
        result = await createFamily({
          ...payload,
          review_status: 'approved',
          pending_delete: false,
          created_by: user?.id || null,
        });
      }

      if (!result.success) {
        showError(result.error || 'فشل حفظ الأسرة');
        return;
      }

      // قاعدة عمل: عند إضافة أسرة جديدة بمخيم، تُسجَّل حركة دخول تلقائياً
      if (!familyId) {
        try {
          await supabase.from('family_movements').insert([
            {
              family_id: result.data.id,
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
              onValueChange={(v) => {
                setHeadGender(v);
                setHeadMarital('');
              }}
              buttons={[
                { value: 'ذكر', label: 'ذكر' },
                { value: 'أنثى', label: 'أنثى' },
              ]}
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>الحالة الاجتماعية</Text>
            <SelectField
              value={headMarital}
              options={maritalOptions}
              onSelect={setHeadMarital}
              placeholder="اختر الحالة الاجتماعية"
            />

            <Text style={styles.fieldLabel}>تاريخ الميلاد</Text>
            <View style={styles.row}>
              <View style={styles.flex1}>
                <SelectField
                  value={dobDay ? String(dobDay) : null}
                  options={days.map(String)}
                  onSelect={(v) => setDobDay(Number(v))}
                  placeholder="اليوم"
                />
              </View>
              <View style={styles.flex1}>
                <SelectField
                  value={dobMonth ? MONTHS[dobMonth - 1] : null}
                  options={MONTHS}
                  onSelect={(v) => setDobMonth(MONTHS.indexOf(v) + 1)}
                  placeholder="الشهر"
                />
              </View>
              <View style={styles.flex1}>
                <SelectField
                  value={dobYear ? String(dobYear) : null}
                  options={years.map(String)}
                  onSelect={(v) => setDobYear(Number(v))}
                  placeholder="السنة"
                />
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
                <Button
                  mode="outlined"
                  onPress={() => setCampMenuVisible(true)}
                  style={styles.menuAnchor}
                  icon="chevron-down"
                >
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
              <TextInput
                mode="outlined"
                label="رقم الخيمة"
                value={tent}
                onChangeText={setTent}
                style={[styles.input, styles.flex1]}
              />
              <TextInput
                mode="outlined"
                label="خيمة ثانية"
                value={tent2}
                onChangeText={setTent2}
                style={[styles.input, styles.flex1]}
              />
            </View>

            <Text style={styles.fieldLabel}>العنوان الأصلي</Text>
            <SelectField
              value={originalAddress}
              options={REGIONS}
              onSelect={setOriginalAddress}
              placeholder="اختر المنطقة"
            />

            <TextInput
              mode="outlined"
              label="تفاصيل العنوان"
              value={addressDetails}
              onChangeText={setAddressDetails}
              style={[styles.input, { marginTop: spacing.sm }]}
            />
          </Card.Content>
        </Card>

        {/* الفئات الاجتماعية */}
        <Card mode="elevated" style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>🏷️ الفئات الاجتماعية</Text>

            <Text style={styles.fieldLabel}>فئة الأسرة</Text>
            {FAMILY_CATEGORIES.map((cat) => (
              <View key={cat.key} style={styles.checkboxRow}>
                <Checkbox
                  status={categories.includes(cat.key) ? 'checked' : 'unchecked'}
                  onPress={() => toggleCategory(cat.key)}
                />
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
                <Menu.Item
                  key={l.key || 'none'}
                  title={l.label}
                  onPress={() => {
                    setEconomicLevel(l.key);
                    setEconMenuVisible(false);
                  }}
                />
              ))}
            </Menu>
          </Card.Content>
        </Card>

        {/* ملاحظات */}
        <Card mode="elevated" style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>📝 ملاحظات</Text>
            <TextInput
              mode="outlined"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
            />
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
