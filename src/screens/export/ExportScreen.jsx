import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, SafeAreaView, ActivityIndicator, Switch } from 'react-native';
import { supabase, fetchCamps, fetchOrgMembers, createFamily } from '../../lib/supabase';
import NetInfo from '@react-native-community/netinfo';
import { cacheData, getCachedData } from '../../lib/offlineCache';
import { formatDateTime } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { hasPermission } from '../../lib/permissions';
import { exportXLSX, pickAndParseXLSX } from '../../lib/excelIO';
import { calcAge, isAgeInRange, getCampDelegateInfo } from '../../lib/helpers';
import { FAM_COLS, MEM_COLS, findWife, resolveFamilyColumn, resolveMemberColumn } from '../../lib/exportColumns';
import PageHeader from '../../components/ui/PageHeader';
import SelectField from '../../components/ui/SelectField';
import FormSection from '../../components/ui/FormSection';
import { showToast } from '../../utils/toast';
import colors from '../../theme/colors';

/** منتقي حقول قابل للطي — كل حقل يبدأ غير محدد، وكل ما تضغط حقل ياخذ
 * الرقم التسلسلي التالي حسب ترتيب ضغطك (مو ترتيب ثابت بالقائمة). لما تلغي
 * تحديد حقل بالنص، يُعاد ترقيم الحقول اللي بعده عشان يضلوا متسلسلين بلا فجوات.
 * ترتيب الأرقام هذا هو نفسه ترتيب الأعمدة بالملف المُصدَّر. */
