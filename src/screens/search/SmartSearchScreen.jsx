import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { supabase, fetchCamps } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';
import {
  calcAge, checkFamilyIssues, getFamilyCategories, getVulnerabilityScore,
  normalizeHealthValue, naturalCompare,
} from '../../lib/helpers';
import { parseSmartQuery } from '../../lib/smartSearch';
import { showToast } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import colors from '../../theme/colors';

const EXAMPLES = ['نساء فوق 50 سنة', 'أطفال معاقين', 'أسر شهداء بمخيم السلام', 'أسر ناقصة بيانات', 'أسر شديدة الضعف'];

const healthCount = (raw) => {
  const n = normalizeHealthValue(raw);
  return n ? n.split('، ').filter(Boolean).length : 0;
};

function familyMatches(family, members, filters) {
  // العمر/الجنس: يتحققان على مستوى الأفراد (رب الأسرة + كل الأفراد)
  if (filters.ageMin != null || filters.ageMax != null || filters.gender) {
    const people = [
      { age: calcAge(family.head_dob), gender: family.head_gender },
      ...members.map((m) => ({ age: calcAge(m.dob), gender: m.gender })),
    ];
    const anyMatch = people.some((p) => {
      if (filters.gender && p.gender !== filters.gender) return false;
      if (filters.ageMin != null && (p.age == null || p.age < filters.ageMin)) return false;
      if (filters.ageMax != null && (p.age == null || p.age > filters.ageMax)) return false;
      return true;
    });
    if (!anyMatch) return false;
  }

  if (filters.health) {
    const key = filters.health;
    let has = false;
    if (key === 'orphan') {
      has = !!family.head_orphan_status || members.some((m) => m.orphan_status);
    } else {
      const field = key === 'chronic' ? 'chronic_diseases' : key === 'disability' ? 'disabilities' : 'injuries';
      const headField = key === 'chronic' ? 'head_chronic_diseases' : key === 'disability' ? 'head_disabilities' : 'head_injuries';
      has = healthCount(family[headField]) > 0 || members.some((m) => healthCount(m[field]) > 0);
    }
    if (!has) return false;
  }

  if (filters.category && !getFamilyCategories(family, members).includes(filters.category)) return false;

  if (filters.quality) {
    if (filters.quality === 'incomplete' && checkFamilyIssues(family, members).length === 0) return false;
    if (filters.quality === 'no_phone' && family.phone1?.trim()) return false;
    // فحص التكرار (dup) غير مطبَّق هون لتفادي إعادة حساب مكلفة على كل
    // نتيجة -- شاشة "كل الأسر" فيها فلتر مخصص وأدق لهذا تحديداً
  }

  if (filters.vulnerable) {
    const t = getVulnerabilityScore(family, members).tier;
    if (t !== 'high' && t !== 'critical') return false;
  }

  if (filters.campId && family.camp_id !== filters.campId) return false;

  return true;
}

