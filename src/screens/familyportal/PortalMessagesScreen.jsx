import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { fetchPortalConversations, fetchPortalMessages, sendPortalMessage, markPortalMessagesRead } from '../../lib/supabase';
import { showToast } from '../../utils/toast';
import { formatDateTime } from '../../lib/utils';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import colors from '../../theme/colors';

export default function PortalMessagesScreen() {
  const { orgId, profile } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openFamily, setOpenFamily] = useState(null); // { familyId, headName, campName } | null
  const [thread, setThread] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const loadConversations = useCallback(async () => {
    if (!orgId) return;
    try {
      const rows = await fetchPortalConversations(orgId);
      rows.sort((a, b) => new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at));
      setConversations(rows);
    } catch {
      showToast('تعذّر تحميل المحادثات', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useFocusEffect(useCallback(() => { loadConversations(); }, [loadConversations]));

  const openThread = async (conv) => {
    setOpenFamily(conv);
    const msgs = await fetchPortalMessages(conv.familyId);
    setThread(msgs);
    markPortalMessagesRead(conv.familyId, 'staff').then(loadConversations);
  };

  const handleReply = async () => {
    if (!reply.trim() || !openFamily) return;
    setSending(true);
    try {
      const sent = await sendPortalMessage({
        orgId,
        familyId: openFamily.familyId,
        senderRole: 'staff',
        senderName: profile?.full_name || 'إدارة المخيم',
        message: reply.trim(),
      });
      setThread((prev) => [...prev, sent]);
      setReply('');
    } catch {
      showToast('تعذّر إرسال الرد', 'error');
    } finally {
      setSending(false);
    }
  };

  const styles = getStyles();

  if (openFamily) {
    return (
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.threadHeader}>
            <Pressable onPress={() => { setOpenFamily(null); loadConversations(); }} hitSlop={12}>
              <Text style={styles.backArrow}>‹ رجوع</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.threadTitle}>{openFamily.headName}</Text>
              <Text style={styles.threadSubtitle}>{openFamily.campName}</Text>
            </View>
          </View>

          <FlatList
            data={thread}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.threadList}
            renderItem={({ item: m }) => (
              <View style={[styles.bubble, m.sender_role === 'staff' ? styles.bubbleStaff : styles.bubbleFamily]}>
                <Text style={styles.bubbleSender}>{m.sender_role === 'staff' ? (m.sender_name || 'أنت') : openFamily.headName}</Text>
                <Text style={styles.bubbleText}>{m.message}</Text>
                <Text style={styles.bubbleTime}>{formatDateTime(m.created_at)}</Text>
              </View>
            )}
          />

          <View style={styles.replyRow}>
            <TextInput
              value={reply}
              onChangeText={setReply}
              placeholder="اكتب ردّك..."
              placeholderTextColor={colors.muted}
              style={styles.replyInput}
              multiline
              editable={!sending}
            />
            <Pressable style={[styles.sendBtn, sending && styles.btnDisabled]} onPress={handleReply} disabled={sending}>
              <Text style={styles.sendBtnText}>{sending ? '⏳' : '📤'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.familyId}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <PageHeader icon="💬" title="رسائل بوابة الأسرة" subtitle={<Text style={styles.headerSubtitle}>{conversations.length} محادثة</Text>} />
        }
        renderItem={({ item: conv }) => (
          <Pressable style={styles.convCard} onPress={() => openThread(conv)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.convName}>{conv.headName || '—'}</Text>
              <Text style={styles.convMeta}>{conv.campName || '—'}</Text>
              <Text style={styles.convLast} numberOfLines={1}>
                {conv.lastMessage.sender_role === 'staff' ? '↩️ ' : ''}{conv.lastMessage.message}
              </Text>
            </View>
            {conv.unread > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{conv.unread}</Text>
              </View>
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          loading ? <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} /> : <EmptyState icon="💬" title="لا توجد محادثات بعد" />
        }
      />
    </SafeAreaView>
  );
}

const getStyles = () =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    listContent: { padding: 16 },
    headerSubtitle: { color: colors.muted, fontSize: 11, textAlign: 'center' },

    convCard: {
      flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: colors.surface,
      borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 8, gap: 10,
    },
    convName: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'right' },
    convMeta: { color: colors.muted, fontSize: 10, marginTop: 2, textAlign: 'right' },
    convLast: { color: colors.muted, fontSize: 11, marginTop: 4, textAlign: 'right' },
    unreadBadge: { backgroundColor: colors.accent, borderRadius: 999, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
    unreadBadgeText: { color: '#000', fontWeight: '900', fontSize: 11 },

    threadHeader: {
      flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 16,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    backArrow: { color: colors.accent, fontSize: 13, fontWeight: 'bold' },
    threadTitle: { color: colors.white, fontWeight: '900', fontSize: 14, textAlign: 'right' },
    threadSubtitle: { color: colors.muted, fontSize: 11, textAlign: 'right' },
    threadList: { padding: 16 },

    bubble: { maxWidth: '85%', borderRadius: 12, padding: 10, marginBottom: 10 },
    bubbleFamily: { alignSelf: 'flex-start', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    bubbleStaff: { alignSelf: 'flex-end', backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
    bubbleSender: { color: colors.muted, fontSize: 9, marginBottom: 3, textAlign: 'right' },
    bubbleText: { color: colors.white, fontSize: 12, textAlign: 'right', lineHeight: 18 },
    bubbleTime: { color: colors.muted, fontSize: 8, marginTop: 4, textAlign: 'right' },

    replyRow: {
      flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 8, padding: 12,
      borderTopWidth: 1, borderTopColor: colors.border,
    },
    replyInput: {
      flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: colors.white, fontSize: 13,
      textAlign: 'right', maxHeight: 100,
    },
    sendBtn: { backgroundColor: colors.accent, borderRadius: 12, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    sendBtnText: { fontSize: 18 },
    btnDisabled: { opacity: 0.6 },
  });
