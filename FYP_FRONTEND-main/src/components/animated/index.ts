/**
 * Reusable cross-platform animation primitives for PrepifyAI.
 *
 * - `FadeIn` — fade/slide-in reveal (Moti on native, Framer Motion on web).
 * - `PressableScale` — press scale micro-interaction.
 * - `AnimatedCounter` — count-up numbers.
 * - `AnimatedProgressBar` — animated fill bar.
 */
export { FadeIn, type FadeInProps, type FadeDirection } from './FadeIn';
export { PressableScale, type PressableScaleProps } from './PressableScale';
export { AnimatedCounter, type AnimatedCounterProps } from './AnimatedCounter';
export { AnimatedProgressBar, type AnimatedProgressBarProps } from './AnimatedProgressBar';
