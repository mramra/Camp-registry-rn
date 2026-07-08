import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, SafeAreaView, ActivityIndicator, Switch } from 'react-native';
import { supabase, fetchCamps, fetchOrgMembers, createFamily } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { hasPermission } from '../../lib/permissions';
import { exportXLSX, pickAndParseXLSX } from '../../lib/excelIO';
import { getCampDelegateInfo } from '../../lib/helpers';
import PageHeader from '../../components/ui/PageHeader';
import SelectField from '../../components/ui/SelectField';
import FormSection from '../../components/ui/FormSection';
import { showToast } from '../../utils/toast';
import colors from '../../theme/colors';

export default function ExportScreen() {
  const { profile, orgId } = useAuth();
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope();
  const canExport = hasPermission(profile, 'reports');
  const canImport = hasPermission(profile, 'write');

  const [camps, setCamps] = useState([]);
  const [orgMembers, setOrgMembers] = useState([]);
  const [filterCamp, setFilterCamp] = useState('');
  const [showBanner, setShowBanner] = useState(true);
  const [loading, setLoading] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);

  const loadMeta = useCallback(async () => {
    if (!orgId) return;
    const [c, om] = await Promise.all([fetchCamps(orgId), fetchOrgMembers(orgId)]);
    setCamps(getVisibleCamps(c));
    setOrgMembers(om);
  }, [orgId, getVisibleCamps]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  const getCampInfo = (campId) => {
    if (!campId) return null;
    const camp = camps.find((c) => c.id === campId);
    if (!camp) return null;
    const delegate = getCampDelegateInfo(camp, orgMembers);
    return { name: camp.name, delegateName: delegate?.name, delegatePhone: delegate?.phone };
  };

  const getFullData = async () => {
    const allCamps = await fetchCamps(orgId);
    const campIds = getAllowedCampIds(allCamps);
    let q = supabase.from('families').select('*, camps!camp_id(id,name), family_members(*)').eq('org_id', orgId).eq('_deleted', false);
    if (filterCamp) q = q.eq('camp_id', filterCamp);
    const { data, error } = await q;
    if (error) throw error;
    const scoped = campIds === null ? data : (data || []).filter((f) => campIds.includes(f.camp_id));
    return scoped || [];
  };

  const bannerNote = (campInfo) =>
    showBanner && campInfo ? `${campInfo.name} — ${campInfo.delegateName || '—'} — ${campInfo.delegatePhone || '—'}` : null;

  const exportFamilies = async () => {
    if (!canExport) return showToast('لا تملك صلاحية التصدير', 'error');
    setLoading(true);
    try {
      const data = await getFullData();
      if (!data.length) return showToast('لا توجد بيانات للتصدير', 'error');
      const sorted = [...data].sort((a, b) => String(a.tent || '').localeCompare(String(b.tent || ''), 'ar', { numeric: true }));
      const campInfo = getCampInfo(filterCamp);
      const rows = sorted.map((f) => ({
        ...(bannerNote(campInfo) ? { 'بيانات المخيم': bannerNote(campInfo) } : {}),
        'اسم رب الأسرة': f.head_name || '',
        'رقم الهوية': f.head_id || '',
        'رقم الجوال': f.phone1 || '',
        'جوال بديل': f.phone2 || '',
        'الجنس': f.head_gender || '',
        'الحالة الاجتماعية': f.head_marital || '',
        'تاريخ الميلاد': f.head_dob || '',
        'المخيم': f.camps?.name || '',
        'الخيمة': f.tent || '',
        'عدد الأفراد': 1 + (f.family_members?.length || 0),
        'ملاحظات': f.notes || '',
      }));
      await exportXLSX(rows, campInfo?.name || 'كل المخيمات', `كشف_الأسر_${campInfo?.name || 'كل_المخيمات'}`);
      showToast(`تم تصدير ${data.length} أسرة`, 'success');
    } catch (e) {
      showToast('خطأ: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const exportMembers = async () => {
    if (!canExport) return showToast('لا تملك صلاحية التصدير', 'error');
    setLoading(true);
    try {
      const data = await getFullData();
      if (!data.length) return showToast('لا توجد بيانات للتصدير', 'error');
      const rows = [];
      data.forEach((f) => {
        const all = [
          { name: f.head_name, national_id: f.head_id, relation: 'رب الأسرة', dob: f.head_dob, gender: f.head_gender },
          ...(f.family_members || []),
        ];
        all.forEach((m) => {
          rows.push({
            'اسم الفرد': m.name || '',
            'رقم الهوية': m.national_id || '',
            'صلة القرابة': m.relation || '',
            'تاريخ الميلاد': m.dob || '',
            'الجنس': m.gender || '',
            'اسم رب الأسرة': f.head_name || '',
            'المخيم': f.camps?.name || '',
          });
        });
      });
      const campInfo = getCampInfo(filterCamp);
      await exportXLSX(rows, campInfo?.name || 'كل المخيمات', `كشف_الأفراد_${campInfo?.name || 'كل_المخيمات'}`);
      showToast(`تم تصدير ${rows.length} فرد`, 'success');
    } catch (e) {
      showToast('خطأ: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const exportMissing = async () => {
    if (!canExport) return showToast('لا تملك صلاحية التصدير', 'error');
    setLoading(true);
    try {
      const data = await getFullData();
      const missing = data.filter((f) => !f.head_name || !f.head_id || !f.phone1 || !f.camp_id);
      if (!missing.length) return showToast('لا توجد بيانات ناقصة', 'success');
      const rows = missing.map((f, i) => ({
        '#': i + 1,
        'اسم رب الأسرة': f.head_name || '—',
        'رقم الهوية': f.head_id || '—',
        'رقم الجوال': f.phone1 || '—',
        'المخيم': f.camps?.name || '—',
        'النواقص': [!f.head_name && 'الاسم', !f.head_id && 'الهوية', !f.phone1 && 'الجوال', !f.camp_id && 'المخيم']
          .filter(Boolean).join(' + '),
      }));
      await exportXLSX(rows, 'الأسر الناقصة', 'الأسر_الناقصة');
      showToast(`${missing.length} أسرة ناقصة`, 'success');
    } catch (e) {
      showToast('خطأ: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = async () => {
    const rows = [{
      'اسم رب الأسرة*': 'محمد أحمد علي', 'رقم الهوية*': '123456789', 'رقم الجوال*': '0599000000',
      'جوال بديل': '', 'الجنس': 'ذكر', 'الحالة الاجتماعية': 'متزوج', 'تاريخ الميلاد': '1980-01-15',
      'اسم المخيم*': camps[0]?.name || 'مخيم السلام', 'الخيمة': 'A1', 'المنطقة الأصلية': 'غزة', 'ملاحظات': '',
    }];
    await exportXLSX(rows, 'قالب الاستيراد', 'قالب_استيراد_الأسر');
    showToast('تم تحميل القالب', 'success');
  };

  const handleImport = async () => {
    if (!canImport) return showToast('لا تملك صلاحية الاستيراد', 'error');
    setLoading(true);
    try {
      const result = await pickAndParseXLSX();
      if (!result || !result.rows.length) return;
      const { data: existing } = await supabase.from('families').select('head_id').eq('org_id', orgId);
      const existingIds = new Set((existing || []).map((f) => f.head_id).filter(Boolean));
      const campMap = Object.fromEntries(camps.map((c) => [c.name.trim(), c.id]));

      const preview = result.rows
        .filter((r) => r['اسم رب الأسرة*'] || r['اسم رب الأسرة'])
        .map((r) => {
          const headId = String(r['رقم الهوية*'] || r['رقم الهوية'] || '').trim();
          const campName = String(r['اسم المخيم*'] || r['المخيم'] || '').trim();
          return {
            head_name: String(r['اسم رب الأسرة*'] || r['اسم رب الأسرة'] || '').trim(),
            head_id: headId,
            phone1: String(r['رقم الجوال*'] || r['رقم الجوال'] || '').trim(),
            phone2: String(r['جوال بديل'] || '').trim() || null,
            head_gender: String(r['الجنس'] || 'ذكر').trim(),
            head_marital: String(r['الحالة الاجتماعية'] || '').trim() || null,
            head_dob: String(r['تاريخ الميلاد'] || '').trim() || null,
            camp_id: campMap[campName] || null,
            campName,
            tent: String(r['الخيمة'] || '').trim() || null,
            original_address: String(r['المنطقة الأصلية'] || '').trim() || null,
            notes: String(r['ملاحظات'] || '').trim() || null,
            dup: existingIds.has(headId),
            valid: !!(r['اسم رب الأسرة*'] || r['اسم رب الأسرة']) && !!headId,
          };
        });
      setImportPreview(preview);
    } catch (e) {
      showToast('خطأ: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    setImporting(true);
    let ok = 0, err = 0;
    try {
      for (const row of importPreview.filter((r) => r.valid && !r.dup)) {
        const { dup, valid, campName, ...fam } = row;
        const result = await createFamily({ org_id: orgId, ...fam, category_tags: [] });
        if (result.success) ok++; else err++;
      }
      const skip = importPreview.filter((r) => r.dup).length;
      showToast(`${ok} استُورد | ${skip} مكرر${err ? ` | ${err} خطأ` : ''}`, 'success');
      setImportPreview(null);
    } catch (e) {
      showToast('خطأ: ' + e.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const campOptions = [{ value: '', label: '🏕️ كل المخيمات' }, ...camps.map((c) => ({ value: c.id, label: c.name }))];

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader icon="💾" title="استيراد وتصدير" />

        <SelectField
          value={campOptions.find((o) => o.value === filterCamp)?.label}
          placeholder="🏕️ كل المخيمات"
          options={campOptions}
          onSelect={setFilterCamp}
        />

        <View style={styles.bannerRow}>
          <Switch value={showBanner} onValueChange={setShowBanner} trackColor={{ true: colors.accent }} />
          <Text style={styles.bannerLabel}>إظهار بيانات المخيم بأعلى الكشف</Text>
        </View>

        <FormSection title="📥 تصدير Excel">
          {canExport ? (
            <>
              <Pressable style={styles.btnPrimary} onPress={exportFamilies} disabled={loading}>
                <Text style={styles.btnPrimaryText}>👨‍👩‍👧 كشف رباب الأسر</Text>
              </Pressable>
              <Pressable style={styles.btnBlue} onPress={exportMembers} disabled={loading}>
                <Text style={styles.btnBlueText}>👤 كشف أفراد الأسر</Text>
              </Pressable>
              <Pressable style={styles.btnRed} onPress={exportMissing} disabled={loading}>
                <Text style={styles.btnRedText}>⚠️ الأسر الناقصة</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.lockedText}>🔒 لا تملك صلاحية التصدير</Text>
          )}
        </FormSection>

        <FormSection title="📤 استيراد Excel">
          {canImport ? (
            <>
              <Pressable style={styles.btnOutline} onPress={downloadTemplate}>
                <Text style={styles.btnOutlineText}>📋 تحميل قالب الاستيراد</Text>
              </Pressable>
              <Pressable style={styles.btnPrimary} onPress={handleImport} disabled={loading}>
                <Text style={styles.btnPrimaryText}>📂 اختيار ملف Excel</Text>
              </Pressable>

              {importPreview && (
                <View style={{ marginTop: 10 }}>
                  <View style={styles.statsRow}>
                    <Text style={styles.statWhite}>{importPreview.length} سجل</Text>
                    <Text style={styles.statGreen}>✅ {importPreview.filter((r) => r.valid && !r.dup).length} جديد</Text>
                    <Text style={styles.statAccent}>🔁 {importPreview.filter((r) => r.dup).length} مكرر</Text>
                    <Text style={styles.statRed}>❌ {importPreview.filter((r) => !r.valid).length} ناقص</Text>
                  </View>
                  <ScrollView style={{ maxHeight: 180, marginVertical: 10 }}>
                    {importPreview.map((r, i) => (
                      <View
                        key={i}
                        style={[
                          styles.previewRow,
                          { backgroundColor: r.dup ? 'rgba(245,158,11,0.1)' : r.valid ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' },
                        ]}
                      >
                        <Text style={styles.previewName}>{r.head_name}</Text>
                        <Text>{r.dup ? '🔁' : r.valid ? '✅' : '❌'}</Text>
                      </View>
                    ))}
                  </ScrollView>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable style={[styles.btnPrimary, { flex: 1 }]} onPress={confirmImport} disabled={importing}>
                      <Text style={styles.btnPrimaryText}>{importing ? '⏳ جاري الاستيراد...' : '✅ تأكيد الاستيراد'}</Text>
                    </Pressable>
                    <Pressable style={[styles.btnOutline, { flex: 1 }]} onPress={() => setImportPreview(null)}>
                      <Text style={styles.btnOutlineText}>إلغاء</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </>
          ) : (
            <Text style={styles.lockedText}>🔒 لا تملك صلاحية الاستيراد</Text>
          )}
        </FormSection>

        {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },

  bannerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 12 },
  bannerLabel: { color: colors.white, fontSize: 12, fontWeight: 'bold' },

  btnPrimary: { backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  btnPrimaryText: { color: colors.bg, fontWeight: '900', fontSize: 13 },
  btnBlue: { backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  btnBlueText: { color: colors.blue, fontWeight: 'bold', fontSize: 13 },
  btnRed: { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnRedText: { color: colors.red, fontWeight: 'bold', fontSize: 13 },
  btnOutline: { backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', paddingVertical: 11, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  btnOutlineText: { color: colors.accent, fontWeight: 'bold', fontSize: 12 },
  lockedText: { color: colors.red, fontSize: 12, textAlign: 'center', paddingVertical: 12 },

  statsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  statWhite: { color: colors.white, fontWeight: 'bold', fontSize: 11 },
  statGreen: { color: colors.green, fontSize: 11 },
  statAccent: { color: colors.accent, fontSize: 11 },
  statRed: { color: colors.red, fontSize: 11 },
  previewRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginBottom: 4 },
  previewName: { color: colors.white, fontSize: 11 },
});
