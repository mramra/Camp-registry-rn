import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ScrollView,
  Linking,
  Platform,
  PermissionsAndroid,
  Alert,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilies, fetchFamilyMembers, fetchCamps } from '../../lib/supabase';
import { checkFamilyIssues, naturalCompare } from '../../lib/helpers';
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

// اسم مختصر للرسالة: الاسم الأول والأخير بس دايماً (بغض النظر عن طول الاسم الكامل)
const shortName = (fullName) => {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(' ');
  return [parts[0], parts[parts.length - 1]].join(' ');
};

// الاسم المستخدَم بتعويض {اسم}: لو فيه اسم صاحب عيد ميلاد محدَّد لهذي الأسرة
// (جاي من بطاقة أعياد الميلاد بالرئيسية -- ممكن يكون فرد مو رب الأسرة)
// يُستخدم هو، وإلا يرجع لاسم رب الأسرة العادي.
const resolveGreetingName = (f, birthdayNames) => shortName(birthdayNames?.[f.id] || f.head_name);

// عدد أجزاء الرسالة الفعلي: العربي (وأي حرف خارج GSM-7) يستخدم ترميز
// UCS-2 إجبارياً -- يحمل 70 حرف بالرسالة الواحدة بس (مو 160 زي الإنجليزي)،
// و67 حرف بالجزء لو الرسالة طويلة ومتعددة الأجزاء. بدون هذا التصحيح كان
// العداد يقلّل عدد الرسائل الفعلية بشكل كبير (يأثر على التكلفة الحقيقية).
const GSM7_REGEX = /^[A-Za-z0-9@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\\[~\]|€]*$/;
function smsSegmentInfo(text) {
  const len = text.length;
  if (!len) return { count: 0, encoding: '' };
  const isGsm7 = GSM7_REGEX.test(text);
  const single = isGsm7 ? 160 : 70;
  const multi = isGsm7 ? 153 : 67;
  const count = len <= single ? 1 : Math.ceil(len / multi);
  return { count, encoding: isGsm7 ? 'GSM-7' : 'UCS-2 (عربي)' };
}

// قوالب رسائل جاهزة لأكثر الحالات تكراراً -- اختيار سريع بدل الكتابة من الصفر
const MESSAGE_TEMPLATES = [
  { label: '📋 استكمال بيانات', text: 'السيد/ة {اسم}، يرجى مراجعتنا في أقرب وقت لاستكمال بياناتكم المسجّلة.' },
  { label: '📦 توزيع', text: 'السيد/ة {اسم}، حان موعد استلام حصتكم من التوزيع. يرجى الحضور بالوقت المحدد ومعكم بطاقة الهوية.' },
  { label: '🏥 مراجعة صحية', text: 'السيد/ة {اسم}، يرجى مراجعة العيادة الطبية لمتابعة الحالة الصحية لأحد أفراد أسرتكم.' },
  { label: '📢 إعلان عام', text: 'السيد/ة {اسم}، نود إبلاغكم بخصوص أمر هام يرجى مراجعتنا.' },
];

