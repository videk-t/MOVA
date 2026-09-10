import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { formatUsd } from '@/core/format';
import { palette, radius, space } from '@/theme';
import { Text } from '@/ui/Text';

export interface EquityCurveProps {
  /** Cumulative P/L after each closed trade, oldest first. */
  values: number[];
  height?: number;
}

/**
 * The running result of a set of closed trades.
 *
 * Unlike a price sparkline this has to handle negative values, so it is drawn
 * against an explicit zero baseline rather than auto-scaled to its own range —
 * a curve that never says where break-even sits can make a losing record look
 * like a rising one.
 */
export function EquityCurve({ values, height = 96 }: EquityCurveProps) {
  // The chart fills its parent, whose width is only known after layout.
  const [width, setWidth] = useState(0);
  const measure = useCallback((next: number) => {
    setWidth((current) => (Math.abs(current - next) < 1 ? current : next));
  }, []);

  const geometry = useMemo(() => {
    const clean = values.filter((v) => Number.isFinite(v));
    // Every curve starts at zero — the account before the first trade closed.
    const series = [0, ...clean];
    if (series.length < 2 || width <= 0) return null;

    const min = Math.min(...series);
    const max = Math.max(...series);
    // Always keep zero inside the drawn range, and never divide by a zero span.
    const lo = Math.min(min, 0);
    const hi = Math.max(max, 0);
    const span = hi - lo || 1;

    const pad = 6;
    const usable = height - pad * 2;
    const y = (value: number) => pad + (1 - (value - lo) / span) * usable;
    const x = (i: number) => (i / (series.length - 1)) * width;

    const line = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
    const zeroY = y(0);
    const last = series[series.length - 1] ?? 0;
    const area = `${line} L${width.toFixed(2)},${zeroY.toFixed(2)} L0,${zeroY.toFixed(2)} Z`;

    return { line, area, zeroY, rising: last >= 0, last };
  }, [height, values, width]);

  const color = geometry?.rising ? palette.positive : palette.negative;

  return (
    <View style={styles.container} onLayout={(e) => measure(e.nativeEvent.layout.width)}>
      <View
        style={[styles.chart, { height }]}
        accessibilityRole="image"
        accessibilityLabel={
          geometry == null
            ? 'Equity curve: not enough closed trades to plot'
            : `Equity curve, currently ${formatUsd(geometry.last)}`
        }
      >
        {geometry ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity="0.24" />
                <Stop offset="1" stopColor={color} stopOpacity="0.02" />
              </LinearGradient>
            </Defs>
            <Path d={geometry.area} fill="url(#equityFill)" />
            <Line
              x1="0"
              y1={geometry.zeroY}
              x2={width}
              y2={geometry.zeroY}
              stroke={palette.borderStrong}
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            <Path
              d={geometry.line}
              stroke={color}
              strokeWidth={2}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </Svg>
        ) : (
          <View style={styles.placeholder}>
            <Text variant="caption" tone="tertiary">
              Close a trade to start the curve
            </Text>
          </View>
        )}
      </View>

      {geometry ? (
        <View style={styles.legend}>
          <Text variant="caption" tone="tertiary">
            Break-even
          </Text>
          <Text variant="caption" tabular color={color}>
            {formatUsd(geometry.last)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.sm,
  },
  chart: {
    width: '100%',
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
