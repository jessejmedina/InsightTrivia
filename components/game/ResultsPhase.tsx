import { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { AVATARS } from '../../lib/gameLogic';
import type { PlayerRow, RoundHistoryEntry } from '../../lib/gameTypes';
import { gameStyles as styles } from './gameStyles';
import { Mascot } from '../Mascot';

function Bar({ frac, color }: { frac: number; color: string }) {
  const w = useSharedValue(0);
  useEffect(() => { w.value = withTiming(frac, { duration: 700 }); }, [frac]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={styles.resultBarTrack}>
      <Animated.View style={[styles.resultBarFill, { backgroundColor: color }, style]} />
    </View>
  );
}

export function ResultsPhase({
  players, myUserId, onLeave, roundHistory, questionCount,
}: {
  players: PlayerRow[]; myUserId: string; onLeave: () => void;
  roundHistory: RoundHistoryEntry[]; questionCount: number;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const me = players.find((p) => p.user_id === myUserId);
  const top = sorted[0]?.score ?? 0;
  const tie = sorted.length >= 2 && sorted[0].score === sorted[1].score;
  const iWon = me != null && me.score === top && !tie;
  const maxScore = Math.max(1, top);

  return (
    <ScrollView contentContainerStyle={styles.phaseContainer}>
      <Mascot mood={iWon ? 'cheer' : tie ? 'idle' : 'sad'} size={96} />
      <Text style={styles.resultsTitle}>{tie ? 'Tie!' : iWon ? 'You win!' : 'Good game'}</Text>

      {sorted.map((p) => {
        const av = AVATARS.find((a) => a.id === p.profiles?.avatar_id) ?? AVATARS[0];
        const isMe = p.user_id === myUserId;
        return (
          <View key={p.id} style={[styles.resultRow, isMe && { borderColor: Colors.accent }]}>
            <View style={[styles.miniAvatar, { backgroundColor: p.profiles?.avatar_color }]}>
              <Text style={styles.miniAvatarEmoji}>{av.emoji}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.resultName, isMe && { color: Colors.accent }]}>{p.profiles?.username}</Text>
              <Bar frac={p.score / maxScore} color={isMe ? Colors.accent : Colors.textMuted} />
            </View>
            <Text style={styles.resultScore}>{p.score}</Text>
          </View>
        );
      })}

      {roundHistory.length > 0 && (
        <View style={styles.resultStrip}>
          {Array.from({ length: questionCount }, (_, i) => {
            const entry = roundHistory.find((e) => e.questionIndex === i);
            const mine = entry?.points[myUserId] ?? 0;
            return <View key={i} style={[styles.resultPip, { backgroundColor: mine > 0 ? Colors.success : Colors.border }]} />;
          })}
        </View>
      )}

      <TouchableOpacity style={styles.leaveBtn} onPress={onLeave}>
        <Text style={styles.leaveBtnText}>Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
