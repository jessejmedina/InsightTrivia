/**
 * Admin / Question Manager tab
 * Lets Jesse add, edit, and deactivate trivia questions directly from the app.
 */
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Alert, Modal, ScrollView, Switch, ActivityIndicator,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';

interface Question {
  id: string;
  question: string;
  answer: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  reference: string | null;
  hint: string | null;
  active: boolean;
}

const CATEGORIES = [
  'General', 'Creation', 'History', 'Prophets', 'Jesus',
  'Apostles', 'Scriptures', 'Tabernacle', 'People', 'Geography',
];
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

const BLANK: Omit<Question, 'id' | 'active'> = {
  question: '',
  answer: '',
  category: 'General',
  difficulty: 'medium',
  reference: '',
  hint: '',
};

export default function AdminScreen() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState('All');

  useEffect(() => { loadQuestions(); }, []);

  async function loadQuestions() {
    setLoading(true);
    const { data } = await supabase
      .from('questions')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setQuestions(data as Question[]);
    setLoading(false);
  }

  function openAdd() {
    setEditing(null);
    setForm(BLANK);
    setShowForm(true);
  }

  function openEdit(q: Question) {
    setEditing(q);
    setForm({
      question: q.question,
      answer: q.answer,
      category: q.category,
      difficulty: q.difficulty,
      reference: q.reference ?? '',
      hint: q.hint ?? '',
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.question.trim() || !form.answer.trim()) {
      Alert.alert('Missing fields', 'Question and answer are required.');
      return;
    }
    setSaving(true);
    const payload = {
      question: form.question.trim(),
      answer: form.answer.trim(),
      category: form.category,
      difficulty: form.difficulty,
      reference: form.reference?.trim() || null,
      hint: form.hint?.trim() || null,
    };

    if (editing) {
      const { error } = await supabase
        .from('questions')
        .update(payload)
        .eq('id', editing.id);
      if (error) Alert.alert('Error', error.message);
    } else {
      const { error } = await supabase
        .from('questions')
        .insert({ ...payload, active: true });
      if (error) Alert.alert('Error', error.message);
    }

    setSaving(false);
    setShowForm(false);
    loadQuestions();
  }

  async function toggleActive(q: Question) {
    await supabase
      .from('questions')
      .update({ active: !q.active })
      .eq('id', q.id);
    setQuestions((prev) => prev.map((x) => x.id === q.id ? { ...x, active: !x.active } : x));
  }

  const displayed = filterCategory === 'All'
    ? questions
    : questions.filter((q) => q.category === filterCategory);

  const diffColor = { easy: Colors.success, medium: Colors.accent, hard: Colors.danger };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Questions</Text>
          <Text style={styles.subtitle}>{questions.length} total · {questions.filter((q) => q.active).length} active</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {['All', ...CATEGORIES].map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.filterChip, filterCategory === cat && styles.filterChipActive]}
            onPress={() => setFilterCategory(cat)}
          >
            <Text style={[styles.filterChipText, filterCategory === cat && styles.filterChipTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(q) => q.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.card, !item.active && styles.cardInactive]} onPress={() => openEdit(item)}>
              <View style={styles.cardHeader}>
                <Text style={[styles.difficulty, { color: diffColor[item.difficulty] }]}>
                  {item.difficulty.toUpperCase()}
                </Text>
                <Text style={styles.category}>{item.category}</Text>
                <Switch
                  value={item.active}
                  onValueChange={() => toggleActive(item)}
                  trackColor={{ true: Colors.success, false: Colors.border }}
                  thumbColor={item.active ? Colors.white : Colors.textMuted}
                  style={{ transform: [{ scale: 0.8 }] }}
                />
              </View>
              <Text style={styles.questionText} numberOfLines={2}>{item.question}</Text>
              <Text style={styles.answerText}>A: {item.answer}</Text>
              {item.reference ? <Text style={styles.ref}>{item.reference}</Text> : null}
            </TouchableOpacity>
          )}
        />
      )}

      {/* Add/Edit Modal */}
      <Modal visible={showForm} animationType="slide">
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editing ? 'Edit Question' : 'Add Question'}</Text>
            <TouchableOpacity onPress={() => setShowForm(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <FieldLabel text="Question *" />
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Type the question..."
            placeholderTextColor={Colors.textMuted}
            value={form.question}
            onChangeText={(t) => setForm((f) => ({ ...f, question: t }))}
            multiline
            numberOfLines={3}
          />

          <FieldLabel text="Answer *" />
          <TextInput
            style={styles.input}
            placeholder="Correct answer"
            placeholderTextColor={Colors.textMuted}
            value={form.answer}
            onChangeText={(t) => setForm((f) => ({ ...f, answer: t }))}
          />

          <FieldLabel text="Category" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            <View style={styles.chipRow}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.chip, form.category === cat && styles.chipActive]}
                  onPress={() => setForm((f) => ({ ...f, category: cat }))}
                >
                  <Text style={[styles.chipText, form.category === cat && styles.chipTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <FieldLabel text="Difficulty" />
          <View style={styles.chipRow}>
            {DIFFICULTIES.map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.chip, form.difficulty === d && styles.chipActive]}
                onPress={() => setForm((f) => ({ ...f, difficulty: d }))}
              >
                <Text style={[styles.chipText, form.difficulty === d && styles.chipTextActive]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <FieldLabel text="Reference (optional)" />
          <TextInput
            style={styles.input}
            placeholder="e.g. Insight, Vol. 1, p. 243"
            placeholderTextColor={Colors.textMuted}
            value={form.reference ?? ''}
            onChangeText={(t) => setForm((f) => ({ ...f, reference: t }))}
          />

          <FieldLabel text="Hint (optional)" />
          <TextInput
            style={styles.input}
            placeholder="1-sentence hint shown before question"
            placeholderTextColor={Colors.textMuted}
            value={form.hint ?? ''}
            onChangeText={(t) => setForm((f) => ({ ...f, hint: t }))}
          />

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.saveBtnText}>Save Question</Text>}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </Modal>
    </View>
  );
}