function FieldPicker({ title, cols, onChange }) {
  const [open, setOpen] = useState(false);
  const selectedCount = cols.filter((c) => c.order > 0).length;

  const toggle = (key) => {
    const current = cols.find((c) => c.key === key);
    if (current.order > 0) {
      // إلغاء التحديد: صفّر رقمه، وأنزل رقم كل حقل كان بعده بواحد
      const removedOrder = current.order;
      onChange(
        cols.map((c) => {
          if (c.key === key) return { ...c, order: 0 };
          if (c.order > removedOrder) return { ...c, order: c.order - 1 };
          return c;
        })
      );
    } else {
      // تحديد جديد: ياخذ الرقم التالي بعد آخر رقم مستخدم
      const maxOrder = Math.max(0, ...cols.map((c) => c.order));
      onChange(cols.map((c) => (c.key === key ? { ...c, order: maxOrder + 1 } : c)));
    }
  };
  const selectAll = () => onChange(cols.map((c, i) => ({ ...c, order: i + 1 })));
  const selectNone = () => onChange(cols.map((c) => ({ ...c, order: 0 })));

  return (
    <View style={styles.fieldPicker}>
      <Pressable style={styles.fieldPickerHeader} onPress={() => setOpen((o) => !o)}>
        <Text style={styles.fieldPickerTitle}>{title} ({selectedCount})</Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open && (
        <View style={styles.fieldPickerBody}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <Pressable style={styles.miniBtn} onPress={selectAll}><Text style={styles.miniBtnText}>الكل</Text></Pressable>
            <Pressable style={styles.miniBtn} onPress={selectNone}><Text style={styles.miniBtnText}>لا شيء</Text></Pressable>
          </View>
          <View style={styles.chipsWrap}>
            {cols.map((c) => (
              <Pressable
                key={c.key}
                onPress={() => toggle(c.key)}
                style={[styles.chip, c.order > 0 && styles.chipActive]}
              >
                {c.order > 0 && (
                  <View style={styles.chipOrderBadge}>
                    <Text style={styles.chipOrderText}>{c.order}</Text>
                  </View>
                )}
                <Text style={[styles.chipText, c.order > 0 && styles.chipTextActive]}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

/** يفرز الحقول المحددة حسب رقم ترتيب اختيارها (تصاعدياً) -- هذا الترتيب
 * هو ترتيب الأعمدة الفعلي بملف الإكسل المُصدَّر. */
const orderedSelected = (cols) => cols.filter((c) => c.order > 0).sort((a, b) => a.order - b.order);

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

  // اختيار الحقول — التصدير السريع
  const [famCols, setFamCols] = useState(() => FAM_COLS.map((c) => ({ ...c, order: 0 })));
  const [memCols, setMemCols] = useState(() => MEM_COLS.map((c) => ({ ...c, order: 0 })));

  // ── التصدير المخصص ──
  const [allFamilies, setAllFamilies] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [cxMode, setCxMode] = useState('families');
  const [cxCamp, setCxCamp] = useState('');
  const [cxSearch, setCxSearch] = useState('');
  const [cxAgeMin, setCxAgeMin] = useState('');
  const [cxAgeMax, setCxAgeMax] = useState('');
  const [cxSelected, setCxSelected] = useState(new Set());
  const [cxSheetName, setCxSheetName] = useState('كشف مخصص');
  const [cxFamCols, setCxFamCols] = useState(() => FAM_COLS.map((c) => ({ ...c, order: 0 })));
  const [cxMemCols, setCxMemCols] = useState(() => MEM_COLS.map((c) => ({ ...c, order: 0 })));
  const [offlineInfo, setOfflineInfo] = useState(null);

  const loadMeta = useCallback(async () => {
    if (!orgId) return;

    // 1) اعرض النسخة المحفوظة فوراً (لو موجودة) — بدون انتظار الشبكة.
    const cached = await getCachedData('export_meta', profile?.id);
    const hadCache = !!cached?.data;
    if (hadCache) {
      setCamps(cached.data.camps || []);
      setOrgMembers(cached.data.orgMembers || []);
      setAllFamilies(cached.data.families || []);
      setAllMembers(cached.data.members || []);
      setOfflineInfo({ savedAt: cached.savedAt });
    }

    // 2) بعدين حاول تحديث حي بالخلفية.
    try {
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        if (!hadCache) showToast('لا يوجد اتصال ولا توجد بيانات محفوظة', 'error');
        return;
      }

      const [c, om] = await Promise.all([fetchCamps(orgId), fetchOrgMembers(orgId)]);
      const allCamps = c || [];
      const campIds = getAllowedCampIds(allCamps);
      const visibleCamps = getVisibleCamps(allCamps);

      // تحميل كل الأسر والأفراد ضمن النطاق المسموح — لكل من التصدير السريع والمخصص
      const { data: fams } = await supabase
        .from('families')
        .select('*, family_members(*)')
        .eq('org_id', orgId)
        .eq('_deleted', false);
      const scopedFams = filterLocal(fams || [], campIds);
      const mems = [];
      scopedFams.forEach((f) => (f.family_members || []).forEach((m) => mems.push({ ...m, family_id: f.id })));

      setCamps(visibleCamps);
      setOrgMembers(om || []);
      setAllFamilies(scopedFams);
      setAllMembers(mems);
      setOfflineInfo(null);
      cacheData('export_meta', profile?.id, { camps: visibleCamps, orgMembers: om || [], families: scopedFams, members: mems });
    } catch (e) {
      if (!hadCache) showToast('تعذّر تحميل البيانات ولا توجد نسخة محفوظة', 'error');
    }
  }, [orgId, getAllowedCampIds, filterLocal, getVisibleCamps, profile?.id]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  const getCampInfo = (campId) => {
    if (!campId) return null;
    const camp = camps.find((c) => c.id === campId);
    if (!camp) return null;
    const delegate = getCampDelegateInfo(camp, orgMembers);
    return { name: camp.name, delegateName: delegate?.name, delegatePhone: delegate?.phone };
  };

  const bannerNote = (campInfo) =>
    showBanner && campInfo ? `${campInfo.name} — ${campInfo.delegateName || '—'} — ${campInfo.delegatePhone || '—'}` : null;

  // بدل إعادة الطلب من السيرفر كل مرة، نفلتر من allFamilies المحمّلة أصلاً
  // (بواسطة loadMeta) — هذا يخلي التصدير السريع يشتغل حتى بدون اتصال، طالما
  // الشاشة فُتحت أونلاين قبل مرة بنفس الجلسة أو فيه نسخة محفوظة محلياً.
  const getFullData = async () => {
    const list = filterCamp ? allFamilies.filter((f) => f.camp_id === filterCamp) : allFamilies;
    return list.map((f) => ({ ...f, camps: { id: f.camp_id, name: campMap[f.camp_id] || '' } }));
  };

  // ── تصدير سريع: رباب الأسر (بالحقول المختارة) ──
  const exportFamilies = async () => {
    if (!canExport) return showToast('لا تملك صلاحية التصدير', 'error');
    const selectedCols = orderedSelected(famCols);
    if (!selectedCols.length) return showToast('اختر حقلاً واحداً على الأقل', 'error');
    setLoading(true);
    try {
      const data = await getFullData();
      if (!data.length) return showToast('لا توجد بيانات للتصدير', 'error');
      const sorted = [...data].sort((a, b) => String(a.tent || '').localeCompare(String(b.tent || ''), 'ar', { numeric: true }));
      const campInfo = getCampInfo(filterCamp);
      const rows = sorted.map((f) => {
        const wife = findWife(f.family_members);
        const row = {};
        if (bannerNote(campInfo)) row['بيانات المخيم'] = bannerNote(campInfo);
        selectedCols.forEach((col) => {
          row[col.label] = resolveFamilyColumn(col.key, f, { membersCount: (f.family_members?.length || 0) + 1, wife });
        });
        return row;
      });
      await exportXLSX(rows, campInfo?.name || 'كل المخيمات', `كشف_الأسر_${campInfo?.name || 'كل_المخيمات'}`);
      showToast(`تم تصدير ${data.length} أسرة`, 'success');
    } catch (e) {
      showToast('خطأ: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── تصدير سريع: أفراد الأسر (بالحقول المختارة) ──
  const exportMembers = async () => {
    if (!canExport) return showToast('لا تملك صلاحية التصدير', 'error');
    const selectedCols = orderedSelected(memCols);
    if (!selectedCols.length) return showToast('اختر حقلاً واحداً على الأقل', 'error');
    setLoading(true);
    try {
      const data = await getFullData();
      if (!data.length) return showToast('لا توجد بيانات للتصدير', 'error');
      const campInfo = getCampInfo(filterCamp);
      const rows = [];
      data.forEach((f) => {
        const all = [
          { name: f.head_name, national_id: f.head_id, relation: 'رب الأسرة', dob: f.head_dob, gender: f.head_gender },
          ...(f.family_members || []),
        ];
        all.forEach((m) => {
          const row = {};
          if (bannerNote(campInfo)) row['بيانات المخيم'] = bannerNote(campInfo);
          selectedCols.forEach((col) => { row[col.label] = resolveMemberColumn(col.key, m, f); });
          rows.push(row);
        });
      });
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
        '#': i + 1, 'اسم رب الأسرة': f.head_name || '—', 'رقم الهوية': f.head_id || '—',
        'رقم الجوال': f.phone1 || '—', 'المخيم': f.camps?.name || '—',
        'النواقص': [!f.head_name && 'الاسم', !f.head_id && 'الهوية', !f.phone1 && 'الجوال', !f.camp_id && 'المخيم'].filter(Boolean).join(' + '),
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

  // ═══════════════ التصدير المخصص ═══════════════

  const wifeMap = useMemo(() => {
    const m = {};
    allFamilies.forEach((f) => {
      const wife = findWife(f.family_members);
      if (wife) m[f.id] = wife;
    });
    return m;
  }, [allFamilies]);

  const membersCountMap = useMemo(() => {
    const m = {};
    allFamilies.forEach((f) => { m[f.id] = f.family_members?.length || 0; });
    return m;
  }, [allFamilies]);

  const campMap = useMemo(() => Object.fromEntries(camps.map((c) => [c.id, c.name])), [camps]);

  const autoDelegate = useMemo(() => {
    if (!cxCamp) return null;
    return orgMembers.find((m) => m.camp_id === cxCamp && m.role === 'camp_delegate')
      || orgMembers.find((m) => m.id === camps.find((c) => c.id === cxCamp)?.manager_id)
      || null;
  }, [cxCamp, orgMembers, camps]);

  const cxFilteredFams = useMemo(() => {
    return allFamilies
      .filter((f) => {
        if (cxCamp && f.camp_id !== cxCamp) return false;
        if (cxSearch && !(f.head_name || '').includes(cxSearch) && !(f.tent || '').includes(cxSearch)) return false;
        return true;
      })
      .sort((a, b) => String(a.tent || '').localeCompare(String(b.tent || ''), 'ar', { numeric: true }));
  }, [allFamilies, cxCamp, cxSearch]);

  const cxFilteredMems = useMemo(() => {
    if (cxMode !== 'members') return [];
    return allMembers
      .filter((m) => {
        const fam = allFamilies.find((f) => f.id === m.family_id);
        if (!fam) return false;
        if (cxCamp && fam.camp_id !== cxCamp) return false;
        if (cxSearch && !(m.name || '').includes(cxSearch) && !(fam.head_name || '').includes(cxSearch)) return false;
        if (cxAgeMin !== '' || cxAgeMax !== '') {
          if (!isAgeInRange(m.dob, cxAgeMin, cxAgeMax)) return false;
        }
        return true;
      })
      .map((m) => {
        const fam = allFamilies.find((f) => f.id === m.family_id) || {};
        return { ...m, fam_name: fam.head_name || '—', head_id: fam.head_id || '—', phone1: fam.phone1 || '—', tent: fam.tent || '—', camp: campMap[fam.camp_id] || '—', age: calcAge(m.dob) };
      })
      .sort((a, b) => String(a.tent || '').localeCompare(String(b.tent || ''), 'ar', { numeric: true }));
  }, [allMembers, allFamilies, cxCamp, cxSearch, cxMode, cxAgeMin, cxAgeMax, campMap]);

  const cxList = cxMode === 'families' ? cxFilteredFams : cxFilteredMems;

  const cxToggleOne = (id) => setCxSelected((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const cxSelectAll = () => setCxSelected(new Set(cxList.map((x) => x.id)));
  const cxDeselectAll = () => setCxSelected(new Set());
  const cxSwitchMode = (m) => { setCxMode(m); setCxSelected(new Set()); };

  const doCustomExport = async () => {
    const isMem = cxMode === 'members';
    const cols = orderedSelected(isMem ? cxMemCols : cxFamCols);
    if (!cols.length || !cxSelected.size) return showToast('اختر حقولاً وعناصر أولاً', 'error');
    setLoading(true);
    try {
      const showBnr = !!cxCamp;
      let rows = [];
      if (!isMem) {
        const selFams = cxFilteredFams.filter((f) => cxSelected.has(f.id));
        rows = selFams.map((f, fi) => {
          const wife = wifeMap[f.id];
          const row = { '#': fi + 1 };
          cols.forEach((col) => {
            if (col.key === 'camp') row[col.label] = campMap[f.camp_id] || '—';
            else if (col.key === 'members_count') row[col.label] = membersCountMap[f.id] || 0;
            else if (col.key === 'wife_name') row[col.label] = wife?.name || '—';
            else if (col.key === 'wife_id') row[col.label] = wife?.national_id || '—';
            else row[col.label] = f[col.key] || '';
          });
          return row;
        });
      } else {
        const selMems = cxFilteredMems.filter((m) => cxSelected.has(m.id));
        rows = selMems.map((m, mi) => {
          const row = { '#': mi + 1 };
          cols.forEach((col) => { row[col.label] = m[col.key] ?? ''; });
          return row;
        });
      }
      if (showBnr) {
        const camp = camps.find((c) => c.id === cxCamp);
        rows = rows.map((r) => ({ 'المخيم': camp?.name || '', 'المندوب': autoDelegate?.full_name || '—', ...r }));
      }
      await exportXLSX(rows, cxSheetName.slice(0, 31) || 'كشف مخصص', cxSheetName || 'كشف_مخصص');
      showToast(`تم تصدير ${cxSelected.size} ${isMem ? 'فرد' : 'أسرة'}`, 'success');
    } catch (e) {
      showToast('خطأ: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const campOptions = [{ value: '', label: '🏕️ كل المخيمات' }, ...camps.map((c) => ({ value: c.id, label: c.name }))];
  const cxCampOptions = [{ value: '', label: '🏕️ كل المخيمات (بدون بانر)' }, ...camps.map((c) => ({ value: c.id, label: c.name }))];

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader icon="💾" title="استيراد وتصدير" />

        {!!offlineInfo && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineBannerText}>
              📡 لا يوجد اتصال — بيانات محفوظة من {formatDateTime(offlineInfo.savedAt)}، قد تكون غير محدّثة (الاستيراد غير متاح الآن)
            </Text>
          </View>
        )}

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

        <FormSection title="📥 تصدير سريع Excel">
          {canExport ? (
            <>
              <FieldPicker title="📋 حقول رباب الأسر" cols={famCols} onChange={setFamCols} />
              <Pressable style={styles.btnPrimary} onPress={exportFamilies} disabled={loading}>
                <Text style={styles.btnPrimaryText}>👨‍👩‍👧 تصدير كشف رباب الأسر</Text>
              </Pressable>

              <FieldPicker title="📋 حقول الأفراد" cols={memCols} onChange={setMemCols} />
              <Pressable style={styles.btnBlue} onPress={exportMembers} disabled={loading}>
                <Text style={styles.btnBlueText}>👤 تصدير كشف أفراد الأسر</Text>
              </Pressable>

              <Pressable style={styles.btnRed} onPress={exportMissing} disabled={loading}>
                <Text style={styles.btnRedText}>⚠️ الأسر الناقصة</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.lockedText}>🔒 لا تملك صلاحية التصدير</Text>
          )}
        </FormSection>

        {canExport && (
          <FormSection title={`🎯 تصدير مخصص (${allFamilies.length} أسرة محمّلة)`}>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <Pressable style={[styles.modeBtn, cxMode === 'families' && styles.modeBtnActive]} onPress={() => cxSwitchMode('families')}>
                <Text style={[styles.modeBtnText, cxMode === 'families' && styles.modeBtnTextActive]}>👨‍👩‍👧 رباب الأسر</Text>
              </Pressable>
              <Pressable style={[styles.modeBtn, cxMode === 'members' && styles.modeBtnActive]} onPress={() => cxSwitchMode('members')}>
                <Text style={[styles.modeBtnText, cxMode === 'members' && styles.modeBtnTextActive]}>👤 أفراد الأسر</Text>
              </Pressable>
            </View>

            <TextInput
              value={cxSheetName}
              onChangeText={setCxSheetName}
              placeholder="اسم الكشف..."
              placeholderTextColor={colors.muted}
              style={styles.textInput}
            />

            <SelectField
              value={cxCampOptions.find((o) => o.value === cxCamp)?.label}
              placeholder="🏕️ كل المخيمات (بدون بانر)"
              options={cxCampOptions}
              onSelect={(v) => { setCxCamp(v); setCxSelected(new Set()); }}
            />
            {!!cxCamp && (
              <Text style={[styles.delegateNote, autoDelegate ? styles.delegateOk : styles.delegateWarn]}>
                {autoDelegate ? `✅ المندوب: ${autoDelegate.full_name} — ${autoDelegate.phone || '—'}` : '⚠️ لا يوجد مندوب لهذا المخيم'}
              </Text>
            )}

            {cxMode === 'members' && (
              <View style={styles.ageRow}>
                <Text style={styles.ageLabel}>العمر من</Text>
                <TextInput value={cxAgeMin} onChangeText={setCxAgeMin} keyboardType="number-pad" placeholder="—" placeholderTextColor={colors.muted} style={[styles.textInput, { flex: 1, marginBottom: 0 }]} />
                <Text style={styles.ageLabel}>إلى</Text>
                <TextInput value={cxAgeMax} onChangeText={setCxAgeMax} keyboardType="number-pad" placeholder="—" placeholderTextColor={colors.muted} style={[styles.textInput, { flex: 1, marginBottom: 0 }]} />
              </View>
            )}

            <View style={styles.pickerBox}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>
                  {cxMode === 'families' ? '👨‍👩‍👧 اختر الأسر' : '👤 اختر الأفراد'}
                  <Text style={styles.pickerCount}> ({cxSelected.size} من {cxList.length})</Text>
                </Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable style={styles.miniBtn} onPress={cxSelectAll}><Text style={styles.miniBtnText}>الكل</Text></Pressable>
                  <Pressable style={styles.miniBtn} onPress={cxDeselectAll}><Text style={styles.miniBtnText}>لا شيء</Text></Pressable>
                </View>
              </View>
              <TextInput
                value={cxSearch}
                onChangeText={setCxSearch}
                placeholder="🔍 ابحث بالاسم أو الخيمة..."
                placeholderTextColor={colors.muted}
                style={[styles.textInput, { marginTop: 8 }]}
              />
              <ScrollView style={styles.pickerList} nestedScrollEnabled>
                {cxList.length === 0 ? (
                  <Text style={styles.emptyListText}>لا توجد نتائج</Text>
                ) : (
                  cxList.slice(0, 200).map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => cxToggleOne(item.id)}
                      style={[styles.pickerRow, cxSelected.has(item.id) && styles.pickerRowActive]}
                    >
                      <Text style={styles.checkbox}>{cxSelected.has(item.id) ? '☑' : '☐'}</Text>
                      <Text style={styles.pickerTent}>⛺{item.tent || '—'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickerName} numberOfLines={1}>{cxMode === 'families' ? item.head_name : item.name}</Text>
                        {cxMode === 'members' && <Text style={styles.pickerSub}>{item.relation || '—'} • {item.fam_name}</Text>}
                      </View>
                      {cxMode === 'families' && <Text style={styles.pickerSub}>{membersCountMap[item.id] || 0} فرد</Text>}
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>

            <FieldPicker
              title={cxMode === 'families' ? '📋 حقول رباب الأسر (مع الزوجة)' : '📋 حقول الأفراد'}
              cols={cxMode === 'families' ? cxFamCols : cxMemCols}
              onChange={cxMode === 'families' ? setCxFamCols : setCxMemCols}
            />

            <Pressable style={[styles.btnPrimary, cxSelected.size === 0 && styles.btnDisabled]} onPress={doCustomExport} disabled={loading || cxSelected.size === 0}>
              <Text style={styles.btnPrimaryText}>
                📥 تصدير {cxSelected.size > 0 ? `${cxSelected.size} ${cxMode === 'families' ? 'أسرة' : 'فرد'}` : ''}
              </Text>
            </Pressable>
          </FormSection>
        )}

        <FormSection title="📤 استيراد Excel">
          {canImport && !offlineInfo ? (
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
            <Text style={styles.lockedText}>
              {!canImport ? '🔒 لا تملك صلاحية الاستيراد' : '📡 الاستيراد يتطلب اتصالاً بالإنترنت'}
            </Text>
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
  offlineBanner: {
    backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
    borderRadius: 12, padding: 10, marginBottom: 12,
  },
  offlineBannerText: { color: colors.accent, fontSize: 11, textAlign: 'right', lineHeight: 17 },
  bannerLabel: { color: colors.white, fontSize: 12, fontWeight: 'bold' },

  btnPrimary: { backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  btnPrimaryText: { color: colors.bg, fontWeight: '900', fontSize: 13 },
  btnDisabled: { opacity: 0.4 },
  btnBlue: { backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  btnBlueText: { color: colors.blue, fontWeight: 'bold', fontSize: 13 },
  btnRed: { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnRedText: { color: colors.red, fontWeight: 'bold', fontSize: 13 },
  btnOutline: { backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', paddingVertical: 11, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  btnOutlineText: { color: colors.accent, fontWeight: 'bold', fontSize: 12 },
  lockedText: { color: colors.red, fontSize: 12, textAlign: 'center', paddingVertical: 12 },

  textInput: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, color: colors.white, fontSize: 13, marginBottom: 12, textAlign: 'right',
  },

  fieldPicker: { backgroundColor: colors.surface2, borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  fieldPickerHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  fieldPickerTitle: { color: colors.accent, fontWeight: '900', fontSize: 12 },
  chevron: { color: colors.muted, fontSize: 10 },
  fieldPickerBody: { paddingHorizontal: 12, paddingBottom: 12 },
  chipsWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: colors.accent },
  chipText: { color: colors.muted, fontSize: 11 },
  chipTextActive: { color: colors.accent, fontWeight: 'bold' },
  chipOrderBadge: { backgroundColor: colors.accent, borderRadius: 999, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  chipOrderText: { color: colors.bg, fontSize: 9, fontWeight: '900' },

  miniBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  miniBtnText: { color: colors.muted, fontSize: 10 },

  modeBtn: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  modeBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  modeBtnText: { color: colors.muted, fontWeight: '900', fontSize: 12 },
  modeBtnTextActive: { color: colors.bg },

  delegateNote: { fontSize: 11, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10, textAlign: 'right' },
  delegateOk: { color: colors.green, backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' },
  delegateWarn: { color: colors.muted, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },

  ageRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 12 },
  ageLabel: { color: colors.muted, fontSize: 12, fontWeight: 'bold' },

  pickerBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 10 },
  pickerHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  pickerTitle: { color: colors.accent, fontWeight: '900', fontSize: 12 },
  pickerCount: { color: colors.muted, fontWeight: 'normal' },
  pickerList: { maxHeight: 260, marginTop: 8, overflow: 'hidden' },
  emptyListText: { color: colors.muted, fontSize: 12, textAlign: 'center', paddingVertical: 16 },
  pickerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 8, marginBottom: 2 },
  pickerRowActive: { backgroundColor: 'rgba(245,158,11,0.1)' },
  checkbox: { color: colors.accent, fontSize: 16 },
  pickerTent: { color: colors.accent, fontSize: 11, fontWeight: 'bold', width: 40, textAlign: 'center' },
  pickerName: { color: colors.white, fontSize: 12 },
  pickerSub: { color: colors.muted, fontSize: 10 },

  statsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  statWhite: { color: colors.white, fontWeight: 'bold', fontSize: 11 },
  statGreen: { color: colors.green, fontSize: 11 },
  statAccent: { color: colors.accent, fontSize: 11 },
  statRed: { color: colors.red, fontSize: 11 },
  previewRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginBottom: 4 },
  previewName: { color: colors.white, fontSize: 11 },
});
