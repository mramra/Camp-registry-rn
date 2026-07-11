import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Linking,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { fetchCamps, fetchOrgMembers, createCamp, updateCamp, supabase } from '../../lib/supabase';
import { showError, showSuccess } from '../../utils/toast';
import FormSection from '../../components/ui/FormSection';
import FormInput from '../../components/ui/FormInput';
import SelectField from '../../components/ui/SelectField';
import colors from '../../theme/colors';

const STATUS_OPTIONS = [
  { value: 'active', label: '✅ نشط' },
  { value: 'suspended', label: '⏸️ موقوف' },
  { value: 'closed', label: '🔴 مغلق' },
];

export default function CampFormScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const campId = route.params?.campId || null;
  const forcedParentId = route.params?.parentCampId || null;
  const { orgId, isOwner, isSuperAdmin, isCampDelegate, profile } = useAuth();

  const [allCamps, setAllCamps] = useState([]);
  const [orgMembers, setOrgMembers] = useState([]);
  const [loading, setLoading] = useState(!!campId);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [errors, setErrors] = useState({});

  const [name, setName] = useState('');
  const [campType, setCampType] = useState(forcedParentId ? 'sub' : 'main');
  const [parentCampId, setParentCampId] = useState(forcedParentId);
  const [address, setAddress] = useState('');
  const [capacity, setCapacity] = useState('');
  const [status, setStatus] = useState('active');
  const [managerId, setManagerId] = useState(null);
  const [coordinates, setCoordinates] = useState('');
  const [portalOpen, setPortalOpen] = useState(false);

  // تفعيل/تعطيل بوابة الأسرة العامة: مالك المنصة، مدير الإيواء، ومندوب المخيم فقط
  const canManagePortal = isOwner || isSuperAdmin || isCampDelegate;

  // مندوب مقيّد بمخيمه فقط عند الإضافة (لا يختار نوع/أب المخيم)
  const restrictedDelegate = !campId && isCampDelegate && !isOwner && !isSuperAdmin;

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const [camps, members] = await Promise.all([fetchCamps(orgId), fetchOrgMembers(orgId)]);
      setAllCamps(camps.filter((c) => c.id !== campId));
      setOrgMembers(members.filter((m) => m.role === 'super_admin' && m.is_active !== false));

      if (restrictedDelegate) {
        setCampType('sub');
        setParentCampId(profile.camp_id);
      }

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
          setPortalOpen(!!data.portal_open);
        }
        setLoading(false);
      }
    })();
  }, [orgId, campId]);

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
    } catch {
      showError('تعذّر الحصول على الموقع الحالي');
    } finally {
      setLocating(false);
    }
  };

  const openOnMap = () => {
    if (coordinates.trim().includes(',')) {
      Linking.openURL(`https://maps.google.com/?q=${coordinates.trim()}`);
    }
  };

  const validate = () => {
    const e = {};
    if (!name.trim()) e.name = 'اسم المخيم مطلوب';
    if (campType === 'sub' && !parentCampId) e.parentCampId = 'يجب اختيار المخيم الرئيسي للفرع';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const parseCoordinates = () => {
    const c = coordinates.trim();
    if (!c.includes(',')) return { latitude: null, longitude: null };
    const [lat, lng] = c.split(',').map((v) => parseFloat(v.trim()));
    return {
      latitude: isNaN(lat) ? null : lat,
      longitude: isNaN(lng) ? null : lng,
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
        manager_id: campType === 'sub' ? null : (managerId || null),
        latitude,
        longitude,
        portal_open: portalOpen,
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
        <FormSection title="🏕️ بيانات المخيم">
          <FormInput label="اسم المخيم *" value={name} onChangeText={setName} error={errors.name} />

          {!restrictedDelegate ? (
            <>
              <Text style={styles.fieldLabel}>النوع</Text>
              <View style={styles.segmentRow}>
                {[{ v: 'main', l: '🏕️ رئيسي' }, { v: 'sub', l: '🏕️ فرعي' }].map((opt) => (
                  <Pressable
                    key={opt.v}
                    style={[styles.segmentBtn, campType === opt.v && styles.segmentBtnActive]}
                    onPress={() => { setCampType(opt.v); setParentCampId(null); }}
                  >
                    <Text style={[styles.segmentText, campType === opt.v && styles.segmentTextActive]}>{opt.l}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.readonlyBox}>
              <Text style={styles.readonlyText}>🏕️ فرعي (تحت مخيمك)</Text>
            </View>
          )}

          {campType === 'sub' && (
            !restrictedDelegate ? (
              <SelectField
                label="المخيم الرئيسي"
                value={allCamps.find((c) => c.id === parentCampId)?.name}
                options={allCamps.filter((c) => !c.parent_camp_id).map((c) => ({ value: c.id, label: c.name }))}
                onSelect={setParentCampId}
                placeholder="— اختر —"
                error={errors.parentCampId}
              />
            ) : (
              <View style={styles.readonlyBox}>
                <Text style={styles.readonlyText}>🏕️ {allCamps.find((c) => c.id === parentCampId)?.name || 'مخيمك'}</Text>
              </View>
            )
          )}

          {isOwner && campType === 'sub' && parentCampId ? (
            <View style={styles.inheritBox}>
              <Text style={styles.inheritLabel}>🔴 مدير الإيواء</Text>
              <Text style={styles.inheritText}>
                يُورَث تلقائياً من المخيم الرئيسي (
                {orgMembers.find((m) => m.id === allCamps.find((c) => c.id === parentCampId)?.manager_id)?.full_name || 'غير محدَّد'}
                ) — الفروع ما تقدر يكون إلها مدير إيواء مستقل، عشان تفادي تضارب البيانات.
              </Text>
            </View>
          ) : (
            isOwner && (
              <SelectField
                label="🔴 مدير الإيواء"
                value={orgMembers.find((m) => m.id === managerId)?.full_name}
                options={[
                  { value: '', label: '— بدون مدير إيواء —' },
                  ...orgMembers.map((m) => ({ value: m.id, label: m.full_name })),
                ]}
                onSelect={(v) => setManagerId(v || null)}
                placeholder="— بدون مدير إيواء —"
              />
            )
          )}

          <FormInput label="العنوان" placeholder="موقع المخيم" value={address} onChangeText={setAddress} />

          <Text style={styles.fieldLabel}>📍 إحداثيات GPS</Text>
          <FormInput placeholder="31.547565,34.461274" value={coordinates} onChangeText={setCoordinates} />
          <Text style={styles.hint}>الصيغة: خط_العرض,خط_الطول</Text>

          <Pressable style={styles.locBtn} onPress={useMyLocation} disabled={locating}>
            {locating ? <ActivityIndicator color={colors.blue} /> : <Text style={styles.locBtnText}>📡 استخدام موقعي الحالي</Text>}
          </Pressable>

          {coordinates.includes(',') && (
            <Pressable style={styles.mapBtn} onPress={openOnMap}>
              <Text style={styles.mapBtnText}>🗺️ معاينة على الخريطة</Text>
            </Pressable>
          )}

          <FormInput
            label="الطاقة الاستيعابية (أسرة)"
            placeholder="0 = غير محدد"
            value={capacity}
            onChangeText={setCapacity}
            keyboardType="number-pad"
          />

          <Text style={styles.fieldLabel}>الحالة</Text>
          <View style={styles.segmentRow}>
            {STATUS_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[styles.segmentBtn, status === opt.value && styles.segmentBtnActive]}
                onPress={() => setStatus(opt.value)}
              >
                <Text style={[styles.segmentText, status === opt.value && styles.segmentTextActive]}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>

          {canManagePortal && (
            <View style={styles.portalBox}>
              <View style={styles.portalRow}>
                <Switch value={portalOpen} onValueChange={setPortalOpen} trackColor={{ true: colors.accent }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.portalTitle}>🏕️ بوابة الأسرة العامة</Text>
                  <Text style={styles.portalSub}>
                    {portalOpen
                      ? '✅ مفعّلة — أسر هذا المخيم تقدر تستعلم عن بياناتها من بوابة الأسرة بدون تسجيل دخول'
                      : '⛔ معطّلة — أسر هذا المخيم غير ظاهرة ببوابة الأسرة العامة'}
                  </Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.row}>
            <Pressable style={[styles.saveBtn, saving && styles.disabled]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>{campId ? '💾 حفظ' : '✅ إضافة'}</Text>}
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.cancelBtnText}>إلغاء</Text>
            </Pressable>
          </View>
        </FormSection>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: 'bold', marginBottom: 6, marginTop: 4, textAlign: 'right' },
  hint: { color: colors.muted, fontSize: 10, marginBottom: 10, textAlign: 'right' },

  segmentRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  segmentBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  segmentText: { color: colors.white, fontWeight: 'bold', fontSize: 12 },
  segmentTextActive: { color: '#000' },

  readonlyBox: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12 },
  readonlyText: { color: colors.muted, fontSize: 13, textAlign: 'right' },

  locBtn: { backgroundColor: 'rgba(59,130,246,0.08)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.4)', borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginBottom: 8 },
  locBtnText: { color: colors.blue, fontWeight: 'bold', fontSize: 12 },
  mapBtn: { backgroundColor: 'rgba(59,130,246,0.05)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)', borderRadius: 12, paddingVertical: 8, alignItems: 'center', marginBottom: 12 },
  mapBtnText: { color: colors.blue, fontSize: 11 },

  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
  portalBox: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 12 },
  inheritBox: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 12 },
  inheritLabel: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'right', marginBottom: 4 },
  inheritText: { color: colors.muted, fontSize: 11, textAlign: 'right', lineHeight: 17 },
  portalRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  portalTitle: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'right' },
  portalSub: { color: colors.muted, fontSize: 10, marginTop: 3, textAlign: 'right', lineHeight: 15 },
  saveBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
  cancelBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
});
