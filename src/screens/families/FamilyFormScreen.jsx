import React, { useEffect, useState } from 'react';
import { View, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { Text, TextInput, Button, Card, HelperText, Menu } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { fetchCamps, createFamily, supabase } from '../../lib/supabase';
import { showError, showSuccess } from '../../utils/toast';
import spacing from '../../theme/spacing';

const FamilyFormScreen = () => {
  const navigation = useNavigation();
  const { orgId, user } = useAuth();
  const { colors } = useTheme();

  const [camps, setCamps] = useState([]);
  const [campMenuVisible, setCampMenuVisible] = useState(false);

  const [headName, setHeadName] = useState('');
  const [headId, setHeadId] = useState('');
  const [phone1, setPhone1] = useState('');
  const [phone2, setPhone2] = useState('');
  const [campId, setCampId] = useState(null);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (orgId) fetchCamps(orgId).then(setCamps);
  }, [orgId]);

  const validate = () => {
    const e = {};
    if (!headName.trim()) e.headName = 'اسم رب الأسرة مطلوب';
    if (!headId.trim()) e.headId = 'رقم الهوية مطلوب';
    if (!phone1.trim()) e.phone1 = 'رقم الجوال مطلوب';
    if (!campId) e.campId = 'المخيم مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const result = await createFamily({
        org_id: orgId,
        camp_id: campId,
        head_name: headName.trim(),
        head_id: headId.trim(),
        phone1: phone1.trim(),
        phone2: phone2.trim() || null,
        notes: notes.trim() || null,
        review_status: 'approved',
        _deleted: false,
        pending_delete: false,
        created_by: user?.id || null,
      });

      if (!result.success) {
        showError(result.error || 'فشل حفظ الأسرة');
        return;
      }

      // قاعدة عمل مهمة: عند إضافة أسرة بمخيم، يُسجَّل حركة دخول تلقائياً
      // (كانت ناقصة بالنسخة الأصلية للويب — تم إصلاحها هناك ويجب تطبيقها هنا أيضاً)
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
        // لا نوقف نجاح إضافة الأسرة بسبب فشل تسجيل الحركة — فقط نسجّل الخطأ
        console.warn('[family entry movement]', movErr.message);
      }

      showSuccess('تم إضافة الأسرة بنجاح');
      navigation.goBack();
    } catch (e) {
      showError('حدث خطأ غير متوقع');
    } finally {
      setSaving(false);
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.lg },
    card: { padding: spacing.sm },
    input: { marginBottom: spacing.xs },
    menuAnchor: {
      marginBottom: spacing.xs,
    },
    saveButton: { marginTop: spacing.lg, borderRadius: 8 },
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card mode="elevated" style={styles.card}>
          <Card.Content>
            <TextInput
              mode="outlined"
              label="اسم رب الأسرة *"
              value={headName}
              onChangeText={setHeadName}
              error={!!errors.headName}
              style={styles.input}
            />
            <HelperText type="error" visible={!!errors.headName}>{errors.headName}</HelperText>

            <TextInput
              mode="outlined"
              label="رقم الهوية *"
              value={headId}
              onChangeText={setHeadId}
              keyboardType="number-pad"
              error={!!errors.headId}
              style={styles.input}
            />
            <HelperText type="error" visible={!!errors.headId}>{errors.headId}</HelperText>

            <TextInput
              mode="outlined"
              label="رقم الجوال *"
              value={phone1}
              onChangeText={setPhone1}
              keyboardType="phone-pad"
              error={!!errors.phone1}
              style={styles.input}
            />
            <HelperText type="error" visible={!!errors.phone1}>{errors.phone1}</HelperText>

            <TextInput
              mode="outlined"
              label="جوال إضافي (اختياري)"
              value={phone2}
              onChangeText={setPhone2}
              keyboardType="phone-pad"
              style={styles.input}
            />

            <Menu
              visible={campMenuVisible}
              onDismiss={() => setCampMenuVisible(false)}
              anchor={
                <Button
                  mode="outlined"
                  onPress={() => setCampMenuVisible(true)}
                  style={styles.menuAnchor}
                  icon="chevron-down"
                  contentStyle={{ flexDirection: 'row-reverse' }}
                >
                  {camps.find((c) => c.id === campId)?.name || 'اختر المخيم *'}
                </Button>
              }
            >
              {camps.map((c) => (
                <Menu.Item
                  key={c.id}
                  title={c.name}
                  onPress={() => { setCampId(c.id); setCampMenuVisible(false); }}
                />
              ))}
            </Menu>
            <HelperText type="error" visible={!!errors.campId}>{errors.campId}</HelperText>

            <TextInput
              mode="outlined"
              label="ملاحظات (اختياري)"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              style={styles.input}
            />

            <Button
              mode="contained"
              onPress={handleSave}
              loading={saving}
              disabled={saving}
              style={styles.saveButton}
            >
              حفظ الأسرة
            </Button>
          </Card.Content>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

export default FamilyFormScreen;
