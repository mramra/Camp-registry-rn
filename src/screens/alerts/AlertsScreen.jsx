import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import {
  fetchFamilies,
  fetchFamilyMembers,
  fetchCamps,
  fetchLastDistributionDate,
  fetchOrgMembers,
} from '../../lib/supabase';
import { supabase } from '../../lib/supabase';
import { isIncomplete, getVulnerabilityScore } from '../../lib/helpers';
import { showError } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import colors from '../../theme/colors';

const LEVEL_STYLE = {
  red: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.4)', text: colors.red },
  yellow: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.4)', text: colors.accent },
  blue: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.4)', text: colors.blue },
  green: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.4)', text: colors.green },
};

export default function AlertsScreen() {
  const navigation = useNavigation();
  const { orgId, isOwner, isSuperAdmin } = useAuth();
  const { getAllowedCampIds, filterLocal } = useDataScope();

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAlerts = useCallback(async () => {
    if (!orgId) return;
    try {
      const [famsRaw, camps] = await Promise.all([
        fetchFamilies(orgId),
        fetchCamps(orgId),
      ]);

      const campIds = getAllowedCampIds(camps);
      const myFams = filterLocal(famsRaw, campIds);
      const allMembers = await fetchFamilyMembers(myFams.map((f) => f.id));

      const mByFam = {};
      allMembers.forEach((m) => {
        if (!mByFam[m.family_id]) mByFam[m.family_id] = [];
        mByFam[m.family_id].push(m);
      });

      const list = [];

      // ① بيانات ناقصة
      const incomplete = myFams.filter((f) => isIncomplete(f, mByFam[f.id]));
      if (incomplete.length) {
        list.push({
          level: 'yellow',
          icon: '⚠️',
          title: `${incomplete.length} أسرة ببيانات ناقصة`,
          desc: 'تحتاج استكمال البيانات',
          screen: 'FamiliesList',
        });
      }

      // ② بدون جوال
      const noPhone = myFams.filter((f) => !f.phone1?.trim());
      if (noPhone.length) {
        list.push({
          level: 'yellow',
          icon: '📵',
          title: `${noPhone.length} أسرة بدون رقم جوال`,
          desc: 'لا يمكن التواصل معهم',
        });
      }

      // ③ هويات مكررة
      const idMap = {};
      myFams.forEach((f) => {
        if (f.head_id) idMap[f.head_id] = (idMap[f.head_id] || 0) + 1;
      });
      allMembers.forEach((m) => {
        if (m.national_id) idMap[m.national_id] = (idMap[m.national_id] || 0) + 1;
      });
      const dupIds = myFams.filter((f) => f.head_id && (idMap[f.head_id] || 0) > 1);
      if (dupIds.length) {
        list.push({
          level: 'red',
          icon: '🔁',
          title: `${dupIds.length} أسرة بهوية مكررة`,
          desc: dupIds.slice(0, 3).map((f) => f.head_name).join('، ') + (dupIds.length > 3 ? ' وآخرون' : ''),
          screen: 'FamiliesList',
        });
      }

      // ④ جوالات مكررة
      const cleanPh = (p) => (p || '').replace(/\s/g, '');
      const phMap = {};
      myFams.forEach((f) => {
        if (f.phone1) phMap[cleanPh(f.phone1)] = (phMap[cleanPh(f.phone1)] || 0) + 1;
      });
      const dupPh = myFams.filter((f) => f.phone1 && (phMap[cleanPh(f.phone1)] || 0) > 1);
      if (dupPh.length) {
        list.push({
          level: 'yellow',
          icon: '📞',
          title: `${dupPh.length} أسرة بجوال مكرر`,
          desc: dupPh.slice(0, 3).map((f) => f.head_name).join('، ') + (dupPh.length > 3 ? ' وآخرون' : ''),
          screen: 'FamiliesList',
        });
      }

      // ⑤ سعة المخيمات
      const campCount = {};
      myFams.forEach((f) => {
        campCount[f.camp_id] = (campCount[f.camp_id] || 0) + 1;
      });
      camps.forEach((c) => {
        if (!c.capacity) return;
        const n = campCount[c.id] || 0;
        const pct = Math.round((n / c.capacity) * 100);
        if (pct >= 100) {
          list.push({
            level: 'red',
            icon: '🏕️',
            title: `مخيم ${c.name} ممتلئ`,
            desc: `${n} أسرة من ${c.capacity} (${pct}%)`,
            screen: 'CampsList',
          });
        } else if (pct >= 90) {
          list.push({
            level: 'yellow',
            icon: '🏕️',
            title: `مخيم ${c.name} شبه ممتلئ (${pct}%)`,
            desc: `${n} من ${c.capacity} أسرة`,
          });
        }
      });

      // ⑥ آخر توزيع
      try {
        const lastDate = await fetchLastDistributionDate(orgId);
        if (lastDate) {
          const days = Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000);
          if (days > 30) {
            list.push({
              level: 'yellow',
              icon: '📦',
              title: `لم يُسجَّل توزيع منذ ${days} يوم`,
              desc: 'قد تحتاج جولة توزيع جديدة',
              screen: 'Distributions',
            });
          }
        }
      } catch {
        // فشل فحص آخر توزيع لا يمنع باقي التنبيهات
      }

      // ⑦ مستخدمون لم يغيّروا كلمة المرور (لمالك المنصة/مدير الإيواء فقط)
      if (isOwner || isSuperAdmin) {
        try {
          const orgMembers = await fetchOrgMembers(orgId);
          const pending = orgMembers.filter((u) => u.must_change_pass);
          if (pending.length) {
            list.push({
              level: 'blue',
              icon: '🔑',
              title: `${pending.length} مستخدم لم يغيّر كلمة المرور`,
              desc: pending.slice(0, 3).map((u) => u.full_name).join('، '),
              screen: 'UsersList',
            });
          }
        } catch {
          // تجاهل
        }
      }

      // ⑧ أسر عالية/حرجة الضعف لم تستلم أي مساعدة إطلاقاً (يربط درجة
      // الضعف بتاريخ المساعدات -- تنبيه جديد يكشف فجوة حقيقية بالتوزيع)
      try {
        const vulnerableFams = myFams.filter((f) => {
          const t = getVulnerabilityScore(f, mByFam[f.id]).tier;
          return t === 'high' || t === 'critical';
        });
        if (vulnerableFams.length) {
          const { data: received } = await supabase
            .from('camp_dist_families')
            .select('family_id')
            .in('family_id', vulnerableFams.map((f) => f.id))
            .eq('_deleted', false);
          const receivedSet = new Set((received || []).map((r) => r.family_id));
          const neverReceived = vulnerableFams.filter((f) => !receivedSet.has(f.id));
          if (neverReceived.length) {
            list.push({
              level: 'red',
              icon: '🆘',
              title: `${neverReceived.length} أسرة شديدة الضعف لم تستلم أي مساعدة`,
              desc: neverReceived.slice(0, 3).map((f) => f.head_name).join('، ') + (neverReceived.length > 3 ? ' وآخرون' : ''),
              screen: 'FamiliesList',
            });
          }
        }
      } catch {
        // فشل هذا الفحص التحليلي لا يمنع باقي التنبيهات
      }

      if (!list.length) {
        list.push({ level: 'green', icon: '✅', title: 'كل شيء على ما يرام', desc: 'لا توجد تنبيهات تحتاج انتباهك' });
      }

      setAlerts(list);
    } catch (e) {
      showError('تعذّر تحميل التنبيهات');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, getAllowedCampIds, filterLocal, isOwner, isSuperAdmin]);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);
  useFocusEffect(useCallback(() => { loadAlerts(); }, [loadAlerts]));

  const onRefresh = () => { setRefreshing(true); loadAlerts(); };

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
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <PageHeader
          icon="🔔"
          title="التنبيهات"
          subtitle={<Text style={styles.headerSubtitle}>{alerts.length} تنبيه</Text>}
        />

        {alerts.map((a, i) => {
          const s = LEVEL_STYLE[a.level] || LEVEL_STYLE.blue;
          return (
            <View key={i} style={[styles.card, { backgroundColor: s.bg, borderColor: s.border }]}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: s.text }]}>{a.icon} {a.title}</Text>
                  <Text style={styles.desc}>{a.desc}</Text>
                </View>
                {!!a.screen && (
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: `${s.text}22`, borderColor: s.border }]}
                    onPress={() => navigation.push(a.screen)}
                  >
                    <Text style={[styles.actionText, { color: s.text }]}>عرض</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 32 },
  headerSubtitle: { color: colors.muted, fontSize: 11 },

  card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  title: { fontWeight: 'bold', fontSize: 13, marginBottom: 4, textAlign: 'right' },
  desc: { color: colors.muted, fontSize: 11, textAlign: 'right' },
  actionBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  actionText: { fontSize: 11, fontWeight: 'bold' },
});