export default function SmartSearchScreen() {
  const navigation = useNavigation();
  const { orgId, profile } = useAuth();
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope();

  const [query, setQuery] = useState('');
  const [families, setFamilies] = useState([]);
  const [camps, setCamps] = useState([]);
  const [campMap, setCampMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null); // { filters, understood, matches } | null

  const loadData = useCallback(async () => {
    if (!orgId) return;
    const cached = await getCachedData('smart_search_data', profile?.id);
    if (cached?.data) {
      setFamilies(cached.data.families || []);
      setCamps(cached.data.camps || []);
      setCampMap(Object.fromEntries((cached.data.camps || []).map((c) => [c.id, c.name])));
      setLoading(false);
    }
    try {
      const net = await withTimeout(NetInfo.fetch(), 4000, 'تعذّر تحديد حالة الاتصال');
      if (!net.isConnected) return;
      const allCamps = await withTimeout(fetchCamps(orgId), 10000, 'انتهت مهلة تحميل البيانات');
      const campIds = getAllowedCampIds(allCamps);
      const visibleCamps = getVisibleCamps(allCamps);
      const { data: fams } = await withTimeout(
        supabase.from('families').select('*, family_members(*)').eq('org_id', orgId).eq('_deleted', false),
        12000,
        'انتهت مهلة تحميل البيانات'
      );
      const scoped = filterLocal(fams || [], campIds);
      setFamilies(scoped);
      setCamps(visibleCamps);
      setCampMap(Object.fromEntries(visibleCamps.map((c) => [c.id, c.name])));
      cacheData('smart_search_data', profile?.id, { families: scoped, camps: visibleCamps });
    } catch {
      // فشل التحديث الحي غير حرج لو فيه نسخة محفوظة أصلاً
    } finally {
      setLoading(false);
    }
  }, [orgId, getAllowedCampIds, filterLocal, getVisibleCamps, profile?.id]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const runSearch = (text) => {
    const q = (text ?? query).trim();
    if (!q) return showToast('اكتب سؤالك أولاً', 'error');
    const { filters, understood } = parseSmartQuery(q, camps);
    if (!understood.length) {
      setResult({ filters, understood, matches: [] });
      showToast('ما قدرت أفهم أي فلتر من السؤال — جرّب صياغة أوضح أو من الأمثلة', 'error');
      return;
    }
    const matches = families
      .filter((f) => familyMatches(f, f.family_members || [], filters))
      .sort((a, b) => naturalCompare(a.tent, b.tent));
    setResult({ filters, understood, matches });
  };

  const styles = getStyles();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <PageHeader icon="🔍" title="البحث الذكي" subtitle={<Text style={styles.headerSubtitle}>اكتب سؤالك بالعربية العادية</Text>} />

        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => runSearch()}
          placeholder="مثال: نساء فوق 50 سنة بمخيم السلام"
          placeholderTextColor={colors.muted}
          style={styles.input}
          returnKeyType="search"
        />
        <Pressable style={styles.searchBtn} onPress={() => runSearch()}>
          <Text style={styles.searchBtnText}>🔍 بحث</Text>
        </Pressable>

        {!result && (
          <View style={styles.examplesBox}>
            <Text style={styles.examplesTitle}>أمثلة سريعة:</Text>
            <View style={styles.examplesWrap}>
              {EXAMPLES.map((ex) => (
                <Pressable key={ex} style={styles.exampleChip} onPress={() => { setQuery(ex); runSearch(ex); }}>
                  <Text style={styles.exampleChipText}>{ex}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {result && result.understood.length > 0 && (
          <View style={styles.understoodBox}>
            <Text style={styles.understoodText}>
              ✅ فهمت: {result.understood.join(' + ')} — {result.matches.length} نتيجة
            </Text>
          </View>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={result?.matches || []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item: f }) => (
            <Pressable style={styles.card} onPress={() => navigation.push('FamilyDetail', { familyId: f.id })}>
              <Text style={styles.cardName}>{f.head_name || '—'}</Text>
              <Text style={styles.cardMeta}>
                {campMap[f.camp_id] || '—'}{f.tent ? ` • خيمة ${f.tent}` : ''} • {(f.family_members?.length || 0) + 1} فرد
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            result ? <EmptyState icon="🔍" title="لا توجد نتائج مطابقة" /> : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const getStyles = () =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { padding: 16, paddingBottom: 8 },
    headerSubtitle: { color: colors.muted, fontSize: 11, textAlign: 'center' },
    input: {
      backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
      paddingHorizontal: 16, paddingVertical: 12, color: colors.white, fontSize: 14, textAlign: 'right', marginBottom: 8,
    },
    searchBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
    searchBtnText: { color: '#000', fontWeight: '900', fontSize: 14 },

    examplesBox: { marginTop: 16 },
    examplesTitle: { color: colors.muted, fontSize: 11, marginBottom: 8, textAlign: 'right' },
    examplesWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
    exampleChip: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7,
    },
    exampleChipText: { color: colors.white, fontSize: 11 },

    understoodBox: {
      backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)',
      borderRadius: 12, padding: 10, marginTop: 12,
    },
    understoodText: { color: colors.green, fontSize: 12, textAlign: 'right', lineHeight: 18 },

    listContent: { padding: 16, paddingTop: 4 },
    card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 8 },
    cardName: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'right' },
    cardMeta: { color: colors.muted, fontSize: 11, marginTop: 4, textAlign: 'right' },
  });
