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
import { useAuth } from '../../context/AuthContext';
import { fetchFamilyById, fetchFamilyMembers, exitFamily, fetchCamps } from '../../lib/supabase';
import { calcAge, checkFamilyIssues, getMemberIcon } from '../../lib/helpers';
import { formatDate } from '../../lib/utils';
import { showError, showSuccess } from '../../utils/toast';
import EmptyState from '../../components/ui/EmptyState';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import FormInput from '../../components/ui/FormInput';
import colors from '../../theme/colors';

const todayStr = () => new Date().toISOString().slice(0, 10);

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

  const load = useCallback(async () => {
    if (!familyId) return;
    try {
      const data = await fetchFamilyById(familyId);
      if (!data) {
        showError('لم يتم العثور على الأسرة');
        setLoading(false);
        return;
      }
      setFamily(data);

      const [mems, camps] = await Promise.all([
        fetchFamilyMembers([familyId]),
        data.org_id ? fetchCamps(data.org_id) : Promise.resolve([]),
      ]);
      setMembers(mems);
      setCampName(camps.find((c) => c.id === data.camp_id)?.name || '');
    } catch (e) {
      showError('تعذّر تحميل بيانات الأسرة');
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
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>👨‍👩‍👧 أفراد الأسرة ({members.length})</Text>
          {members.length === 0 ? (
            <Text style={styles.noMembers}>لا يوجد أفراد مسجّلون</Text>
          ) : (
            members.map((m) => (
              <View key={m.id} style={styles.memberRow}>
                <Text style={styles.memberIcon}>{getMemberIcon(m.relation, m.gender)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{m.name}</Text>
                  <Text style={styles.memberMeta}>
                    {m.relation || '—'}
                    {m.dob ? ` · ${calcAge(m.dob)} سنة` : ''}
                  </Text>
                </View>
              </View>
            ))
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
              style={styles.editBtn}
              onPress={() => navigation.navigate('FamilyForm', { familyId })}
            >
              <Text style={styles.editBtnText}>✏️ تعديل</Text>
            </Pressable>
          )}
          {canDelete && (
            <Pressable style={styles.deleteBtn} onPress={handleExit}>
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

  exitWarnText: { color: colors.muted, fontSize: 12, lineHeight: 19, marginBottom: 14, textAlign: 'right' },
  exitActionsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  confirmExitBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  confirmExitBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
  cancelExitBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  cancelExitBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
});