function FieldLabel({ text }: { text: string }) {
  return <Text style={fl.label}>{text}</Text>;
}
const fl = StyleSheet.create({ label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 4 } });

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '800', color: Colors.accent },
  subtitle: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  addBtn: { backgroundColor: Colors.accent, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  addBtnText: { color: Colors.bg, fontWeight: '700', fontSize: 15 },
  filterScroll: { flexGrow: 0, marginBottom: 12 },
  filterRow: { paddingHorizontal: 20, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  filterChipText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  filterChipTextActive: { color: Colors.bg },
  card: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 14, marginHorizontal: 20,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.border, gap: 6,
  },
  cardInactive: { opacity: 0.45 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  difficulty: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  category: { flex: 1, color: Colors.textMuted, fontSize: 12 },
  questionText: { color: Colors.textPrimary, fontSize: 15, lineHeight: 22 },
  answerText: { color: Colors.success, fontSize: 13, fontWeight: '600' },
  ref: { color: Colors.textMuted, fontSize: 11, fontStyle: 'italic' },
  // Modal
  modalScroll: { flex: 1, backgroundColor: Colors.bg },
  modalContainer: { padding: 24, paddingTop: 60 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 24, fontWeight: '800', color: Colors.accent },
  modalClose: { color: Colors.textSecondary, fontSize: 22, padding: 4 },
  input: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    color: Colors.textPrimary, fontSize: 15, borderWidth: 1, borderColor: Colors.border,
  },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: Colors.bg },
  saveBtn: { backgroundColor: Colors.accent, paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 24 },
  saveBtnText: { fontSize: 17, fontWeight: '700', color: Colors.bg },
});
