import { View, Text, TouchableOpacity } from 'react-native';
import { AVATARS } from '../../lib/gameLogic';
import type { PlayerRow } from '../../lib/gameTypes';
import { gameStyles as styles } from './gameStyles';
import { Mascot } from '../Mascot';

interface WaitingPhaseProps {
  players: PlayerRow[];
  isHost: boolean;
  onStart: () => void;
  roomCode: string | undefined;
}

export function WaitingPhase({ players, isHost, onStart, roomCode }: WaitingPhaseProps) {
  return (
    <View style={styles.phaseContainer}>
      <Mascot mood="idle" size={88} />
      <Text style={styles.waitTitle}>Waiting for players</Text>
      <View style={styles.codeBox}>
        <Text style={styles.codeLabel}>Room Code</Text>
        <Text style={styles.codeBig}>{roomCode}</Text>
        <Text style={styles.codeHint}>Share this code with friends</Text>
      </View>

      <Text style={styles.playerListLabel}>Players ({players.length})</Text>
      {players.map((p) => {
        const av = AVATARS.find((a) => a.id === p.profiles?.avatar_id) ?? AVATARS[0];
        return (
          <View key={p.id} style={styles.waitPlayer}>
            <View style={[styles.waitAvatar, { backgroundColor: p.profiles?.avatar_color }]}>
              <Text style={{ fontSize: 20 }}>{av.emoji}</Text>
            </View>
            <Text style={styles.waitPlayerName}>{p.profiles?.username}</Text>
          </View>
        );
      })}

      {isHost && (
        <TouchableOpacity
          // DEV-ONLY BYPASS — remove before opening to real users
          style={[styles.startBtn, (players.length < 2 && !__DEV__) && { opacity: 0.4 }]}
          onPress={onStart}
          disabled={players.length < 2 && !__DEV__}
        >
          <Text style={styles.startBtnText}>
            {players.length < 2
              ? (__DEV__ ? 'Start (Solo Dev Test)' : 'Waiting for 2nd player...')
              : 'Start Game!'}
          </Text>
        </TouchableOpacity>
      )}
      {!isHost && (
        <Text style={styles.waitingHint}>Waiting for host to start...</Text>
      )}
    </View>
  );
}
