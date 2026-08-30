import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Colors } from '../../constants/colors';
import { AVATARS } from '../../lib/gameLogic';
import type { PlayerRow } from '../../lib/gameTypes';
import { gameStyles as styles } from './gameStyles';

interface ResultsPhaseProps {
  players: PlayerRow[];
  myUserId: string;
  onLeave: () => void;
}

export function ResultsPhase({ players, myUserId, onLeave }: ResultsPhaseProps) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <ScrollView contentContainerStyle={styles.phaseContainer}>
      <Text style={styles.resultsTitle}>Game Over!</Text>

      {sorted.map((p, i) => {
        const av = AVATARS.find((a) => a.id === p.profiles?.avatar_id) ?? AVATARS[0];
        const isMe = p.user_id === myUserId;
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
        return (
          <View key={p.id} style={[styles.resultRow, isMe && { borderColor: Colors.accent }]}>
            <Text style={styles.resultMedal}>{medal}</Text>
            <View style={[styles.miniAvatar, { backgroundColor: p.profiles?.avatar_color }]}>
              <Text style={styles.miniAvatarEmoji}>{av.emoji}</Text>
            </View>
            <Text style={[styles.resultName, isMe && { color: Colors.accent }]}>{p.profiles?.username}</Text>
            <Text style={styles.resultScore}>{p.score} pts</Text>
          </View>
        );
      })}

      <TouchableOpacity style={styles.leaveBtn} onPress={onLeave}>
        <Text style={styles.leaveBtnText}>Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
