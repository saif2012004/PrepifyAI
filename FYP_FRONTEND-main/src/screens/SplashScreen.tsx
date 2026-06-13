import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { colors } from '../theme/colors';

const { width } = Dimensions.get('window');

export default function SplashScreen() {
  const router = useRouter();
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(24)).current;
  const glow = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.spring(slide, { toValue: 0, friction: 8, useNativeDriver: true }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 1200, useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0.4, duration: 1200, useNativeDriver: true }),
        ])
      ),
    ]).start();

    const t = setTimeout(() => router.replace('/auth/login'), 700);
    return () => clearTimeout(t);
  }, [fade, slide, glow, router]);

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientMid, colors.bg]}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.8, y: 1 }}
    >
      <Animated.View
        style={[
          styles.content,
          { opacity: fade, transform: [{ translateY: slide }] },
        ]}
      >
        <Animated.View style={[styles.iconRing, { opacity: glow }]}>
          <LinearGradient
            colors={[colors.accent, colors.primary]}
            style={styles.iconGrad}
          >
            <Sparkles color="#fff" size={40} strokeWidth={2} />
          </LinearGradient>
        </Animated.View>
        <Text style={styles.title}>PrepifyAI</Text>
        <Text style={styles.tagline}>Your AI-powered exam prep companion</Text>
        <View style={styles.dots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, { opacity: 0.4 + i * 0.2 }]} />
          ))}
        </View>
      </Animated.View>
      <View style={[styles.footer, { width }]}>
        <Text style={styles.footerText}>Smart practice · Board aligned · Pakistan curricula</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { alignItems: 'center', paddingHorizontal: 32 },
  iconRing: {
    marginBottom: 28,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
  },
  iconGrad: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 38,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  tagline: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
  },
  dots: { flexDirection: 'row', gap: 8, marginTop: 28 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  footer: { position: 'absolute', bottom: 48, alignItems: 'center' },
  footerText: { color: colors.textSubtle, fontSize: 12, textAlign: 'center' },
});
