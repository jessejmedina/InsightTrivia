import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal,
} from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../constants/colors';
import { AVATARS, AVATAR_COLORS, COSMETIC_COSTS, DEFAULT_UNLOCKED } from '../../lib/gameLogic';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
  const { profile, setProfile, signOut } = useAuthStore();
  const [showShop, setShowShop] = useState(false);

  if (!profile) return null;

  const avatar = AVATARS.find((a) => a.id === profile.avatar_id) ?? AVATARS[0];
  const accuracy = profile.total_questions_answered > 0
    ? Math.round(profile.correct_answers / profile.total_questions_answered * 100)
    : 0;

  async function selectAvatar(id: string) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ avatar_id: id })
      .eq('id', profile.id)
      .select()
      .single();
    if (!error && data) setProfile(data as any);
  }

  async function selectColor(color: string) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ avatar_color: color })
      .eq('id', profile.id)
      .select()
      .single();
    if (!error && data) setProfile(data as any);
  }

  async function purchaseAvatar(id: string) {
    const cost = COSMETIC_COSTS[id] ?? 0;
    if (profile.points < cost) {
      Alert.alert('Not enough points', `You need ${cost} points to unlock this.`);
      return;
    }
    const newOwned = [...new Set([...profile.owned_cosmetics, id])];
    const { data, error } = await supabase
      .from('profiles')
      .update({ owned_cosmetics: newOwned, points: profile.points - cost })
      .eq('id', profile.id)
      .select()
      .single();
    if (!error && data) setProfile(data as any);
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {/* Avatar display */}
      <View style={styles.heroSection}>
        <View style={[styles.avatarLarge, { backgroundColor: profile.avatar_color }]}>
          <Text style={styles.avatarEmojiBig}>{avatar.emoji}</Text>
        </View>
        <Text style={styles.username}>{profile.username}</Text>
        <Text style={styles.points}>{profile.points.toLocaleString()} points</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsGrid}>
        <StatCard label="Wins" value={profile.wins} color={Colors.success} />
        <StatCard label="Losses" value={profile.losses} color={Colors.danger} />
        <StatCard label="Accuracy" value={`${accuracy}%`} color={Colors.primary} />
        <StatCard label="Answered" value={profile.total_questions_answered} color={Colors.accent} />
      </View>

      {/* Avatar picker */}
      <Text style={styles.sectionLabel}>Your Avatar</Text>
      <View style={styles.avatarGrid}>
        {AVATARS.map((av) => {
          const owned = profile.owned_cosmetics.includes(av.id) || DEFAULT_UNLOCKED.includes(av.id);
          const cost = COSMETIC_COSTS[av.id];
          const active = profile.avatar_id === av.id;
          return (
            <TouchableOpacity
              key={av.id}
              style={[styles.avatarOption, active && styles.avatarOptionActive, !owned && styles.avatarLocked]}
              onPress={() => owned ? selectAvatar(av.id) : purchaseAvatar(av.id)}
            >
              <Text style={styles.avatarOptionEmoji}>{av.emoji}</Text>
              {!owned && cost && <Text style={styles.lockPrice}>{cost}pts</Text>}
              {active && <Text style={styles.activeCheck}>✓</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Color picker */}
      <Text style={styles.sectionLabel}>Your Color</Text>
      <View style={styles.colorRow}>
        {AVATAR_COLORS.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.colorDot, { backgroundColor: c }, profile.avatar_color === c && styles.colorDotActive]}
            onPress={() => selectColor(c)}
          />
        ))}
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function StatCard({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <View style={sc.card}>
      <Text style={[sc.value, { color }]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}
const sc = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  value: { fontSize: 24, fontWeight: '800' },
  label: { color: Colors.textSecondary, fontSize: 12, marginTop: 4 },
});

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.bg },
  container: { padding: 20, paddingTop: 60, gap: 12, paddingBottom: 40 },
  heroSection: { alignItems: 'center', gap: 8, marginBottom: 8 },
  avatarLarge: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmojiBig: { fontSize: 42 },
  username: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  points: { fontSize: 16, color: Colors.accent, fontWeight: '700' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectionLabel: {
    color: Colors.textMuted, fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1, marginTop: 8,
  },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  avatarOption: {
    width: 70, height: 70, borderRadius: 14,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  avatarOptionActive: { borderColor: Colors.accent, borderWidth: 2 },
  avatarLocked: { opacity: 0.5 },
  avatarOptionEmoji: { fontSize: 30 },
  lockPrice: { fontSize: 9, color: Colors.accent, fontWeight: '700', marginTop: 2 },
  activeCheck: { position: 'absolute', top: 4, right: 6, color: Colors.accent, fontWeight: '800', fontSize: 12 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colorDot: { width: 36, height: 36, borderRadius: 18 },
  colorDotActive: { borderWidth: 3, borderColor: Colors.white },
  signOutBtn: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  signOutText: { color: Colors.danger, fontWeight: '700', fontSize: 15 },
});
