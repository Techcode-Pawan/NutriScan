import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip, Notice, Row } from '@/components/ui';
import { useAsk, useProduct } from '@/hooks/queries';
import { errorMessage } from '@/services/api';
import { useCompare } from '@/store/compare';
import { colors, font, radius, space } from '@/theme';
import type { AssistantAnswer } from '@/types/api';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  meta?: AssistantAnswer;
}

const DEFAULT_SUGGESTIONS = [
  'Why did this product get this rating?',
  'Which nutrient contributed most to the baseline score?',
  'What information is missing for this product?',
  'What do the listed ingredients mean?',
  'What are healthier alternatives?',
];

export default function Assistant() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const product = useProduct(key);
  const compare = useCompare();
  const ask = useAsk();
  const [input, setInput] = useState('');
  const [compareWith, setCompareWith] = useState<string | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const listRef = useRef<FlatList<Message>>(null);
  const others = compare.items.filter((i) => i.key !== key);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || ask.isPending) return;
    setInput('');
    setMessages((m) => [...m, { id: `${Date.now()}u`, role: 'user', text: q }]);
    try {
      const a = await ask.mutateAsync({ product: key, question: q, compareWith });
      setMessages((m) => [...m, { id: `${Date.now()}a`, role: 'assistant', text: a.answer, meta: a }]);
    } catch (e) {
      setMessages((m) => [...m, { id: `${Date.now()}e`, role: 'error', text: errorMessage(e) }]);
    }
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  };

  const suggestions = [...DEFAULT_SUGGESTIONS, ...(compareWith ? ['Which product has less sugar?', 'How do these two products compare?'] : [])];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          ListHeaderComponent={
            <View style={{ gap: space.md }}>
              <Text style={font.h3}>{product.data?.name ?? 'Product'}</Text>
              <Notice text="Answers use NutriScan's stored product data and the INR calculation. The assistant does not give medical advice." />
              {others.length ? (
                <View style={{ gap: 6 }}>
                  <Text style={font.small}>Compare with a product from your comparison list:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                    {others.map((o) => (
                      <Chip key={o.key} label={o.name} selected={compareWith === o.key} onPress={() => setCompareWith(compareWith === o.key ? undefined : o.key)} />
                    ))}
                  </ScrollView>
                </View>
              ) : null}
              <Text style={font.tiny}>SUGGESTED QUESTIONS</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {suggestions.map((s) => (
                  <Chip key={s} label={s} onPress={() => send(s)} />
                ))}
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={{
                alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                backgroundColor: item.role === 'user' ? colors.primary : item.role === 'error' ? colors.dangerSoft : colors.surface,
                borderRadius: radius.lg,
                padding: space.md,
                borderWidth: item.role === 'assistant' ? 1 : 0,
                borderColor: colors.border,
                gap: 6,
              }}
            >
              <Text style={{ color: item.role === 'user' ? '#fff' : item.role === 'error' ? colors.danger : colors.text, fontSize: 15, lineHeight: 21 }}>{item.text}</Text>
              {item.meta ? (
                <>
                  {item.meta.facts.length ? <Text style={font.small}>Based on: {item.meta.facts.map((f) => `${f.label} ${f.value}`).join(' · ')}</Text> : null}
                  <Text style={[font.small, { fontSize: 11 }]}>
                    {item.meta.provider === 'deterministic' ? 'Verified template answer' : `Phrased by ${item.meta.provider} from verified data`}
                    {item.meta.note ? ` · ${item.meta.note}` : ''}
                  </Text>
                </>
              ) : null}
            </View>
          )}
          ListFooterComponent={ask.isPending ? <Text style={font.small}>Thinking with verified data...</Text> : undefined}
        />
        <Row style={{ padding: space.md, backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask about this product"
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
            maxLength={500}
            accessibilityLabel="Question"
            style={{ flex: 1, backgroundColor: colors.background, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 15, color: colors.text }}
          />
          <Pressable
            onPress={() => send(input)}
            disabled={!input.trim() || ask.isPending}
            accessibilityRole="button"
            accessibilityLabel="Send question"
            style={{ backgroundColor: colors.primary, borderRadius: radius.md, padding: 11, opacity: !input.trim() || ask.isPending ? 0.5 : 1 }}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </Row>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
