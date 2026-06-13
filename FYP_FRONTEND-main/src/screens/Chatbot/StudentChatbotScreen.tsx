import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Send, Bot, PlusCircle } from 'lucide-react-native';
import { colors, radii } from '../../theme/colors';
import { askStudentChatbot, type ChatTurn } from '../../services/chatbotService';

const QUICK_PROMPTS = [
  'Explain photosynthesis in simple words',
  'Give me 5 important exam topics',
  'Create a short revision plan for this chapter',
];

export default function StudentChatbotScreen() {
  const router = useRouter();
  const chatRef = useRef<ScrollView | null>(null);
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([
    {
      role: 'assistant',
      content:
        'Hi! I am your study assistant. Ask anything about your syllabus, topics, or past paper questions.',
    },
  ]);

  const canSend = useMemo(() => text.trim().length > 0 && !busy, [text, busy]);

  useEffect(() => {
    const t = setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 40);
    return () => clearTimeout(t);
  }, [messages, busy]);

  const startNewChat = () => {
    setMessages([
      {
        role: 'assistant',
        content:
          'New chat started. Ask me anything and I will explain it in a student-friendly way.',
      },
    ]);
    setText('');
  };

  const onSend = async () => {
    const message = text.trim();
    if (!message || busy) return;

    const userTurn: ChatTurn = { role: 'user', content: message };
    const nextHistory = [...messages, userTurn];
    setMessages(nextHistory);
    setText('');
    setBusy(true);

    try {
      const data = await askStudentChatbot({
        message,
        subject: subject.trim() || undefined,
        topic: topic.trim() || undefined,
        history: nextHistory.slice(-8),
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Chat failed';
      if (/401|unauthor|sign in|credential/i.test(msg)) {
        Alert.alert('Sign in required', 'Please login as student to use chatbot.');
      } else {
        Alert.alert('Chatbot', msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const sendQuickPrompt = (prompt: string) => {
    if (busy) return;
    setText(prompt);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <ArrowLeft size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>PrepifyAI Chat</Text>
            <Text style={styles.subtitle}>Ask, learn, and revise faster</Text>
          </View>
          <TouchableOpacity onPress={startNewChat} style={styles.newChatBtn} disabled={busy}>
            <PlusCircle size={18} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.filters}>
          <TextInput
            placeholder="Subject (optional)"
            placeholderTextColor={colors.textSubtle}
            value={subject}
            onChangeText={setSubject}
            style={styles.input}
          />
          <TextInput
            placeholder="Topic (optional)"
            placeholderTextColor={colors.textSubtle}
            value={topic}
            onChangeText={setTopic}
            style={styles.input}
          />
        </View>

        <View style={styles.quickPrompts}>
          {QUICK_PROMPTS.map((p) => (
            <Pressable
              key={p}
              onPress={() => sendQuickPrompt(p)}
              style={({ pressed }) => [styles.promptChip, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.promptTxt}>{p}</Text>
            </Pressable>
          ))}
        </View>

        <ScrollView ref={chatRef} style={styles.chat} contentContainerStyle={styles.chatContent}>
          {messages.map((m, idx) => {
            const isUser = m.role === 'user';
            return (
              <View key={`${m.role}-${idx}`} style={[styles.msgRow, isUser && styles.msgRowUser]}>
                {!isUser && (
                  <View style={styles.botBadge}>
                    <Bot size={14} color={colors.accent} />
                  </View>
                )}
                <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
                  <Text style={styles.msgText}>{m.content}</Text>
                </View>
              </View>
            );
          })}
          {busy && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.loadingText}>Thinking...</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            placeholder="Ask your question..."
            placeholderTextColor={colors.textSubtle}
            value={text}
            onChangeText={setText}
            style={styles.composerInput}
            multiline
            returnKeyType="send"
            onSubmitEditing={onSend}
          />
          <TouchableOpacity
            onPress={onSend}
            disabled={!canSend}
            style={[styles.sendBtn, !canSend && styles.sendBtnOff]}
          >
            <Send size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  subtitle: { color: colors.textSubtle, fontSize: 11, marginTop: 1 },
  newChatBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filters: { paddingHorizontal: 12, paddingTop: 12, gap: 8 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quickPrompts: { paddingHorizontal: 12, paddingTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  promptChip: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  promptTxt: { color: colors.textMuted, fontSize: 12 },
  chat: { flex: 1 },
  chatContent: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 18, gap: 10 },
  msgRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  msgRowUser: { justifyContent: 'flex-end' },
  botBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.xl,
    borderWidth: 1,
  },
  userBubble: {
    backgroundColor: '#2A3555',
    borderColor: '#3B4D7A',
  },
  botBubble: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  msgText: { color: colors.text, lineHeight: 20 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  loadingText: { color: colors.textSubtle },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  composerInput: {
    flex: 1,
    maxHeight: 120,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sendBtnOff: { opacity: 0.45 },
});
