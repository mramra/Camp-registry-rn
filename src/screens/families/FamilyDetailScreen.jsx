import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../context/AuthContext';
import { fetchFamilyById, fetchFamilyMembers, exitFamily, fetchCamps, fetchFamilies } from '../../lib/supabase';
import { calcAge, checkFamilyIssues, getMemberIcon, arrLabel } from '../../lib/helpers';
import { formatDate, formatDateTime } from '../../lib/utils';
import { showError, showSuccess } from '../../utils/toast';
import EmptyState from '../../components/ui/EmptyState';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import FormInput from '../../components/ui/FormInput';
import colors from '../../theme/colors';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';

const todayStr = () => new Date().toISOString().slice(0, 10);

const ORPHAN_LABELS = { father: 'يتيم الأب', mother: 'يتيم الأم', both: 'يتيم الأبوين' };

/** يبني قائمة شارات الحالة الصحية لشخص (رب أسرة أو فرد) — تُعرض فقط لو
 * عنده حالة واحدة على الأقل مسجَّلة. */
function buildHealthBadges({ disabilities, injuries, chronic_diseases, female_status, needs, orphan_status }) {
  const badges = [];
  const dis = arrLabel(disabilities);
  const inj = arrLabel(injuries);
  const chr = arrLabel(chronic_diseases);
  const fem = arrLabel(female_status);
  const nds = arrLabel(needs);
  if (dis) badges.push({ icon: '🦽', label: dis, color: colors.purple });
  if (inj) badges.push({ icon: '🩹', label: inj, color: colors.accent });
  if (chr) badges.push({ icon: '💊', label: chr, color: colors.orange });
  if (fem) badges.push({ icon: '♀️', label: fem, color: colors.pink });
  if (nds) badges.push({ icon: '🦯', label: nds, color: colors.blue });
  if (orphan_status) badges.push({ icon: '👶', label: ORPHAN_LABELS[orphan_status] || orphan_status, color: colors.red });
  return badges;
}

