import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { Mascot, type MascotMood } from '../Mascot';
import { Celebration } from './Celebration';
import { gameStyles as styles } from './gameStyles';

/**
 * Shared shell for every question type's reveal: mascot slot on top, the
 * type's own breakdown in the body, points + running total in the footer.
 * The host times the auto-advance; this component is presentation only.
 */
export function RevealFrame({
  mascotMood, pointsThisRound, runningTotal, celebrate, children,
}: {
  mascotMood: MascotMood;
  pointsThisRound: number;
  runningTotal: number;
  celebrate: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.revealFrame}>
      <View style={styles.revealMascotSlot}>
        <Mascot mood={mascotMood} size={72} />
      </View>
      <View style={styles.revealBody}>{children}</View>
      <View style={styles.revealFooter}>
        <Text style={styles.revealPoints}>
          {pointsThisRound > 0 ? `+${pointsThisRound}` : '—'} this round
        </Text>
        <Text style={styles.revealTotal}>{runningTotal} total</Text>
      </View>
      <Celebration play={celebrate} />
    </View>
  );
}
