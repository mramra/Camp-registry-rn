import React, { useEffect, useState } from 'react';
import { View, StyleSheet, SafeAreaView, ScrollView, Linking } from 'react-native';
import { Text, TextInput, Button, Card, HelperText, Menu, SegmentedButtons } from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  fetchCamps,
  fetchOrgMembers,
  createCamp,
  updateCamp,
  supabase,
} from '../../lib/supabase';
import { showError, showSuccess } from '../../utils/toast';
import spacing from '../../theme/spacing';

const STATUS_OPTIONS = [
  { value: 'active', label: '✅ نشط' },
  { value: 'suspended', label: '⏸️ موقوف' },
  { value: 'closed', label: '🔴 مغلق' },
];

const CampFormScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const campId = route.params?.campId || null;
  const { orgId } = useAuth();
  const { colors } = useTheme();

  const [name, setName] = useState('');
  const [campType, setCampType] = useState('main');
  const [parentCampId, setParentCampId] = useState(null);
  const [address, setAddress] = useState('');
  const [capacity, setCapacity] = useState('');
  const [status, setStatus] = useState('active');
  const [managerId, setManagerId] = useState(null);
  const [coordinates, setCoordinates] = useState(''); // "lat,lng" نفس صيغة النسخة الأصلية
  const [locating, setLocating] = useState(false);

  const [allCamps, setAllCamps] = useState([]);
  const [orgMembers, setOrgMembers] = useState([]);
  const [parentMenuVisible, setParentMenuVisible] = useState(false);
  const [managerMenuVisible, setManagerMenuVisible] = useState(false);

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!campId);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const [camps, members] = await Promise.all([fetchCamps(orgId), fetchOrgMembers(orgId)]);
      setAllCamps(camps.filter((c) => c.id !== campId));
      setOrgMembers(members.filter((m) => m.role === 'super_admin' && m.is_active !== false));

      if (campId) {
        const { data, error } = await supabase.from('camps').select('*').eq('id', campId).single();
        if (!error && data) {
          setName(data.name || '');
          setCampType(data.camp_type || 'main');
          setParentCampId(data.parent_camp_id || null);
          setAddress(data.address || '');
          setCapacity(data.capacity ? String(data.capacity) : '');
          setStatus(data.status || 'active');
          setManagerId(data.manager_id || null);
          setCoordinates(data.latitude && data.longitude ? `${data.latitude},${data.longitude}` : '');
        }
        setLoading(false);
      }
    })();
  }, [orgId, campId]);

  const validate = () => {
    const e = {};
    if (!name.trim()) e.name = 'اسم المخيم مطلوب';
    if (campType === 'sub' && !parentCampId) e.parentCampId = 'يجب اختيار المخيم الرئيسي للفرع';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus !== 'granted') {
        showError('لم يُسمح بالوصول للموقع');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      setCoordinates(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`);
      showSuccess('تم تحديد الموقع الحالي');
    } catch (e) {
      showError('تعذّر الحصول على الموقع الحالي');
    } finally {
      setLocating(false);
    }
  };

  const openOnMap = () => {
    const c = coordinates.trim();
    if (c.includes(',')) Linking.openURL(`https://maps.google.com/?q=${c}`);
  };

  const parseCoordinates = () => {
    const c = coordinates.trim();
    if (!c || !c.includes(',')) return { latitude: null, longitude: null };
    const [latStr, lngStr] = c.split(',');
    const latitude = parseFloat(latStr.trim());
    const longitude = parseFloat(lngStr.trim());
    return {
      latitude: isNaN(latitude) ? null : latitude,
      longitude: isNaN(longitude) ? null : longitude,
    };
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const { latitude, longitude } = parseCoordinates();
      const payload = {
        org_id: orgId,
        name: name.trim(),
        camp_type: campType,
        parent_camp_id: campType === 'sub' ? parentCampId : null,
        address: address.trim() || null,
        capacity: capacity ? parseInt(capacity, 10) : null,
        status,
        manager_id: managerId || null,
        latitude,
        longitude,
        _deleted: false,
      };

      const result = campId ? await updateCamp(campId, payload) : await createCamp(payload);

      if (!result.success) {
        showError(result.error || 'فشل حفظ المخيم');
        return;
      }

      showSuccess(campId ? 'تم تحديث المخيم' : 'تم إضافة المخيم');
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
    fieldLabel: { color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.sm },
    menuAnchor: { marginBottom: spacing.xs },
    saveButton: { marginTop: spacing.lg, borderRadius: 8 },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    hint: { color: colors.textMuted, fontSize: 11, marginBottom: spacing.sm },
    locBtn: { marginBottom: spacing.sm },
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
        <Card mode="elevated" style={styles.card}>
          <Card.Content>
            <TextInput
              mode="outlined"
              label="اسم المخيم *"
              value={name}
              onChangeText={setName}
              error={!!errors.name}
              style={styles.input}
            />
            <HelperText type="error" visible={!!errors.name}>{errors.name}</HelperText>

            <Text style={styles.fieldLabel}>نوع المخيم</Text>
            <SegmentedButtons
              value={campType}
              onValueChange={setCampType}
              buttons={[
                { value: 'main', label: 'رئيسي' },
                { value: 'sub', label: 'فرع' },
              ]}
              style={styles.input}
            />

            {campType === 'sub' && (
              <>
                <Menu
                  visible={parentMenuVisible}
                  onDismiss={() => setParentMenuVisible(false)}
                  anchor={
                    <Button
                      mode="outlined"
                      onPress={() => setParentMenuVisible(true)}
                      style={styles.menuAnchor}
                      icon="chevron-down"
                    >
                      {allCamps.find((c) => c.id === parentCampId)?.name || 'اختر المخيم الرئيسي *'}
                    </Button>
                  }
                >
                  {allCamps
                    .filter((c) => !c.parent_camp_id)
                    .map((c) => (
                      <Menu.Item
                        key={c.id}
                        title={c.name}
                        onPress={() => {
                          setParentCampId(c.id);
                          setParentMenuVisible(false);
                        }}
                      />
                    ))}
                </Menu>
                <HelperText type="error" visible={!!errors.parentCampId}>{errors.parentCampId}</HelperText>
              </>
            )}

            <TextInput
              mode="outlined"
              label="العنوان (اختياري)"
              value={address}
              onChangeText={setAddress}
              style={styles.input}
            />

            <TextInput
              mode="outlined"
              label="السعة الاستيعابية (اختياري)"
              value={capacity}
              onChangeText={setCapacity}
              keyboardType="number-pad"
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>📍 إحداثيات GPS</Text>
            <TextInput
              mode="outlined"
              placeholder="31.547565,34.461274"
              value={coordinates}
              onChangeText={setCoordinates}
              style={styles.input}
            />
            <Text style={styles.hint}>الصيغة: خط_العرض,خط_الطول</Text>

            <Button
              mode="outlined"
              icon="crosshairs-gps"
              onPress={useMyLocation}
              loading={locating}
              disabled={locating}
              style={styles.locBtn}
            >
              استخدام موقعي الحالي
            </Button>

            {coordinates.includes(',') && (
              <Button mode="text" icon="map" onPress={openOnMap} style={styles.locBtn}>
                🗺️ عرض على الخريطة
              </Button>
            )}

            <Text style={styles.fieldLabel}>الحالة</Text>
            <SegmentedButtons
              value={status}
              onValueChange={setStatus}
              buttons={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>مدير الإيواء (اختياري)</Text>
            <Menu
              visible={managerMenuVisible}
              onDismiss={() => setManagerMenuVisible(false)}
              anchor={
                <Button
                  mode="outlined"
                  onPress={() => setManagerMenuVisible(true)}
                  style={styles.menuAnchor}
                  icon="chevron-down"
                >
                  {orgMembers.find((m) => m.id === managerId)?.full_name || 'بدون تحديد'}
                </Button>
              }
            >
              <Menu.Item
                title="بدون تحديد"
                onPress={() => {
                  setManagerId(null);
                  setManagerMenuVisible(false);
                }}
              />
              {orgMembers.map((m) => (
                <Menu.Item
                  key={m.id}
                  title={m.full_name}
                  onPress={() => {
                    setManagerId(m.id);
                    setManagerMenuVisible(false);
                  }}
                />
              ))}
            </Menu>

            <Button
              mode="contained"
              onPress={handleSave}
              loading={saving}
              disabled={saving}
              style={styles.saveButton}
            >
              {campId ? 'حفظ التعديلات' : 'إضافة المخيم'}
            </Button>
          </Card.Content>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

export default CampFormScreen;