export default function FamilyDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { familyId } = route.params || {};
  const { canEdit, canDelete, profile, user, orgId } = useAuth();

  const [family, setFamily] = useState(null);
  const [members, setMembers] = useState([]);
  const [campName, setCampName] = useState('');
  const [loading, setLoading] = useState(true);
  const [exitModalVisible, setExitModalVisible] = useState(false);
  const [exitDate, setExitDate] = useState(todayStr());
  const [exitReason, setExitReason] = useState('');
  const [exitSaving, setExitSaving] = useState(false);
  const [offlineInfo, setOfflineInfo] = useState(null);
  const [duplicates, setDuplicates] = useState([]);

  const load = useCallback(async () => {
    if (!familyId) return;

    // 1) اعرض النسخة المحفوظة فوراً (لو موجودة) — بدون انتظار الشبكة.
    const directCached = await getCachedData(`family_detail_${familyId}`, profile?.id);
    let hadCache = !!directCached?.data;
    if (hadCache) {
      setFamily(directCached.data.family);
      setMembers(directCached.data.members || []);
      setCampName(directCached.data.campName || '');
      setOfflineInfo({ savedAt: directCached.savedAt });
      setLoading(false);
    } else {
      // احتياط فوري: لو ما فُتحت هذي الأسرة تحديداً قبل، جرّب نسخة قائمة
      // الأسر المحفوظة (فيها كل الأسر ضمن نطاقك) بدل انتظار الشبكة.
      const listCached = await getCachedData('families_list', profile?.id);
      const famFromList = listCached?.data?.families?.find((f) => f.id === familyId);
      if (famFromList) {
        hadCache = true;
        const memsFromList = (listCached.data.members || []).filter((m) => m.family_id === familyId);
        const campFromList = listCached.data.camps?.find((c) => c.id === famFromList.camp_id)?.name || '';
        setFamily(famFromList);
        setMembers(memsFromList);
        setCampName(campFromList);
        setOfflineInfo({ savedAt: listCached.savedAt });
        setLoading(false);
      }
    }

    // 2) بعدين حاول تحديث حي بالخلفية.
    try {
      const net = await withTimeout(NetInfo.fetch(), 4000, 'تعذّر تحديد حالة الاتصال');
      if (!net.isConnected) {
        if (!hadCache) showError('لا يوجد اتصال ولا توجد بيانات محفوظة');
        return;
      }

      const data = await withTimeout(fetchFamilyById(familyId), 12000, 'انتهت مهلة تحميل البيانات');
      if (!data) {
        if (!hadCache) showError('لم يتم العثور على الأسرة');
        return;
      }

      const [mems, camps] = await withTimeout(
        Promise.all([
          fetchFamilyMembers([familyId]),
          data.org_id ? fetchCamps(data.org_id) : Promise.resolve([]),
        ]),
        12000,
        'انتهت مهلة تحميل البيانات'
      );
      const resolvedCampName = camps.find((c) => c.id === data.camp_id)?.name || '';
      setFamily(data);
      setMembers(mems);
      setCampName(resolvedCampName);
      setOfflineInfo(null);
      cacheData(`family_detail_${familyId}`, profile?.id, { family: data, members: mems, campName: resolvedCampName });

      // فحص تكرار رقم الهوية أو الجوال مقابل باقي أسر المنظمة -- تنبيه
      // صامت (بلا حجب) عشان المستخدم يلاحظ ويقرر بنفسه هل هو خطأ إدخال
      // فعلي أو مجرد جوال مشترك بالعائلة الواحدة.
      if (data.org_id) {
        try {
          const allFams = await fetchFamilies(data.org_id);
          const allMems = await fetchFamilyMembers(allFams.map((f) => f.id));
          const famById = Object.fromEntries(allFams.map((f) => [f.id, f]));

          // خريطة: رقم هوية → كل الأسر اللي ظهر فيها (كرب أسرة أو كفرد
          // بأي أسرة) -- عشان نلقط حالة "نفس الشخص مسجّل مرتين: مرة رب
          // أسرة لحاله، ومرة فرد بأسرة ثانية" (بالضبط الحالة اللي طلعت
          // بقائمة الأسر ومو ظاهرة هون قبل هذا التصحيح).
          const idMap = {};
          allFams.forEach((f) => {
            if (!f.head_id) return;
            if (!idMap[f.head_id]) idMap[f.head_id] = [];
            idMap[f.head_id].push({ familyId: f.id, name: f.head_name });
          });
          allMems.forEach((m) => {
            if (!m.national_id) return;
            if (!idMap[m.national_id]) idMap[m.national_id] = [];
            idMap[m.national_id].push({ familyId: m.family_id, name: m.name });
          });

          const dups = [];
          const seenFamilyIds = new Set();

          // تكرار رقم الهوية: رب الأسرة الحالية + كل أفراد الأسرة الحالية
          const currentFamilyMemberIds = allMems
            .filter((m) => m.family_id === familyId && m.national_id)
            .map((m) => m.national_id);
          const idsToCheck = [data.head_id, ...currentFamilyMemberIds];
          idsToCheck.forEach((nid) => {
            if (!nid || !idMap[nid]) return;
            idMap[nid].forEach((entry) => {
              if (entry.familyId === familyId || seenFamilyIds.has(entry.familyId)) return;
              seenFamilyIds.add(entry.familyId);
              dups.push({
                familyId: entry.familyId,
                familyName: famById[entry.familyId]?.head_name || entry.name,
                matchType: `رقم الهوية (${entry.name})`,
              });
            });
          });

          // تكرار رقم الجوال (بين رؤساء الأسر فقط -- الأفراد ما عندهم جوال مسجَّل)
          allFams.forEach((f) => {
            if (f.id === familyId || seenFamilyIds.has(f.id)) return;
            const matched =
              (data.phone1 && f.phone1 && f.phone1 === data.phone1) ||
              (data.phone1 && f.phone2 && f.phone2 === data.phone1);
            if (matched) {
              seenFamilyIds.add(f.id);
              dups.push({ familyId: f.id, familyName: f.head_name, matchType: 'رقم الجوال' });
            }
          });

          setDuplicates(dups);
        } catch {
          // فحص التكرار غير حرج -- تجاهل أي عطل فيه بصمت
        }
      }
    } catch (e) {
      if (!hadCache) showError('تعذّر تحميل بيانات الأسرة ولا توجد نسخة محفوظة');
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  // إعادة تحميل تلقائي عند الرجوع من التعديل
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const handleExit = () => {
    setExitDate(todayStr());
    setExitReason('');
    setExitModalVisible(true);
  };

  const confirmExit = async () => {
    if (!exitDate) return showError('تاريخ الخروج مطلوب');
    setExitSaving(true);
    try {
      const result = await exitFamily(family, {
        date: exitDate,
        reason: exitReason.trim() || null,
        notes: null,
        actorId: profile?.id || user?.id || null,
        orgId: orgId || family.org_id,
      });
      if (result.success) {
        showSuccess('تم تسجيل خروج الأسرة — انتقلت لقائمة "الأسر الخارجة"');
        setExitModalVisible(false);
        navigation.goBack();
      } else {
        showError(result.error || 'فشل تسجيل الخروج');
      }
    } catch (e) {
      showError('خطأ: ' + e.message);
    } finally {
      setExitSaving(false);
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

  if (!family) {
    return (
      <SafeAreaView style={styles.screen}>
        <EmptyState icon="❓" title="لم يتم العثور على الأسرة" />
      </SafeAreaView>
    );
  }

  const issues = checkFamilyIssues(family, members);
  const age = calcAge(family.head_dob);

  const infoRows = [
    ['رقم الهوية', family.head_id],
    ['الجوال', family.phone1],
    ['جوال 2', family.phone2],
    ['الجنس', family.head_gender],
    ['الحالة الاجتماعية', family.head_marital],
    ['المخيم', campName],
    ['الخيمة', family.tent],
    ['المنطقة الأصلية', family.original_address],
    ['العنوان التفصيلي', family.address_details],
    ['تاريخ الميلاد', family.head_dob ? formatDate(family.head_dob) : null],
    ['العمر', age ? `${age} سنة` : null],
    ['تاريخ التسجيل', formatDate(family.created_at)],
  ].filter(([, v]) => v);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {!!offlineInfo && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineBannerText}>
              📡 لا يوجد اتصال — بيانات محفوظة من {formatDateTime(offlineInfo.savedAt)}، قد تكون غير محدّثة (التعديل/تسجيل الخروج غير متاح الآن)
            </Text>
          </View>
        )}

        {duplicates.length > 0 && (
          <View style={styles.dupBox}>
            <Text style={styles.dupTitle}>🔁 بيانات مكررة مع أسرة ثانية</Text>
            {duplicates.map((d, i) => (
              <Pressable
                key={i}
                style={styles.dupBadge}
                onPress={() => navigation.push('FamilyDetail', { familyId: d.familyId })}
              >
                <Text style={styles.dupBadgeText}>
                  {d.matchType} مطابق لأسرة "{d.familyName}" — اضغط للانتقال ←
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {issues.length > 0 && (
          <View style={styles.warnBox}>
            <Text style={styles.warnTitle}>⚠️ {issues.length} نقص في بيانات الأسرة</Text>
            {issues.map((issue, i) => (
              <Text key={i} style={styles.warnItem}>• {issue}</Text>
            ))}
          </View>
        )}

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>👤 رب الأسرة</Text>
          <Text style={styles.headName}>{family.head_name}</Text>
          <View style={styles.grid}>
            {infoRows.map(([label, value]) => (
              <View key={label} style={styles.infoCell}>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={styles.infoValue}>{value}</Text>
              </View>
            ))}
          </View>
          {(() => {
            const headBadges = buildHealthBadges({
              disabilities: family.head_disabilities,
              injuries: family.head_injuries,
              chronic_diseases: family.head_chronic_diseases,
              female_status: family.head_female_status,
              needs: family.head_needs,
              orphan_status: family.head_orphan_status,
            });
            return headBadges.length > 0 ? (
              <View style={[styles.badgesRow, { marginTop: 10 }]}>
                {headBadges.map((b, i) => (
                  <View key={i} style={[styles.badge, { backgroundColor: `${b.color}22` }]}>
                    <Text style={[styles.badgeText, { color: b.color }]}>{b.icon} {b.label}</Text>
                  </View>
                ))}
              </View>
            ) : null;
          })()}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>👨‍👩‍👧 أفراد الأسرة ({members.length})</Text>
          {members.length === 0 ? (
            <Text style={styles.noMembers}>لا يوجد أفراد مسجّلون</Text>
          ) : (
            [...members]
              .sort((a, b) => {
                if (!a.dob) return 1;
                if (!b.dob) return -1;
                return a.dob.localeCompare(b.dob); // تصاعدي: الأكبر سناً أولاً
              })
              .map((m) => {
                const badges = buildHealthBadges(m);
                return (
                  <View key={m.id} style={styles.memberRow}>
                    <Text style={styles.memberIcon}>{getMemberIcon(m.relation, m.gender)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{m.name}</Text>
                      <Text style={styles.memberMeta}>
                        {m.relation || '—'}
                        {m.dob ? ` · ${calcAge(m.dob)} سنة` : ''}
                      </Text>
                      {badges.length > 0 && (
                        <View style={styles.badgesRow}>
                          {badges.map((b, i) => (
                            <View key={i} style={[styles.badge, { backgroundColor: `${b.color}22` }]}>
                              <Text style={[styles.badgeText, { color: b.color }]}>{b.icon} {b.label}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
          )}
        </View>

        {!!family.notes && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>📝 ملاحظات</Text>
            <Text style={styles.notes}>{family.notes}</Text>
          </View>
        )}

        <View style={styles.actionsRow}>
          {canEdit && (
            <Pressable
              style={[styles.editBtn, !!offlineInfo && styles.btnDisabled]}
              onPress={() => !offlineInfo && navigation.push('FamilyForm', { familyId })}
              disabled={!!offlineInfo}
            >
              <Text style={styles.editBtnText}>✏️ تعديل</Text>
            </Pressable>
          )}
          {canDelete && (
            <Pressable
              style={[styles.deleteBtn, !!offlineInfo && styles.btnDisabled]}
              onPress={handleExit}
              disabled={!!offlineInfo}
            >
              <Text style={styles.deleteBtnText}>🚪 تسجيل خروج</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <BottomSheetModal visible={exitModalVisible} onClose={() => setExitModalVisible(false)} title="🚪 تسجيل خروج الأسرة">
        <Text style={styles.exitWarnText}>
          الأسرة "{family.head_name}" لن تُحذف — ستنتقل لقائمة "الأسر الخارجة" (تظهر لمالك المنصة فقط)، وتختفي من كل الشاشات العادية.
        </Text>
        <FormInput label="تاريخ الخروج (YYYY-MM-DD)" value={exitDate} onChangeText={setExitDate} />
        <FormInput label="سبب الخروج" placeholder="مثال: عودة للمنزل، سفر..." value={exitReason} onChangeText={setExitReason} multiline numberOfLines={2} />
        <View style={styles.exitActionsRow}>
          <Pressable style={[styles.confirmExitBtn, exitSaving && { opacity: 0.6 }]} onPress={confirmExit} disabled={exitSaving}>
            {exitSaving ? <ActivityIndicator color="#000" /> : <Text style={styles.confirmExitBtnText}>✅ تأكيد الخروج</Text>}
          </Pressable>
          <Pressable style={styles.cancelExitBtn} onPress={() => setExitModalVisible(false)}>
            <Text style={styles.cancelExitBtnText}>إلغاء</Text>
          </Pressable>
        </View>
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 32 },

  warnBox: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  warnTitle: { color: colors.red, fontWeight: 'bold', fontSize: 12, marginBottom: 4, textAlign: 'right' },
  warnItem: { color: colors.muted, fontSize: 11, textAlign: 'right' },

  dupBox: {
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.35)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  dupTitle: { color: colors.purple, fontWeight: 'bold', fontSize: 12, marginBottom: 6, textAlign: 'right' },
  dupBadge: {
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
  },
  dupBadgeText: { color: colors.white, fontSize: 11, textAlign: 'right' },

  panel: {
    backgroundColor: colors.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
    padding: 14,
    marginBottom: 12,
  },
  panelTitle: { color: colors.accent, fontWeight: 'bold', fontSize: 12, marginBottom: 10, textAlign: 'right' },
  headName: { color: colors.white, fontWeight: '900', fontSize: 16, marginBottom: 10, textAlign: 'right' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoCell: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 10,
  },
  infoLabel: { color: colors.muted, fontSize: 9, marginBottom: 2, textAlign: 'right' },
  infoValue: { color: colors.white, fontWeight: 'bold', fontSize: 12, textAlign: 'right' },

  noMembers: { color: colors.muted, fontSize: 12, textAlign: 'center', paddingVertical: 12 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  memberIcon: { fontSize: 20 },
  memberName: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'right' },
  memberMeta: { color: colors.muted, fontSize: 11, textAlign: 'right', marginTop: 2 },
  badgesRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },

  notes: { color: colors.white, fontSize: 12, textAlign: 'right', lineHeight: 20 },

  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  editBtn: { flex: 1, backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 12 },
  editBtnText: { color: '#000', fontWeight: '900', fontSize: 13, textAlign: 'center' },
  deleteBtn: {
    flex: 1,
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    paddingVertical: 12,
    borderRadius: 12,
  },
  deleteBtnText: { color: colors.red, fontWeight: 'bold', fontSize: 13, textAlign: 'center' },
  btnDisabled: { opacity: 0.4 },
  offlineBanner: {
    backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
    borderRadius: 12, padding: 10, marginBottom: 12,
  },
  offlineBannerText: { color: colors.accent, fontSize: 11, textAlign: 'right', lineHeight: 17 },

  exitWarnText: { color: colors.muted, fontSize: 12, lineHeight: 19, marginBottom: 14, textAlign: 'right' },
  exitActionsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  confirmExitBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  confirmExitBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
  cancelExitBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  cancelExitBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
});
