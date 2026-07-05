import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Linking,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilies, fetchFamilyMembers, fetchCamps } from '../../lib/supabase';
import { checkFamilyIssues } from '../../lib/helpers';
import { showError, showSuccess, showInfo } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import colors from '../../theme/colors';

// توقيع الرسالة حسب مخيم الأسرة (نفس منطق الأصل)
const getSig = (campId, campMap) => {
  const name = campMap[campId];
  return name ? `إدارة مخيم ${name}` : 'إدارة المخيم';
};

// اسم مختصر للرسالة (٣ كلمات كحد أقصى)
const shortName = (fullName) => {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 3) return parts.join(' ');
  return [parts[0], parts[1], parts[parts.length - 1]].join(' ');
};

export default function SMSScreen() {
  const { orgId } = useAuth();
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope();

  const [families, setFamilies] = useState([]);
  const [members, setMembers] = useState([]);
  const [camps, setCamps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCamp, setFilterCamp] = useState('');
  const [campPickerVisible, setCampPickerVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [message, setMessage] = useState('');

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      const campsData = await fetchCamps(orgId);
      const allowedCampIds = getAllowedCampIds(campsData);
      const famsRaw = await fetchFamilies(orgId);
      const scoped = allowedCampIds === null ? famsRaw : famsRaw.filter((f) => allowedCampIds.includes(f.camp_id));

      setFamilies(scoped);
      setCamps(getVisibleCamps(campsData));
      setMembers(await fetchFamilyMembers(scoped.map((f) => f.id)));
      // تحديد افتراضي: كل من معه رقم جوال
      setSelected(new Set(scoped.filter((f) => f.phone1).map((f) => f.id)));
    } catch (e) {
      showError('تعذّر تحميل قائمة الأسر');
    } finally {
      setLoading(false);
    }
  }, [orgId, getAllowedCampIds, getVisibleCamps]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const campMap = useMemo(() => Object.fromEntries(camps.map((c) => [c.id, c.name])), [camps]);
  const memsByFam = useMemo(() => {
    const map = {};
    members.forEach((m) => {
      if (!map[m.family_id]) map[m.family_id] = [];
      map[m.family_id].push(m);
    });
    return map;
  }, [members]);

  const filtered = useMemo(() => {
    let list = families;
    if (filterCamp) list = list.filter((f) => f.camp_id === filterCamp);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((f) => (f.head_name || '').toLowerCase().includes(q) || (f.phone1 || '').includes(q));
    return [...list].sort((a, b) => (a.head_name || '').localeCompare(b.head_name || '', 'ar'));
  }, [families, filterCamp, search]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(filtered.filter((f) => f.phone1).map((f) => f.id)));
  const deselectAll = () => setSelected(new Set());
  const selectIncomplete = () =>
    setSelected(
      new Set(
        filtered
          .filter((f) => f.phone1 && checkFamilyIssues(f, memsByFam[f.id]).length > 0)
          .map((f) => f.id)
      )
    );

  const selectedFamilies = useMemo(() => families.filter((f) => selected.has(f.id) && f.phone1), [families, selected]);

  const sendSMS = async () => {
    const sel = selectedFamilies;
    const text = message.trim();
    if (!sel.length) return showError('لم تختر أي مستلم');
    if (!text) return showError('يرجى كتابة نص الرسالة');

    if (sel.length === 1) {
      const f = sel[0];
      const msg = text.replace(/\{اسم\}/g, shortName(f.head_name)) + '\n' + getSig(f.camp_id, campMap);
      await Linking.openURL(`sms:${f.phone1}?body=${encodeURIComponent(msg)}`);
      showSuccess('📨 جارٍ فتح تطبيق الرسائل...');
      return;
    }

    const sig = getSig(sel[0].camp_id, campMap);
    const tmpl = text.replace(/\{اسم\}/g, 'المستفيد') + '\n' + sig;
    const nums = sel.map((f) => f.phone1).filter(Boolean).join(';');
    if (!nums) return showError('لا توجد أرقام صحيحة');
    await Linking.openURL(`sms:${nums}?body=${encodeURIComponent(tmpl)}`);
    showSuccess(`📨 إرسال لـ ${sel.length} مستلم...`);
  };

  const copyNums = async () => {
    const nums = selectedFamilies.map((f) => f.phone1).filter(Boolean).join('\n');
    if (!nums) return showError('لم تختر أي مستلم');
    await Clipboard.setStringAsync(nums);
    showInfo(`📋 تم نسخ ${selectedFamilies.length} رقم`);
  };

  const renderRecipient = ({ item: f }) => {
    const hasPhone = !!f.phone1;
    const issues = checkFamilyIssues(f, memsByFam[f.id]);
    const isSelected = selected.has(f.id);

    return (
      <Pressable
        style={[styles.recipientRow, !hasPhone && styles.recipientDisabled]}
        onPress={() => hasPhone && toggle(f.id)}
        disabled={!hasPhone}
      >
        <Text style={styles.phone}>{f.phone1 || '—'}</Text>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{f.head_name}</Text>
            <Text style={styles.checkbox}>{isSelected ? '☑️' : '⬜'}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{campMap[f.camp_id] || '—'}</Text>
            {issues.length > 0 && <Text style={styles.warnText}>⚠️ {issues.length} ناقص</Text>}
            {!hasPhone && <Text style={styles.warnText}>📵 لا جوال</Text>}
          </View>
        </View>
      </Pressable>
    );
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
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderRecipient}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="💬"
              title="إرسال رسائل SMS"
              subtitle={<Text style={styles.headerSubtitle}>{selected.size} محدَّد</Text>}
            />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🎯 المستلمون</Text>

              <View style={styles.chipsRow}>
                <FilterChip
                  label={filterCamp ? campMap[filterCamp] : '⛺ كل المخيمات'}
                  selected={!!filterCamp}
                  onPress={() => setCampPickerVisible(true)}
                />
              </View>

              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="بحث بالاسم أو الجوال..."
                placeholderTextColor={colors.muted}
                style={styles.searchInput}
              />

              <View style={styles.actionsRow}>
                <Pressable style={styles.smallBtn} onPress={selectAll}>
                  <Text style={styles.smallBtnText}>تحديد الكل</Text>
                </Pressable>
                <Pressable style={styles.smallBtn} onPress={deselectAll}>
                  <Text style={styles.smallBtnText}>إلغاء الكل</Text>
                </Pressable>
                <Pressable style={styles.warnBtn} onPress={selectIncomplete}>
                  <Text style={styles.warnBtnText}>⚠️ الناقصين</Text>
                </Pressable>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="👥" title="لا توجد أسر" />}
        ListFooterComponent={
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>✍️ نص الرسالة</Text>
            <Text style={styles.hint}>
              💡 {'{اسم}'} يُستبدل باسم رب الأسرة تلقائياً
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
              placeholder="مثال: السيد/ة {اسم}، يرجى مراجعتنا لاستكمال بياناتكم."
              placeholderTextColor={colors.muted}
              style={styles.messageInput}
            />
            <View style={styles.countRow}>
              <Text style={styles.countText}>{message.length} حرف</Text>
              <Text style={styles.countText}>{Math.ceil(message.length / 160) || 0} رسالة</Text>
            </View>
            <View style={styles.sendRow}>
              <Pressable style={[styles.sendBtn, !selected.size && styles.disabled]} onPress={sendSMS} disabled={!selected.size}>
                <Text style={styles.sendBtnText}>📨 إرسال لـ {selectedFamilies.length} مستلم</Text>
              </Pressable>
              <Pressable style={styles.copyBtn} onPress={copyNums}>
                <Text style={styles.copyBtnText}>📋 نسخ</Text>
              </Pressable>
            </View>
            <Text style={styles.footerHint}>📱 يفتح تطبيق الرسائل بالأرقام المحددة — اضغط إرسال وسيُرسل للكل.</Text>
          </View>
        }
      />

      <BottomSheetModal visible={campPickerVisible} onClose={() => setCampPickerVisible(false)} title="اختر المخيم">
        <Pressable style={styles.campOption} onPress={() => { setFilterCamp(''); setCampPickerVisible(false); }}>
          <Text style={styles.campOptionText}>⛺ كل المخيمات</Text>
        </Pressable>
        {camps.map((c) => (
          <Pressable key={c.id} style={styles.campOption} onPress={() => { setFilterCamp(c.id); setCampPickerVisible(false); }}>
            <Text style={styles.campOptionText}>{c.name}</Text>
          </Pressable>
        ))}
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 32 },
  headerSubtitle: { color: colors.muted, fontSize: 11 },

  section: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 12 },
  sectionTitle: { color: colors.accent, fontWeight: 'bold', fontSize: 13, marginBottom: 10, textAlign: 'right' },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  searchInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.white,
    fontSize: 13,
    textAlign: 'right',
    marginBottom: 10,
  },
  actionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  smallBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  smallBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 11 },
  warnBtn: { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: colors.red, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  warnBtnText: { color: colors.red, fontWeight: 'bold', fontSize: 11 },

  recipientRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    gap: 8,
  },
  recipientDisabled: { opacity: 0.5 },
  phone: { color: colors.accent, fontSize: 11 },
  nameRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  name: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
  checkbox: { fontSize: 14 },
  metaRow: { flexDirection: 'row-reverse', gap: 8, marginTop: 2 },
  metaText: { color: colors.muted, fontSize: 10 },
  warnText: { color: colors.red, fontSize: 10, fontWeight: 'bold' },

  hint: { color: colors.muted, fontSize: 11, marginBottom: 8, textAlign: 'right' },
  messageInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.white,
    fontSize: 13,
    textAlign: 'right',
    textAlignVertical: 'top',
    minHeight: 90,
    marginBottom: 8,
  },
  countRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 10 },
  countText: { color: colors.muted, fontSize: 11 },
  sendRow: { flexDirection: 'row', gap: 8 },
  sendBtn: { flex: 1, backgroundColor: colors.accent, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  sendBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
  copyBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 12 },
  copyBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
  footerHint: { color: colors.muted, fontSize: 10, marginTop: 8, textAlign: 'right', lineHeight: 16 },

  campOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  campOptionText: { color: colors.white, fontSize: 13, textAlign: 'right' },
});
