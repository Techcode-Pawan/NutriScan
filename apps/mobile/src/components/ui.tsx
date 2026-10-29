import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, font, radius, space } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Screen({ children, scroll = true, padded = true, edges }: { children: ReactNode; scroll?: boolean; padded?: boolean; edges?: Array<'top' | 'bottom'> }) {
  const content = <View style={[padded && styles.padded, { gap: space.lg }]}>{children}</View>;
  return (
    <SafeAreaView style={styles.screen} edges={edges ?? ['bottom']}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, padded && styles.padded]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.85, transform: [{ scale: 0.995 }] }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const v = buttonVariants[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: Boolean(isDisabled), busy: Boolean(loading) }}
      style={({ pressed }) => [styles.button, { backgroundColor: v.bg, borderColor: v.border }, pressed && { opacity: 0.85 }, isDisabled && { opacity: 0.5 }, style]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : icon ? <Ionicons name={icon} size={18} color={v.fg} /> : null}
      <Text style={[styles.buttonText, { color: v.fg }]}>{title}</Text>
    </Pressable>
  );
}

const buttonVariants: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: '#FFFFFF', border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.primary, border: colors.primary },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  danger: { bg: colors.surface, fg: colors.danger, border: colors.danger },
};

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      style={[styles.chip, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}
    >
      {icon ? <Ionicons name={icon} size={14} color={selected ? '#fff' : colors.primary} /> : null}
      <Text style={[styles.chipText, selected && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'primary' | 'warning' | 'danger' | 'info' | 'purple' }) {
  const t = {
    neutral: [colors.background, colors.textMuted],
    primary: [colors.primarySoft, colors.primaryDark],
    warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
    info: [colors.infoSoft, colors.info],
    purple: [colors.purpleSoft, colors.purple],
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t[0] }]}>
      <Text style={[styles.badgeText, { color: t[1] }]}>{label}</Text>
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={font.h3} accessibilityRole="header">
        {title}
      </Text>
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function TextField({ label, error, hint, ...props }: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        style={[styles.input, error ? { borderColor: colors.danger } : null, props.multiline && { minHeight: 90, textAlignVertical: 'top' }]}
        {...props}
      />
      {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : hint ? <Text style={font.small}>{hint}</Text> : null}
    </View>
  );
}

export function ToggleRow({ label, description, value, onChange }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={font.body}>{label}</Text>
        {description ? <Text style={font.small}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: colors.accent, false: colors.border }}
        thumbColor={value ? colors.primary : '#f4f4f5'}
      />
    </View>
  );
}

export function Notice({ text, tone = 'info', icon }: { text: string; tone?: 'info' | 'warning' | 'danger' | 'primary'; icon?: IconName }) {
  const t = { info: [colors.infoSoft, colors.info], warning: [colors.warningSoft, colors.warning], danger: [colors.dangerSoft, colors.danger], primary: [colors.primarySoft, colors.primaryDark] }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t[0] }]} accessibilityRole="text">
      <Ionicons name={icon ?? (tone === 'info' ? 'information-circle' : tone === 'primary' ? 'checkmark-circle' : 'alert-circle')} size={18} color={t[1]} />
      <Text style={{ color: t[1], flex: 1, fontSize: 13.5, lineHeight: 19 }}>{text}</Text>
    </View>
  );
}

export function Row({ children, gap = space.sm, style, accessibilityLabel }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]} accessible={Boolean(accessibilityLabel)} accessibilityLabel={accessibilityLabel}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  padded: { paddingHorizontal: space.lg, paddingTop: space.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: space.sm,
  },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderWidth: 1.5,
  },
  buttonText: { fontSize: 15.5, fontWeight: '700' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: { color: colors.text, fontSize: 13.5, fontWeight: '600' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  badgeText: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.2 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13.5, fontWeight: '600', color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 11,
    fontSize: 15.5,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  notice: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, alignItems: 'flex-start' },
});
