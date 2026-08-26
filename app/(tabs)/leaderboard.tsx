import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../constants/colors';
import { AVATARS } from '../../lib/gameLogic';

interface LeaderboardEntry {
  id: string;
  username: string;
  avatar_id: string;
  avatar_color: string;
  points: number;
  wins: number;
  losses: number;
  accuracy_pct: number;
}

export default function LeaderboardScreen() {
  const { profile } = useAuthStore();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  async function loadLeaderboard() {
    setLoading(true);
    const { data } = await supabase
      .from('leaderboard')
      .select('*')
      .limit(50);
    if (data) setEntries(data as LeaderboardEntry[]);
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Rankings</Text>
      <Text style={styles.subtitle}>Top 50 players worldwide</Text>

      {loading ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item, index }) => {
            const avatar = AVATARS.find((a) => a.id === item.avatar_id) ?? AVATARS[0];
            const isMe = item.id === profile?.id;
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : null;
            return (
              <View style={[styles.row, isMe && styles.rowMe]}>
                <Text style={styles.rank}>{medal ?? `#${index + 1}`}</Text>
                <View style={[styles.avatarBadge, { backgroundColor: item.avatar_color }]}>
                  <Text style={styles.avatarEmoji}>{avatar.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.username, isMe && { color: Colors.accent }]}>
                    {item.username} {isMe ? '(you)' : ''}
                  </Text>
                  <Text style={styles.sub}>
                    {item.wins}W / {item.losses}L · {item.accuracy_pct}% accuracy
                  </Text>
                </View>
                <Text style={styles.points}>{item.points.toLocaleString()} pts</Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, padding: 20, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: '800', color: Colors.accent },
  subtitle: { color: Colors.textSecondary, fontSize: 14, marginBottom: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rowMe: { borderColor: Colors.accent },
  rank: { width: 36, textAlign: 'center', fontSize: 18, color: Colors.textSecondary, fontWeight: '700' },
  avatarBadge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 20 },
  username: { color: Colors.textPrimary, fontWeight: '700', fontSize: 15 },
  sub: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  points: { color: Colors.accent, fontWeight: '800', fontSize: 15 },
});
