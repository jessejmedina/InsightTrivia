import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, CardShadow } from '../../constants/colors';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.icon}>📖</Text>
        <Text style={styles.title}>Insight Trivia</Text>
        <Text style={styles.subtitle}>
          Bible knowledge challenge{'\n'}based on Insight on the Scriptures
        </Text>
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push('/(auth)/signup')}
        >
          <Text style={styles.primaryBtnText}>Create Account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.secondaryBtnText}>Sign In</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>Challenge friends and families worldwide</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    paddingHorizontal: 32,
    justifyContent: 'space-between',
    paddingTop: 100,
    paddingBottom: 60,
  },
  hero: {
    alignItems: 'center',
    gap: 16,
  },
  icon: {
    fontSize: 80,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.accent,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  buttons: {
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: Colors.accent,
    paddingVertical: 18,
    borderRadius: 24,
    alignItems: 'center',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 6,
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.white,
  },
  secondaryBtn: {
    backgroundColor: Colors.surface,
    paddingVertical: 18,
    borderRadius: 24,
    alignItems: 'center',
    ...CardShadow,
  },
  secondaryBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  footer: {
    textAlign: 'center',
    color: Colors.textMuted,
    fontSize: 13,
  },
});
