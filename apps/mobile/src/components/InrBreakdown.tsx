import { Text, View } from 'react-native';
import { colors, font, radius, space } from '@/theme';
import type { FactorLine } from '@/types/api';

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

function Bar({ points, max, tone }: { points: number; max: number; tone: 'neg' | 'pos' }) {
  const pct = max > 0 ? Math.min(100, (points / max) * 100) : 0;
  return (
    <View style={{ height: 8, backgroundColor: colors.background, borderRadius: radius.pill, overflow: 'hidden', flex: 1 }}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: tone === 'neg' ? '#F97316' : colors.accent, borderRadius: radius.pill }} />
    </View>
  );
}

/** Factor-by-factor INR points: baseline (nutrients to limit) and capped positive points. */
export function InrBreakdown({ baseline, positive, baselinePoints, positivePoints, finalScore, capRule }: { baseline: FactorLine[]; positive: FactorLine[]; baselinePoints: number | null; positivePoints: number | null; finalScore: number | null; capRule: string | null }) {
  return (
    <View style={{ gap: space.md }}>
      <Text style={font.tiny}>BASELINE POINTS · NUTRIENTS TO LIMIT</Text>
      {baseline.map((l) => (
        <View key={l.factor} style={{ gap: 4 }} accessibilityLabel={`${l.label} ${l.value ?? 'not reported'} ${l.unit}, ${l.points} of ${l.maxPoints} baseline points`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={font.body}>{l.label}</Text>
            <Text style={[font.body, { fontWeight: '700' }]}>
              {l.value === null ? 'n/a' : `${fmt(l.value)} ${l.unit}`} · {l.points} pts
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Bar points={l.points} max={l.maxPoints} tone="neg" />
            <Text style={[font.small, { width: 44, textAlign: 'right' }]}>/ {l.maxPoints}</Text>
          </View>
        </View>
      ))}
      <Text style={[font.tiny, { marginTop: space.sm }]}>POSITIVE POINTS · SUBTRACTED</Text>
      {positive.map((p) => (
        <View key={p.factor} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
            <Text style={[font.body, { flex: 1 }]}>{p.label}</Text>
            <Text style={[font.body, { fontWeight: '700' }]}>
              {p.state === 'not_declared' ? 'not declared' : p.state === 'missing' ? 'not reported' : `${fmt(p.value!)} ${p.unit}`} · −{p.points}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Bar points={p.points} max={p.maxPoints} tone="pos" />
            <Text style={[font.small, { width: 44, textAlign: 'right' }]}>cap {p.cap}</Text>
          </View>
          {p.rawPoints !== undefined && p.rawPoints > p.points ? <Text style={font.small}>Capped from {p.rawPoints} points.</Text> : null}
        </View>
      ))}
      {finalScore !== null ? (
        <View style={{ backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: space.md, gap: 4 }}>
          <Text style={[font.body, { fontWeight: '700', color: colors.primaryDark }]}>
            Final score = {baselinePoints} − {positivePoints} = {finalScore}
          </Text>
          {capRule ? <Text style={font.small}>{capRule}</Text> : null}
          <Text style={font.small}>A lower final score means more stars.</Text>
        </View>
      ) : null}
    </View>
  );
}