export default function SMSScreen() {
  const { orgId } = useAuth();
  const route = useRoute();
  const navigation = useNavigation();
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
  const [recipientsModalVisible, setRecipientsModalVisible] = useState(false);
  const [directSending, setDirectSending] = useState(false);
  const [directProgress, setDirectProgress] = useState(null); // { done, total }
  const [birthdayNames, setBirthdayNames] = useState({}); // { familyId: personName }
  const presetAppliedRef = useRef(false);

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

      // تحديد مسبق قادم من شاشة تانية (زي بطاقة أعياد الميلاد بالرئيسية) --
      // يُطبَّق مرة وحدة بس (مو بكل إعادة تركيز على الشاشة) عشان ما يمسح
      // اختيار المستخدم اليدوي لو رجع لنفس الشاشة بعدين.
      if (!presetAppliedRef.current && route.params?.preselectFamilyIds?.length) {
        presetAppliedRef.current = true;
        setSelected(new Set(route.params.preselectFamilyIds));
        if (route.params.presetMessage) setMessage(route.params.presetMessage);
        if (route.params.birthdayNames) setBirthdayNames(route.params.birthdayNames);
      }
      // ما فيه تحديد افتراضي غير هذا -- الشاشة تبدأ دايماً بلا أي اسم محدَّد،
      // المستخدم يختار بنفسه من نافذة المستلمين.
    } catch (e) {
      showError('تعذّر تحميل قائمة الأسر');
    } finally {
      setLoading(false);
    }
  }, [orgId, getAllowedCampIds, getVisibleCamps, route.params]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // حارس خروج أثناء الإرسال المباشر -- يمنع مغادرة الشاشة بالخطأ (رجوع
  // أو اختيار صفحة تانية من القائمة الجانبية) لما فيه إرسال جارٍ فعلياً،
  // ويعرض تحذير واضح بعدد الرسائل الباقية + خيار الخروج الفعلي لو أصرّ.
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (!directSending) return;
      e.preventDefault();
      Alert.alert(
        '⏳ الإرسال لسه شغّال',
        `تم إرسال ${directProgress?.done || 0} من ${directProgress?.total || 0} رسالة.\n\nالخروج الآن ممكن يوقف إرسال باقي الرسائل. يفضّل الانتظار لحد ما تخلص.`,
        [
          { text: 'كمّل الانتظار', style: 'cancel', onPress: () => {} },
          { text: 'اخرج بأي حال', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]
      );
    });
    return unsub;
  }, [navigation, directSending, directProgress]);

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
    return [...list].sort((a, b) => naturalCompare(a.tent, b.tent));
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

  // نص الرسالة الفعلي المُرسَل يشمل التوقيع دايماً -- نستخدم توقيع أول
  // مستلم محدَّد كتمثيل واقعي لحساب عدد الأجزاء (يقارب الطول الحقيقي).
  const segInfo = useMemo(() => {
    const sig = selectedFamilies[0] ? getSig(selectedFamilies[0].camp_id, campMap) : 'إدارة المخيم';
    const full = message.trim() ? `${message}\n${sig}` : '';
    return smsSegmentInfo(full);
  }, [message, selectedFamilies, campMap]);

  const sendSMS = async () => {
    const sel = selectedFamilies;
    const text = message.trim();
    if (!sel.length) return showError('لم تختر أي مستلم');
    if (!text) return showError('يرجى كتابة نص الرسالة');

    if (sel.length === 1) {
      const f = sel[0];
      const msg = text.replace(/\{اسم\}/g, resolveGreetingName(f, birthdayNames)) + '\n' + getSig(f.camp_id, campMap);
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

  // واتساب متاح بس لمستلم واحد محدَّد -- ما فيه إرسال جماعي حقيقي عبر رابط
  // مباشر زي الرسائل النصية (كل محادثة واتساب لازم تُفتح لحالها يدوياً).
  const sendWhatsApp = async () => {
    if (selectedFamilies.length !== 1) return showError('اختر مستلم واحد بالضبط لإرسال واتساب');
    const text = message.trim();
    if (!text) return showError('يرجى كتابة نص الرسالة');
    const f = selectedFamilies[0];
    const msg = text.replace(/\{اسم\}/g, resolveGreetingName(f, birthdayNames)) + '\n' + getSig(f.camp_id, campMap);
    const phone = f.phone1.replace(/^0/, '970'); // تحويل الصفر الأول لمفتاح فلسطين الدولي
    await Linking.openURL(`whatsapp://send?phone=${phone}&text=${encodeURIComponent(msg)}`);
    showSuccess('📲 جارٍ فتح واتساب...');
  };

  // إرسال مباشر من داخل التطبيق (بدون فتح تطبيق الرسائل) -- أندرويد فقط.
  // استيراد المكتبة يصير هنا بالداخل (مو بأعلى الملف) عمداً: المكتبة
  // أصلية (native) وتنهار فوراً لو استُدعيت بمنصة غير أندرويد (الويب أو
  // iOS) -- الاستدعاء الشرطي هذا يمنع كسر نسخة الويب بالكامل.
  const sendDirect = async () => {
    if (Platform.OS !== 'android') {
      return showError('الإرسال المباشر متاح على تطبيق أندرويد فقط');
    }
    const sel = selectedFamilies;
    const text = message.trim();
    if (!sel.length) return showError('لم تختر أي مستلم');
    if (!text) return showError('يرجى كتابة نص الرسالة');

    const proceed = await new Promise((resolve) => {
      Alert.alert(
        'إرسال مباشر',
        `رح تُرسَل الرسالة فوراً لـ${sel.length} مستلم من رصيدك بدون فتح تطبيق الرسائل.${
          sel.length > 25 ? '\n\n⚠️ العدد كبير -- أندرويد نفسه ممكن يوقف الإرسال ويطلب تأكيدك يدوياً كإجراء حماية من السبام (سلوك النظام، مو عطل بالتطبيق).' : ''
        }\n\nمتأكد تكمل؟`,
        [
          { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
          { text: 'إرسال', style: 'destructive', onPress: () => resolve(true) },
        ],
        { cancelable: false }
      );
    });
    if (!proceed) return;

    const SmsManager = require('expo-sms-manager');

    try {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.SEND_SMS, {
        title: 'إذن إرسال الرسائل',
        message: 'يحتاج التطبيق إذنك لإرسال رسائل SMS مباشرة من رقمك بدل فتح تطبيق الرسائل.',
        buttonPositive: 'موافق',
        buttonNegative: 'إلغاء',
      });
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        return showError('تم رفض إذن إرسال الرسائل');
      }
    } catch (e) {
      return showError('تعذّر طلب الإذن: ' + e.message);
    }

    setDirectSending(true);
    setDirectProgress({ done: 0, total: sel.length });
    let ok = 0;
    let fail = 0;

    for (let i = 0; i < sel.length; i++) {
      const f = sel[i];
      const msg = text.replace(/\{اسم\}/g, resolveGreetingName(f, birthdayNames)) + '\n' + getSig(f.camp_id, campMap);
      try {
        // مهلة 25 ثانية إجبارية -- بدونها، لو المكتبة الأصلية علّقت بانتظار
        // تقرير تسليم ما يوصل أبداً (سلوك معروف بالمكتبة على أجهزة حقيقية)،
        // الإرسال كله يتوقف عند "0 من X" للأبد بدون أي رسالة خطأ.
        const res = await Promise.race([
          SmsManager.sendLongSms(f.phone1, msg, { requestStatusReport: false }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 25000)),
        ]);
        // 'pending' يعني الرسالة اتسلّمت لراديو الجهاز وقيد المعالجة --
        // مو فشل فعلي. كان يُحسَب فشلاً غلط قبل هذا التصحيح، وهذا كان
        // السبب الأغلب وراء ظهور 'فشل' رغم وصول الرسالة فعلياً بالنهاية.
        if (res?.sent === 'sent' || res?.sent === 'sent_no_confirmation' || res?.sent === 'pending') ok++;
        else fail++;
      } catch {
        fail++;
      }
      setDirectProgress({ done: i + 1, total: sel.length });
      // فاصل بسيط بين كل رسالة وأخرى -- يقلّل احتمال تفعيل حماية أندرويد
      // ضد السبام (مو ضمانة كاملة، بس يخفف الاحتمال).
      await new Promise((r) => setTimeout(r, 350));
    }

    setDirectSending(false);
    setDirectProgress(null);
    if (fail === 0) showSuccess(`✅ اترسلت ${ok} رسالة بنجاح`);
    else showError(`✅ نجح ${ok} — ❌ فشل ${fail} (تأكد من الرصيد أو تغطية الشبكة)`);
  };

  const renderRecipient = ({ item: f }) => {
    const hasPhone = !!f.phone1;
    const issues = checkFamilyIssues(f, memsByFam[f.id]);
    const isSelected = selected.has(f.id);

    return (
      <Pressable
        style={[styles.recipientRow, isSelected && styles.recipientRowSelected, !hasPhone && styles.recipientDisabled]}
        onPress={() => hasPhone && toggle(f.id)}
        disabled={!hasPhone}
      >
        <Text style={styles.tentBadge}>⛺{f.tent || '—'}</Text>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={[styles.name, isSelected && styles.nameSelected]} numberOfLines={1}>
            {birthdayNames[f.id] ? `🎂 ${f.head_name}` : f.head_name}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{f.phone1 || '—'} · {campMap[f.camp_id] || '—'}</Text>
            {!!birthdayNames[f.id] && birthdayNames[f.id] !== f.head_name && (
              <Text style={styles.warnText}>🎂 عيد ميلاد: {birthdayNames[f.id]}</Text>
            )}
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
      <ScrollView contentContainerStyle={styles.listContent}>
        <PageHeader
          icon="💬"
          title="إرسال رسائل SMS"
          subtitle={<Text style={styles.headerSubtitle}>{selected.size} محدَّد</Text>}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎯 المستلمون</Text>
          <Pressable style={styles.recipientsSummaryBtn} onPress={() => setRecipientsModalVisible(true)}>
            <Text style={styles.recipientsSummaryArrow}>←</Text>
            <Text style={styles.recipientsSummaryText}>
              {selected.size > 0 ? `✅ ${selected.size} مستلم محدَّد — تعديل` : '👥 اضغط لاختيار المستلمين'}
            </Text>
          </Pressable>
          {!!filterCamp && (
            <Text style={styles.recipientsSummaryHint}>مفلترة حالياً على: {campMap[filterCamp]}</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>✍️ نص الرسالة</Text>
          <View style={styles.templatesRow}>
            {MESSAGE_TEMPLATES.map((t) => (
              <Pressable key={t.label} style={styles.templateChip} onPress={() => setMessage(t.text)}>
                <Text style={styles.templateChipText}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
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
            <Text style={styles.countText}>{message.length} حرف (بدون التوقيع)</Text>
            <Text style={styles.countText}>
              {segInfo.count || 0} رسالة{segInfo.encoding ? ` — ${segInfo.encoding}` : ''}
            </Text>
          </View>
          {segInfo.encoding === 'UCS-2 (عربي)' && segInfo.count > 1 && (
            <Text style={styles.segWarnText}>
              💡 الرسائل العربية تتحمّل 70 حرف بالرسالة الواحدة بس (مو 160) — نص رسالتك يتقسّم لـ{segInfo.count} رسائل فعلية عند شركة الاتصال، كل وحدة تُحسب لحالها بالتكلفة.
            </Text>
          )}
          <View style={styles.sendRow}>
            <Pressable style={[styles.sendBtn, !selected.size && styles.disabled]} onPress={sendSMS} disabled={!selected.size}>
              <Text style={styles.sendBtnText}>📨 إرسال لـ {selectedFamilies.length} مستلم</Text>
            </Pressable>
            <Pressable style={styles.copyBtn} onPress={copyNums}>
              <Text style={styles.copyBtnText}>📋 نسخ</Text>
            </Pressable>
          </View>
          {selectedFamilies.length === 1 && (
            <Pressable style={styles.whatsBtn} onPress={sendWhatsApp}>
              <Text style={styles.whatsBtnText}>📲 إرسال عبر واتساب لهذا المستلم</Text>
            </Pressable>
          )}

          {Platform.OS === 'android' && (
            <>
              <Pressable
                style={[styles.directBtn, directSending && styles.disabled]}
                onPress={sendDirect}
                disabled={directSending}
              >
                {directSending ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Text style={styles.directBtnText}>⚡ إرسال مباشر (بدون فتح تطبيق الرسائل)</Text>
                )}
              </Pressable>
              {directSending && directProgress && (
                <View style={styles.progressBox}>
                  <Text style={styles.progressText}>
                    جارٍ الإرسال: {directProgress.done} من {directProgress.total}
                  </Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${(directProgress.done / directProgress.total) * 100}%` }]} />
                  </View>
                </View>
              )}
              <Text style={styles.directHint}>
                ⚡ يرسل مباشرة من رصيدك بدون فتح أي تطبيق -- يحتاج إذنك أول مرة. لو العدد كبير، أندرويد ممكن يطلب تأكيد إضافي (حماية نظام، مو عطل).
              </Text>
            </>
          )}

          <Text style={styles.footerHint}>📱 يفتح تطبيق الرسائل بالأرقام المحددة — اضغط إرسال وسيُرسل للكل.</Text>
        </View>
      </ScrollView>

      <BottomSheetModal
        visible={recipientsModalVisible}
        onClose={() => setRecipientsModalVisible(false)}
        title={`👥 اختيار المستلمين (${selected.size} محدَّد)`}
      >
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

        {filtered.length === 0 ? (
          <EmptyState icon="👥" title="لا توجد أسر" />
        ) : (
          filtered.map((f) => <View key={f.id}>{renderRecipient({ item: f })}</View>)
        )}

        <Pressable style={styles.doneBtn} onPress={() => setRecipientsModalVisible(false)}>
          <Text style={styles.doneBtnText}>✅ تم — {selected.size} محدَّد</Text>
        </Pressable>
      </BottomSheetModal>

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
  recipientsSummaryBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.accent,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
  },
  recipientsSummaryText: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
  recipientsSummaryArrow: { color: colors.accent, fontSize: 16 },
  recipientsSummaryHint: { color: colors.muted, fontSize: 10, marginTop: 6, textAlign: 'right' },
  doneBtn: { backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  doneBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },

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
  recipientRowSelected: { backgroundColor: 'rgba(245,158,11,0.18)', borderColor: colors.accent },
  recipientDisabled: { opacity: 0.5 },
  tentBadge: { color: colors.accent, fontSize: 11, fontWeight: 'bold', minWidth: 40 },
  name: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
  nameSelected: { color: colors.accent },
  metaRow: { flexDirection: 'row-reverse', gap: 8, marginTop: 2 },
  metaText: { color: colors.muted, fontSize: 10 },
  warnText: { color: colors.red, fontSize: 10, fontWeight: 'bold' },

  hint: { color: colors.muted, fontSize: 11, marginBottom: 8, textAlign: 'right' },
  templatesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  templateChip: {
    backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)',
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
  },
  templateChipText: { color: colors.accent, fontSize: 11, fontWeight: 'bold' },
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
  segWarnText: { color: colors.accent, fontSize: 10, marginBottom: 10, textAlign: 'right', lineHeight: 15 },
  sendRow: { flexDirection: 'row', gap: 8 },
  whatsBtn: { backgroundColor: 'rgba(37,211,102,0.12)', borderWidth: 1, borderColor: '#25D366', paddingVertical: 11, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  whatsBtnText: { color: '#25D366', fontWeight: 'bold', fontSize: 12 },
  directBtn: { backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: colors.accent, paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  directBtnText: { color: colors.accent, fontWeight: '900', fontSize: 12 },
  directHint: { color: colors.muted, fontSize: 10, marginTop: 6, textAlign: 'right', lineHeight: 15 },
  progressBox: { marginTop: 8 },
  progressText: { color: colors.white, fontSize: 11, textAlign: 'right', marginBottom: 4 },
  progressTrack: { height: 6, backgroundColor: colors.surface2, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 999 },
  sendBtn: { flex: 1, backgroundColor: colors.accent, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  sendBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
  copyBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 12 },
  copyBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
  footerHint: { color: colors.muted, fontSize: 10, marginTop: 8, textAlign: 'right', lineHeight: 16 },

  campOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  campOptionText: { color: colors.white, fontSize: 13, textAlign: 'right' },
});
