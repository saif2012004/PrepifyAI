import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  ActionSheetIOS,
  Platform,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Edit2, Camera, ChevronRight, Trophy, Download, Upload, Lock, TrendingUp } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/context/AuthContext';
import { colors, radii } from '../../src/theme/colors';
import {
  gamificationService,
  GamificationProfile,
  LeaderboardEntry,
  AchievementInfo,
} from '../../src/services/gamificationService';
import { syncService } from '../../src/services/syncService';
import { feedbackService, AppFeedbackCategory } from '../../src/services/feedbackService';

export default function ProfileScreen() {
  const { user, updateProfile, isAuthenticated } = useAuth();
  const router = useRouter();
  const [game, setGame] = useState<GamificationProfile | null>(null);
  const [achievements, setAchievements] = useState<AchievementInfo[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [gameLoading, setGameLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncBusy, setSyncBusy] = useState(false);
  const [appFbBody, setAppFbBody] = useState('');
  const [appFbCategory, setAppFbCategory] = useState<AppFeedbackCategory>('general');
  const [appFbStars, setAppFbStars] = useState<number | null>(null);
  const [appFbBusy, setAppFbBusy] = useState(false);
  const appFbTextLen = appFbBody.trim().length;

  const APP_FB_CATS: { key: AppFeedbackCategory; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'bug', label: 'Bug' },
    { key: 'suggestion', label: 'Idea' },
    { key: 'content', label: 'Content' },
    { key: 'other', label: 'Other' },
  ];

  const loadGamification = useCallback(async () => {
    if (!isAuthenticated) {
      setGame(null);
      setLeaderboard([]);
      return;
    }
    setGameLoading(true);
    try {
      try {
        setGame(await gamificationService.getProfile());
      } catch {
        setGame(null);
      }
      try {
        setAchievements(await gamificationService.getAchievements());
      } catch {
        setAchievements([]);
      }
      try {
        setLeaderboard(await gamificationService.getLeaderboard(8));
      } catch {
        setLeaderboard([]);
      }
    } finally {
      setGameLoading(false);
    }
  }, [isAuthenticated]);

  const refreshPending = useCallback(async () => {
    const n = await syncService.getPendingCount();
    setPendingCount(n);
  }, []);

  useEffect(() => {
    loadGamification();
  }, [loadGamification]);

  useEffect(() => {
    refreshPending();
  }, [refreshPending]);

  const pickImageFromGallery = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert('Permission required', 'Allow photo library access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      updateProfile({ avatar: result.assets[0].uri });
      Alert.alert('Updated', 'Profile photo saved.');
    }
  };

  const takePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert('Permission required', 'Allow camera access in Settings.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      updateProfile({ avatar: result.assets[0].uri });
      Alert.alert('Updated', 'Profile photo saved.');
    }
  };

  const handleChangePhoto = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take photo', 'Choose from gallery'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) takePhoto();
          else if (buttonIndex === 2) pickImageFromGallery();
        }
      );
    } else {
      Alert.alert('Profile photo', 'Choose an option', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take photo', onPress: takePhoto },
        { text: 'Gallery', onPress: pickImageFromGallery },
      ]);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.bg]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.5 }}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.screenTitle}>Profile</Text>
            <TouchableOpacity
              onPress={() => router.push('/profile/edit' as never)}
              style={styles.editPill}
              activeOpacity={0.85}
            >
              <Edit2 size={18} color={colors.accent} strokeWidth={2} />
              <Text style={styles.editText}>Edit</Text>
              <ChevronRight size={18} color={colors.textSubtle} />
            </TouchableOpacity>
          </View>

          <View style={styles.heroCard}>
            <View style={styles.avatarWrap}>
              {user?.avatar ? (
                <Image source={{ uri: user.avatar }} style={styles.avatarImg} />
              ) : (
                <LinearGradient colors={[colors.primary, colors.gradientEnd]} style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarLetter}>{user?.name?.charAt(0).toUpperCase() || '?'}</Text>
                </LinearGradient>
              )}
              <TouchableOpacity style={styles.camBtn} onPress={handleChangePhoto} activeOpacity={0.9}>
                <Camera size={18} color="#fff" strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <Text style={styles.displayName} numberOfLines={1}>
              {user?.name || 'Student'}
            </Text>
            <Text style={styles.displayEmail} numberOfLines={1}>
              {user?.email || ''}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Account</Text>
            <View style={styles.infoCard}>
              <Row label="Class" value={user?.class || 'Not set'} />
              <View style={styles.hairline} />
              <Row label="Institute" value={user?.instituteName || 'Not set'} />
              <View style={styles.hairline} />
              <Row
                label="Sign-in"
                value={user?.provider === 'google' ? 'Google' : 'Email'}
              />
            </View>
          </View>

          {isAuthenticated && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Progress</Text>
              <View style={styles.infoCard}>
                {gameLoading ? (
                  <View style={styles.gameLoading}>
                    <ActivityIndicator color={colors.accent} />
                  </View>
                ) : game ? (
                  <>
                    <Row label="Level" value={String(game.level)} />
                    <View style={styles.hairline} />
                    <Row label="Total XP" value={String(game.total_xp)} />
                    <View style={styles.hairline} />
                    <Row label="XP to next level" value={String(game.xp_to_next_level)} />
                    <View style={styles.hairline} />
                    <Row
                      label="Streak"
                      value={`${game.current_streak} day(s) (best ${game.longest_streak})`}
                    />
                    {game.badges.length > 0 && (
                      <>
                        <View style={styles.hairline} />
                        <View style={styles.badgeRow}>
                          <Trophy size={16} color={colors.accent} />
                          <Text style={styles.badgeText} numberOfLines={2}>
                            {game.badges.join(' · ')}
                          </Text>
                        </View>
                      </>
                    )}
                  </>
                ) : (
                  <Text style={styles.mutedInline}>Could not load gamification. Try again later.</Text>
                )}
              </View>

              {achievements.length > 0 && (
                <View style={[styles.infoCard, { marginTop: 12 }]}>
                  <Text style={styles.lbTitle}>Badges</Text>
                  <View style={styles.badgeGrid}>
                    {achievements.map((a) => (
                      <View
                        key={a.id}
                        style={[styles.badgeTile, !a.unlocked && styles.badgeTileLocked]}
                      >
                        {a.unlocked ? (
                          <Trophy size={18} color={colors.accent} />
                        ) : (
                          <Lock size={16} color={colors.textSubtle} />
                        )}
                        <Text style={styles.badgeTileTitle} numberOfLines={2}>
                          {a.title}
                        </Text>
                        <Text style={styles.badgeTileDesc} numberOfLines={2}>
                          {a.description}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {leaderboard.length > 0 && (
                <View style={[styles.infoCard, { marginTop: 12 }]}>
                  <Text style={styles.lbTitle}>Leaderboard</Text>
                  {leaderboard.map((e) => (
                    <View key={e.user_id} style={styles.lbRow}>
                      <Text style={styles.lbRank}>#{e.rank}</Text>
                      <Text style={styles.lbName} numberOfLines={1}>
                        {e.name}
                      </Text>
                      <Text style={styles.lbXp}>{e.total_xp} XP</Text>
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[styles.infoCard, styles.perfLinkCard]}
                onPress={() => router.push('/performance' as never)}
                activeOpacity={0.85}
              >
                <View style={styles.perfLinkRow}>
                  <TrendingUp size={22} color={colors.accent} />
                  <View style={styles.perfLinkTextCol}>
                    <Text style={styles.perfLinkTitle}>Practice performance</Text>
                    <Text style={styles.perfLinkSub}>Accuracy, topics, and study trends</Text>
                  </View>
                  <ChevronRight size={20} color={colors.textSubtle} />
                </View>
              </TouchableOpacity>
            </View>
          )}

          {isAuthenticated && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>App feedback</Text>
              <Text style={styles.syncHint}>
                Tell us about bugs, ideas, or your experience — not tied to a single question.
              </Text>
              <View style={styles.infoCard}>
                <View style={styles.appFbChipRow}>
                  {APP_FB_CATS.map((c) => (
                    <TouchableOpacity
                      key={c.key}
                      onPress={() => setAppFbCategory(c.key)}
                      style={[styles.appFbChip, appFbCategory === c.key && styles.appFbChipOn]}
                    >
                      <Text
                        style={[styles.appFbChipTxt, appFbCategory === c.key && styles.appFbChipTxtOn]}
                      >
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.appFbStars}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <TouchableOpacity
                      key={n}
                      onPress={() => setAppFbStars(n)}
                      style={[styles.appFbStar, appFbStars === n && styles.appFbStarOn]}
                    >
                      <Text style={[styles.appFbStarTxt, appFbStars === n && styles.appFbStarTxtOn]}>
                        {n}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.appFbLbl}>Message (min. 8 characters)</Text>
                <TextInput
                  style={styles.appFbInput}
                  value={appFbBody}
                  onChangeText={setAppFbBody}
                  placeholder="What should we know?"
                  placeholderTextColor={colors.textSubtle}
                  multiline
                  textAlignVertical="top"
                  editable={!appFbBusy}
                />
                <TouchableOpacity
                  style={[styles.appFbSend, (appFbBusy || appFbTextLen < 8) && { opacity: 0.75 }]}
                  disabled={appFbBusy}
                  onPress={async () => {
                    const body = appFbBody.trim();
                    if (body.length < 8) {
                      Alert.alert('Message too short', 'Please enter at least 8 characters before sending.');
                      return;
                    }
                    setAppFbBusy(true);
                    try {
                      await feedbackService.submitApp({
                        body,
                        category: appFbCategory,
                        rating: appFbStars,
                      });
                      setAppFbBody('');
                      setAppFbStars(null);
                      Alert.alert('Thanks', 'Your feedback was sent to the team.');
                    } catch (e: unknown) {
                      Alert.alert('Could not send', e instanceof Error ? e.message : 'Error');
                    } finally {
                      setAppFbBusy(false);
                    }
                  }}
                >
                  {appFbBusy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.appFbSendTxt}>Send</Text>
                  )}
                </TouchableOpacity>
                {appFbTextLen < 8 && (
                  <Text style={styles.appFbHelpTxt}>Write at least 8 characters to submit feedback.</Text>
                )}
              </View>
            </View>
          )}

          {isAuthenticated && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Sync</Text>
              <Text style={styles.syncHint}>
                Pull recent questions and attempts from the server. Upload answers saved offline after a network error ({pendingCount} pending).
              </Text>
              <TouchableOpacity
                style={styles.syncBtn}
                onPress={async () => {
                  setSyncBusy(true);
                  try {
                    const res = await syncService.pull();
                    const nq = res.questions?.length ?? 0;
                    const np = res.performances?.length ?? 0;
                    Alert.alert('Pull complete', `${nq} question update(s), ${np} performance row(s).`);
                  } catch (e: unknown) {
                    Alert.alert('Pull failed', e instanceof Error ? e.message : 'Error');
                  } finally {
                    setSyncBusy(false);
                  }
                }}
                disabled={syncBusy}
                activeOpacity={0.85}
              >
                <Download size={18} color={colors.text} />
                <Text style={styles.syncBtnText}>{syncBusy ? 'Working…' : 'Pull from server'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.syncBtn, styles.syncBtnSecondary]}
                onPress={async () => {
                  setSyncBusy(true);
                  try {
                    const { accepted, total } = await syncService.flushPendingAttempts();
                    await refreshPending();
                    if (total === 0) {
                      Alert.alert('Upload', 'No offline attempts to upload.');
                    } else {
                      Alert.alert(
                        'Upload',
                        `Server accepted ${accepted} of ${total} attempt(s).`
                      );
                    }
                  } catch (e: unknown) {
                    Alert.alert('Upload failed', e instanceof Error ? e.message : 'Error');
                  } finally {
                    setSyncBusy(false);
                  }
                }}
                disabled={syncBusy}
                activeOpacity={0.85}
              >
                <Upload size={18} color={colors.text} />
                <Text style={styles.syncBtnText}>Upload offline attempts</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  scroll: { paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  screenTitle: { fontSize: 28, fontWeight: '800', color: colors.text },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  heroCard: {
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 24,
    paddingVertical: 24,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatarImg: {
    width: 104,
    height: 104,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: 'rgba(99,102,241,0.5)',
  },
  avatarPlaceholder: {
    width: 104,
    height: 104,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontSize: 40, fontWeight: '800' },
  camBtn: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  displayName: { fontSize: 20, fontWeight: '800', color: colors.text, maxWidth: '90%' },
  displayEmail: { fontSize: 14, color: colors.textMuted, marginTop: 4, maxWidth: '90%' },
  section: { paddingHorizontal: 20 },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  perfLinkCard: { marginTop: 12, paddingVertical: 14, paddingHorizontal: 16 },
  perfLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  perfLinkTextCol: { flex: 1, minWidth: 0 },
  perfLinkTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  perfLinkSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 12,
  },
  rowLabel: { color: colors.textSubtle, fontSize: 14, fontWeight: '600' },
  rowValue: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600', textAlign: 'right' },
  hairline: { height: 1, backgroundColor: colors.border, marginLeft: 16 },
  gameLoading: { paddingVertical: 24, alignItems: 'center' },
  mutedInline: { color: colors.textMuted, fontSize: 14, padding: 16 },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  badgeText: { flex: 1, color: colors.text, fontSize: 13 },
  lbTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  lbRank: { width: 36, color: colors.textSubtle, fontWeight: '700', fontSize: 14 },
  lbName: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  lbXp: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    paddingBottom: 12,
    gap: 10,
  },
  badgeTile: {
    width: '47%',
    minWidth: 140,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  badgeTileLocked: { opacity: 0.65 },
  badgeTileTitle: { fontSize: 13, fontWeight: '800', color: colors.text },
  badgeTileDesc: { fontSize: 11, color: colors.textMuted, lineHeight: 15 },
  syncHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 14,
    marginBottom: 10,
  },
  syncBtnSecondary: { backgroundColor: colors.bgElevated },
  syncBtnText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  appFbChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, paddingBottom: 4 },
  appFbChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  appFbChipOn: { borderColor: colors.accent, backgroundColor: colors.primaryMuted },
  appFbChipTxt: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  appFbChipTxtOn: { color: colors.text },
  appFbStars: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginBottom: 8 },
  appFbStar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  appFbStarOn: { borderColor: colors.accent },
  appFbStarTxt: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  appFbStarTxtOn: { color: colors.accent },
  appFbLbl: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSubtle,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  appFbInput: {
    minHeight: 100,
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.bgElevated,
  },
  appFbSend: {
    marginHorizontal: 12,
    marginBottom: 12,
    paddingVertical: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  appFbSendTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  appFbHelpTxt: {
    color: colors.textMuted,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
});
