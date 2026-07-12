import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, Pressable, FlatList, Alert, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import {
  fetchDevices,
  fetchOrgMembers,
  fetchDeviceAuditMap,
  approveDevice,
  blockDevice,
  unblockDevice,
  removeDevice,
} from '../../lib/supabase';
import { getDeviceFingerprint, formatDate, formatDateTime } from '../../lib/utils';
import { ROLE_LABELS, canUserReviewRequest } from '../../lib/permissions';
import { showError, showSuccess } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import Badge from '../../components/ui/Badge';
import colors from '../../theme/colors';

const AUDIT_LABEL = {
  device_approved: '✅ اعتمده',
  device_blocked: '🚫 حظره',
  device_unblocked: 'رفع الحظر عنه',
};

export default function DevicesScreen() {
  const { orgId, profile, isOwner, isSuperAdmin } = useAuth();

  const [devices, setDevices] = useState([]);
  const [members, setMembers] = useState([]);
  const [auditMap, setAuditMap] = useState({});
  const [myFingerprint, setMyFingerprint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [typeFilter, setTypeFilter] = useState(''); // '' | 'mobile' | 'web'

  const loadDevices = useCallback(async () => {
    if (!orgId) return;
    try {
      const [devs, mems, fp] = await Promise.all([
        fetchDevices(orgId),
        fetchOrgMembers(orgId),
        getDeviceFingerprint(),
      ]);
      setDevices(devs);
      setMembers(mems);
      setMyFingerprint(fp);
      setAuditMap(await fetchDeviceAuditMap(orgId, devs.map((d) => d.id)));
    } catch (e) {
      showError('تعذّر تحميل الأجهزة: ' + e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId]);

  useEffect(() => { loadDevices(); }, [loadDevices]);
  useFocusEffect(useCallback(() => { loadDevices(); }, [loadDevices]));

  const onRefresh = () => { setRefreshing(true); loadDevices(); };

  const byUserId = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m])), [members]);

  // الرؤية: مالك المنصة يرى الكل. غيره يرى جهازه + أجهزة من يحق له مراجعتهم هرمياً.
  const visibleDevices = useMemo(() => {
    const base = isOwner
      ? devices
      : devices.filter((d) => {
          if (d.user_id === profile?.user_id) return true;
          const owner = byUserId[d.user_id];
          return !!owner && canUserReviewRequest(profile, owner);
        });
    if (!typeFilter) return base;
    // 'desktop' قيمة قديمة من النسخة الأصلية بالويب (متصفح كمبيوتر) --
    // تُحسب مع 'web' بفلتر الويب، أي شي غيرها (بما فيها القيم الفاضية
    // القديمة قبل ما نميّز النوع أصلاً) يُحسب تطبيق.
    return base.filter((d) => {
      const t = d.device_type || 'mobile';
      const isWebType = t === 'web' || t === 'desktop';
      return typeFilter === 'web' ? isWebType : !isWebType;
    });
  }, [devices, byUserId, isOwner, profile, typeFilter]);

  const canManage = (owner) => isOwner || (!!owner && canUserReviewRequest(profile, owner));

  const runAction = async (d, owner, fn, okMsg) => {
    setBusyId(d.id);
    try {
      await fn({ ...d, owner_name: owner?.full_name }, profile, orgId);
      showSuccess(okMsg);
      await loadDevices();
    } catch (e) {
      showError('خطأ: ' + e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = (device) => {
    if (!isOwner && !isSuperAdmin) {
      showError('⛔ لا تملك صلاحية إزالة الأجهزة');
      return;
    }
    Alert.alert('إزالة الجهاز', `إزالة "${device.device_name}" (آخر نشاط: ${formatDate(device.last_seen)}) نهائياً؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'إزالة',
        style: 'destructive',
        onPress: async () => {
          setBusyId(device.id);
          try {
            await removeDevice(device.id);
            // إزالة فورية من الواجهة بدل انتظار إعادة تحميل كاملة -- مع 10+
            // جهاز بنفس الاسم العام (زي "Android" بس) كان صعب تلاحظ اختفاء
            // وحدة وسط باقي المتطابقين، فيبدو الحذف "ما اشتغل" رغم نجاحه.
            setDevices((prev) => prev.filter((d) => d.id !== device.id));
            showSuccess('✅ تم إزالة الجهاز');
          } catch (e) {
            showError('خطأ: ' + e.message);
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const pendingCount = visibleDevices.filter((d) => !d.is_approved && !d.is_blocked).length;

  const renderDevice = ({ item: d }) => {
    const owner = byUserId[d.user_id];
    const isMine = d.fingerprint === myFingerprint;
    const manage = canManage(owner);
    const audit = auditMap[d.id];

    return (
      <View style={[styles.card, isMine && styles.cardMine]}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.badgesRow}>
              <Text style={styles.deviceName}>{d.device_name || '🌐 جهاز'}</Text>
              {isMine && <Badge label="هذا الجهاز" color={colors.accent} />}
              {d.is_blocked ? (
                <Badge label="🚫 محظور" color={colors.red} />
              ) : d.is_approved ? (
                <Badge label="✅ معتمد" color={colors.green} />
              ) : (
                <Badge label="⏳ بانتظار الموافقة" color={colors.accent} />
              )}
            </View>
            <Text style={styles.ownerName}>
              {owner?.full_name || '— مستخدم غير معروف'}
              {!!owner?.role && <Text style={styles.roleText}> ({ROLE_LABELS[owner.role] || owner.role})</Text>}
            </Text>
            <Text style={styles.lastSeen}>آخر نشاط: {formatDate(d.last_seen)}</Text>
            {!!audit && (
              <Text style={styles.auditText}>
                {AUDIT_LABEL[audit.action] || audit.action} <Text style={styles.auditUser}>{audit.user_name}</Text> — {formatDateTime(audit.created_at)}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.actionsRow}>
          {manage && !d.is_blocked && !d.is_approved && (
            <Pressable
              style={styles.approveBtn}
              onPress={() => runAction(d, owner, approveDevice, '✅ تم اعتماد الجهاز')}
              disabled={busyId === d.id}
            >
              <Text style={styles.approveBtnText}>✅ اعتماد</Text>
            </Pressable>
          )}
          {manage && !d.is_blocked && (
            <Pressable
              style={styles.blockBtn}
              onPress={() => runAction(d, owner, blockDevice, '🚫 تم حظر الجهاز')}
              disabled={busyId === d.id}
            >
              <Text style={styles.blockBtnText}>🚫 حظر</Text>
            </Pressable>
          )}
          {manage && d.is_blocked && (
            <Pressable
              style={styles.unblockBtn}
              onPress={() => runAction(d, owner, unblockDevice, 'تم رفع الحظر — لا يزال يحتاج اعتماداً')}
              disabled={busyId === d.id}
            >
              <Text style={styles.unblockBtnText}>رفع الحظر</Text>
            </Pressable>
          )}
          {!isMine && (isOwner || isSuperAdmin) && (
            <Pressable style={styles.removeBtn} onPress={() => handleRemove(d)}>
              <Text style={styles.removeBtnText}>🗑️ إزالة</Text>
            </Pressable>
          )}
        </View>
      </View>
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
        data={visibleDevices}
        keyExtractor={(item) => item.id}
        renderItem={renderDevice}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="📱"
              title="إدارة الأجهزة"
              subtitle={
                <Text style={styles.headerSubtitle}>
                  {visibleDevices.length} جهاز{pendingCount ? ` — ⏳ ${pendingCount} بانتظار الموافقة` : ''}
                </Text>
              }
            />
            <View style={styles.filterRow}>
              <FilterChip label="الكل" selected={!typeFilter} onPress={() => setTypeFilter('')} />
              <FilterChip label="📱 التطبيق" selected={typeFilter === 'mobile'} onPress={() => setTypeFilter('mobile')} />
              <FilterChip label="🌐 الويب" selected={typeFilter === 'web'} onPress={() => setTypeFilter('web')} />
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="📱" title="لا توجد أجهزة" />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 32 },
  headerSubtitle: { color: colors.muted, fontSize: 11 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 4 },

  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 8 },
  cardMine: { borderColor: 'rgba(245,158,11,0.4)' },
  cardTop: { flexDirection: 'row' },
  badgesRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 6 },
  deviceName: { color: colors.white, fontSize: 13 },
  ownerName: { color: colors.white, fontWeight: 'bold', fontSize: 12, textAlign: 'right' },
  roleText: { color: colors.muted, fontWeight: 'normal' },
  lastSeen: { color: colors.muted, fontSize: 10, marginTop: 2, textAlign: 'right' },
  auditText: { color: colors.muted, fontSize: 10, marginTop: 6, backgroundColor: colors.surface2, borderRadius: 8, padding: 6, textAlign: 'right' },
  auditUser: { color: colors.white, fontWeight: 'bold' },

  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  approveBtn: { backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  approveBtnText: { color: colors.green, fontWeight: 'bold', fontSize: 11 },
  blockBtn: { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  blockBtnText: { color: colors.red, fontWeight: 'bold', fontSize: 11 },
  unblockBtn: { backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  unblockBtnText: { color: colors.accent, fontWeight: 'bold', fontSize: 11 },
  removeBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  removeBtnText: { color: colors.muted, fontSize: 11 },
});
