import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, Modal, ActivityIndicator, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useGameStore } from '../../store/gameStore';
import { Colors } from '../../constants/colors';
import { generateRoomCode, AVATARS } from '../../lib/gameLogic';

export default function HomeScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { setRoom, setMyPlayerId } = useGameStore();

  const [joinCode, setJoinCode] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [mode, setMode] = useState<'1v1' | 'teams'>('1v1');
  const [questionCount, setQuestionCount] = useState(10);
  const [loading, setLoading] = useState(false);

  const avatar = AVATARS.find((a) => a.id === profile?.avatar_id) ?? AVATARS[0];

  async function handleCreateGame() {
    if (!profile) return;
    setLoading(true);

    // Grab random questions
    const { data: questions } = await supabase
      .from('questions')
      .select('id')
      .eq('active', true)
      .limit(questionCount);

    if (!questions || questions.length < 5) {
      Alert.alert('Not enough questions', 'Need at least 5 active questions to start a game.');
      setLoading(false);
      return;
    }

    const shuffled = questions.sort(() => Math.random() - 0.5).slice(0, questionCount);
    const code = generateRoomCode();

    const { data: room, error } = await supabase
      .from('game_rooms')
      .insert({
        code,
        host_id: profile.id,
        mode,
        total_questions: shuffled.length,
        question_ids: shuffled.map((q) => q.id),
      })
      .select()
      .single();

    if (error || !room) {
      Alert.alert('Error', 'Could not create game room.');
      setLoading(false);
      return;
    }

    // Join as first player
    await supabase.from('game_players').insert({
      room_id: room.id,
      user_id: profile.id,
      team: mode === 'teams' ? 'A' : null,
    });

    setRoom({ ...room, players: [] });
    setMyPlayerId(profile.id);
    setLoading(false);
    setShowCreate(false);
    router.push(`/game/${room.id}`);
  }

  async function handleJoinGame() {
    if (!profile) return;
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      Alert.alert('Invalid code', 'Room codes are 6 characters.');
      return;
    }

    setLoading(true);
    const { data: room, error } = await supabase
      .from('game_rooms')
      .select('*')
      .eq('code', code)
      .eq('status', 'waiting')
      .single();

    if (error || !room) {
      Alert.alert('Room not found', 'No open game with that code.');
      setLoading(false);
      return;
    }

    // Check player count
    const { data: players } = await supabase
      .from('game_players')
      .select('*')
      .eq('room_id', room.id);

    const maxPlayers = room.mode === '1v1' ? 2 : 8;
    if (players && players.length >= maxPlayers) {
      Alert.alert('Room full', 'This game is already full.');
      setLoading(false);
      return;
    }

    // Already in room?
    const alreadyIn = players?.some((p) => p.user_id === profile.id);
    if (!alreadyIn) {
      const team = room.mode === 'teams'
        ? (players && players.filter((p) => p.team === 'A').length <= players.filter((p) => p.team === 'B').length ? 'A' : 'B')
        : null;
      await supabase.from('game_players').insert({
        room_id: room.id,
        user_id: profile.id,
        team,
      });
    }

    setRoom({ ...room, players: [] });
    setMyPlayerId(profile.id);
    setLoading(false);
    setShowJoin(false);
    router.push(`/game/${room.id}`);
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.username}>{profile?.username ?? '...'}</Text>
        </View>
        <View style={[styles.avatarBadge, { backgroundColor: profile?.avatar_color ?? Colors.primary }]}>
          <Text style={styles.avatarEmoji}>{avatar.emoji}</Text>
        </View>
      </View>

      {/* Stats bar */}
      <View style={styles.statsRow}>
        <StatPill label="Points" value={profile?.points ?? 0} accent />
        <StatPill label="Wins" value={profile?.wins ?? 0} />
        <StatPill label="Accuracy" value={
          profile && profile.total_questions_answered > 0
            ? `${Math.round(profile.correct_answers / profile.total_questions_answered * 100)}%`
            : '—'
        } />
      </View>

      {/* Play buttons */}
      <Text style={styles.sectionLabel}>Start a Game</Text>

      <TouchableOpacity style={styles.playCard} onPress={() => setShowCreate(true)}>
        <Text style={styles.playCardIcon}>⚔️</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.playCardTitle}>Create Game</Text>
          <Text style={styles.playCardSub}>Host a new room and invite others</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.playCard} onPress={() => setShowJoin(true)}>
        <Text style={styles.playCardIcon}>🔗</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.playCardTitle}>Join Game</Text>
          <Text style={styles.playCardSub}>Enter a 6-character room code</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>How to Play</Text>
      <View style={styles.howTo}>
        {[
          ['📖', 'Questions come from Insight on the Scriptures'],
          ['⏱️', 'You have 30 seconds — buzz in to stop the clock'],
          ['🏅', 'More time left = more points (up to 300 per question)'],
          ['❌', 'Wrong answer? Your opponent gets a shot for 100 pts'],
          ['🛒', 'Spend points in the shop to unlock avatars'],
        ].map(([emoji, text], i) => (
          <View key={i} style={styles.howToRow}>
            <Text style={styles.howToEmoji}>{emoji}</Text>
            <Text style={styles.howToText}>{text}</Text>
          </View>
        ))}
      </View>

      {/* Create Game Modal */}
      <Modal visible={showCreate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Create Game</Text>

            <Text style={styles.modalLabel}>Mode</Text>
            <View style={styles.modeRow}>
              {(['1v1', 'teams'] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
                  onPress={() => setMode(m)}
                >
                  <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                    {m === '1v1' ? '1 vs 1' : 'Teams'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>Questions</Text>
            <View style={styles.modeRow}>
              {[5, 10, 15, 20].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.modeBtn, questionCount === n && styles.modeBtnActive]}
                  onPress={() => setQuestionCount(n)}
                >
                  <Text style={[styles.modeBtnText, questionCount === n && styles.modeBtnTextActive]}>
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.btn, loading && { opacity: 0.6 }]}
              onPress={handleCreateGame}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.btnText}>Create Room</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Join Game Modal */}
      <Modal visible={showJoin} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Join Game</Text>
            <Text style={styles.modalLabel}>Room Code</Text>
            <TextInput
              style={styles.codeInput}
              placeholder="ABCD12"
              placeholderTextColor={Colors.textMuted}
              value={joinCode}
              onChangeText={setJoinCode}
              autoCapitalize="characters"
              maxLength={6}
            />
            <TouchableOpacity
              style={[styles.btn, loading && { opacity: 0.6 }]}
              onPress={handleJoinGame}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.btnText}>Join Room</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowJoin(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function StatPill({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <View style={statStyles.pill}>
      <Text style={[statStyles.value, accent && { color: Colors.accent }]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  pill: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  value: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  label: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
});

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.bg },
  container: { padding: 20, paddingTop: 60, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  greeting: { color: Colors.textSecondary, fontSize: 14 },
  username: { color: Colors.textPrimary, fontSize: 22, fontWeight: '700' },
  avatarBadge: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 24 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  sectionLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  playCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  playCardIcon: { fontSize: 28 },
  playCardTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700' },
  playCardSub: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  arrow: { color: Colors.textMuted, fontSize: 22 },
  howTo: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
  },
  howToRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  howToEmoji: { fontSize: 18, width: 28 },
  howToText: { color: Colors.textSecondary, fontSize: 14, flex: 1, lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 28,
    gap: 12,
  },
  modalTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  modalLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  modeRow: { flexDirection: 'row', gap: 10 },
  modeBtn: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  modeBtnText: { color: Colors.textSecondary, fontWeight: '600' },
  modeBtnTextActive: { color: Colors.bg },
  btn: {
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: { fontSize: 17, fontWeight: '700', color: Colors.bg },
  cancelText: { textAlign: 'center', color: Colors.textMuted, marginTop: 8, fontSize: 14 },
  codeInput: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    color: Colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
