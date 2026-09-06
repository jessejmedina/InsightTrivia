import { StyleSheet } from 'react-native';
import { Colors, CardShadow } from '../../constants/colors';

/** Shared visual scale so new components stay consistent with the game screens. */
export const tokens = {
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 8, md: 14, lg: 22, pill: 999 },
  timerRingSize: 96,
};

export const gameStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  exitBtn: { color: Colors.danger, fontWeight: '700', fontSize: 14 },
  roomCode: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  questionCounter: { color: Colors.accent, fontWeight: '800', fontSize: 14 },
  scoreBar: {
    flexDirection: 'row', gap: 8, padding: 12,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  scoreCard: {
    flex: 1, backgroundColor: Colors.card, borderRadius: 16, padding: 8,
    alignItems: 'center', borderWidth: 2, borderColor: 'transparent',
  },
  miniAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  miniAvatarEmoji: { fontSize: 16 },
  scoreName: { color: Colors.textSecondary, fontSize: 11, marginTop: 4 },
  scoreValue: { color: Colors.accent, fontWeight: '800', fontSize: 16 },
  phaseContainer: { flexGrow: 1, padding: 20, gap: 16, alignItems: 'center' },
  // Waiting
  waitTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, marginTop: 16 },
  codeBox: {
    backgroundColor: Colors.surface, borderRadius: 24, padding: 24, alignItems: 'center',
    width: '100%', ...CardShadow,
  },
  codeLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  codeBig: { fontSize: 42, fontWeight: '900', color: Colors.accent, letterSpacing: 6, marginVertical: 8 },
  codeHint: { color: Colors.textMuted, fontSize: 12 },
  playerListLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, alignSelf: 'flex-start' },
  waitPlayer: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'flex-start' },
  waitAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  waitPlayerName: { color: Colors.textPrimary, fontSize: 16, fontWeight: '600' },
  startBtn: {
    backgroundColor: Colors.accent, paddingVertical: 16, paddingHorizontal: 40, borderRadius: 22, marginTop: 16,
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 6,
  },
  startBtnText: { fontSize: 18, fontWeight: '800', color: Colors.white },
  waitingHint: { color: Colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 8 },
  // Question
  timerRing: {
    width: 90, height: 90, borderRadius: 45, borderWidth: 4,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  timerNumber: { fontSize: 32, fontWeight: '900' },
  timerLabel: { color: Colors.textMuted, fontSize: 11, marginTop: -4 },
  qMeta: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  qCategoryPill: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  qCategory: { color: Colors.white, fontSize: 13, fontWeight: '700' },
  qDifficulty: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  hintBox: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 14, width: '100%',
    borderLeftWidth: 4, borderLeftColor: Colors.primary, ...CardShadow,
  },
  hintLabel: { color: Colors.primary, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  hintText: { color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  questionBox: {
    backgroundColor: Colors.surface, borderRadius: 22, padding: 20, width: '100%',
    ...CardShadow,
  },
  questionText: { color: Colors.textPrimary, fontSize: 18, lineHeight: 28, fontWeight: '600', textAlign: 'center' },
  qRef: { color: Colors.textMuted, fontSize: 11, marginTop: 10, textAlign: 'center', fontStyle: 'italic' },
  buzzBtn: {
    backgroundColor: Colors.accent, borderRadius: 60, width: 160, height: 160,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
    shadowColor: Colors.accent, shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
  },
  buzzBtnText: { color: Colors.white, fontSize: 20, fontWeight: '900' },
  buzzBtnSub: { color: Colors.white, fontSize: 11, opacity: 0.8, marginTop: 4 },
  buzzedContainer: { width: '100%', alignItems: 'center', gap: 12 },
  buzzedLabel: { color: Colors.accent, fontSize: 18, fontWeight: '800' },
  answerContainer: { width: '100%', gap: 10 },
  answerPrompt: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
  answerInput: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    color: Colors.textPrimary, fontSize: 18, borderWidth: 1, borderColor: Colors.accent,
    textAlign: 'center',
  },
  submitBtn: { backgroundColor: Colors.accent, paddingVertical: 14, borderRadius: 18, alignItems: 'center' },
  submitBtnText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
  waitBuzzed: { gap: 8, alignItems: 'center', marginTop: 16 },
  waitBuzzedText: { color: Colors.textMuted, fontSize: 14 },
  // Reveal
  resultBanner: {
    width: '100%', borderRadius: 16, padding: 20,
    flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'center',
  },
  resultEmoji: { fontSize: 28 },
  resultText: { fontSize: 24, fontWeight: '900', color: Colors.white },
  revealBox: {
    backgroundColor: Colors.surface, borderRadius: 22, padding: 20, width: '100%',
    alignItems: 'center', ...CardShadow,
  },
  revealLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  revealAnswer: { color: Colors.success, fontSize: 24, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  revealRef: { color: Colors.textMuted, fontSize: 12, marginTop: 8, fontStyle: 'italic' },
  oppBtn: { backgroundColor: Colors.primary, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 18, width: '100%', alignItems: 'center' },
  oppBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  nextBtn: { backgroundColor: Colors.accent, paddingVertical: 14, paddingHorizontal: 40, borderRadius: 18 },
  nextBtnText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
  // Results
  resultsTitle: { fontSize: 32, fontWeight: '900', color: Colors.accent, marginTop: 8 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%',
    backgroundColor: Colors.surface, borderRadius: 20, padding: 14,
    borderWidth: 2, borderColor: 'transparent', ...CardShadow,
  },
  resultMedal: { fontSize: 24, width: 36 },
  resultName: { flex: 1, color: Colors.textPrimary, fontWeight: '700', fontSize: 16 },
  resultScore: { color: Colors.accent, fontWeight: '800', fontSize: 18 },
  leaveBtn: {
    backgroundColor: Colors.surface, paddingVertical: 16, paddingHorizontal: 40,
    borderRadius: 20, marginTop: 8, width: '100%', alignItems: 'center', ...CardShadow,
  },
  leaveBtnText: { color: Colors.textPrimary, fontWeight: '700', fontSize: 16 },
  // Reveal frame (shared shell)
  revealFrame: { flex: 1, width: '100%', padding: 20, alignItems: 'center' },
  revealMascotSlot: { alignSelf: 'flex-end', marginBottom: 4 },
  revealBody: { width: '100%', flex: 1, alignItems: 'center' },
  revealFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  revealPoints: { color: Colors.accent, fontWeight: '800', fontSize: 16 },
  revealTotal: { color: Colors.textSecondary, fontWeight: '700', fontSize: 14 },
  // Estimation
  sliderTrack: { width: '100%', height: 44, justifyContent: 'center', marginVertical: 8 },
  sliderHit: { position: 'absolute', left: 0, right: 0, height: 44, justifyContent: 'center' },
  sliderFill: { position: 'absolute', left: 0, height: 6, borderRadius: 3, backgroundColor: Colors.accentDim },
  sliderThumb: {
    position: 'absolute', left: 0, width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.accent, ...CardShadow,
  },
  estimateReadout: { fontSize: 40, fontWeight: '900', color: Colors.accent },
  estimateUnit: { fontSize: 16, color: Colors.textSecondary, fontWeight: '700' },
  numberLine: {
    width: '100%', height: 8, borderRadius: 4, backgroundColor: Colors.border, marginVertical: 20,
  },
  numberLineMark: { position: 'absolute', top: -6, width: 4, height: 20, borderRadius: 2, marginLeft: -2 },
  // Multiple choice
  optionsGrid: { width: '100%', gap: 10 },
  optionBtn: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    borderWidth: 2, borderColor: Colors.border, ...CardShadow,
  },
  optionBtnSelected: { borderColor: Colors.accent },
  optionBtnText: { color: Colors.textPrimary, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  // Ordering
  orderList: { width: '100%', gap: 8 },
  orderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderRadius: 14, padding: 12, ...CardShadow,
  },
  orderIndex: { width: 24, textAlign: 'center', fontWeight: '800', color: Colors.accent },
  orderItemText: { flex: 1, color: Colors.textPrimary, fontSize: 15 },
  orderArrows: { flexDirection: 'row', gap: 4 },
  orderArrowBtn: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.card,
    alignItems: 'center', justifyContent: 'center',
  },
  orderArrowText: { color: Colors.textSecondary, fontSize: 16, fontWeight: '700' },
  submittedBanner: { color: Colors.success, fontWeight: '700', fontSize: 16, textAlign: 'center', marginTop: 8 },
  // Matching
  matchColumns: { flexDirection: 'row', width: '100%', gap: 12 },
  matchColumn: { flex: 1, gap: 8 },
  matchItem: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 12,
    borderWidth: 2, borderColor: Colors.border, ...CardShadow,
  },
  matchItemSelected: { borderColor: Colors.accent },
  matchItemPaired: { borderColor: Colors.success, opacity: 0.6 },
  matchItemText: { color: Colors.textPrimary, fontSize: 14, textAlign: 'center' },
});
