import { useMemo } from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { palette } from '@/theme';

export interface SparklineProps {
  /** Close prices, oldest first. */
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Fills the area under the line with a fading tint. */
  filled?: boolean;
  style?: ViewStyle;
  /** Stable id — SVG gradient ids must be unique within a document. */
  gradientId?: string;
}

/**
 * Row-level price sparkline.
 *
 * Deliberately axis-free and label-free: at this size the only readable
 * information is the shape, and anything else is noise in a list.
 */
export function Sparkline({
  values,
  width = 68,
  height = 28,
  color,
  filled = true,
  style,
  gradientId,
}: SparklineProps) {
  const paths = useMemo(() => {
    const clean = values.filter((v) => Number.isFinite(v) && v > 0);
    if (clean.length < 2) return null;

    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const span = max - min;
    const pad = 2;
    const usableHeight = height - pad * 2;

    const points = clean.map((value, i) => {
      const x = (i / (clean.length - 1)) * width;
      // A flat series has no span; centre it rather than dividing by zero.
      const t = span === 0 ? 0.5 : (value - min) / span;
      const y = pad + (1 - t) * usableHeight;
      return { x, y };
    });

    const line = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(' ');
    const area = `${line} L${width},${height} L0,${height} Z`;

    const first = clean[0]!;
    const last = clean[clean.length - 1]!;
    return { line, area, rising: last >= first };
  }, [values, width, height]);

  if (!paths) {
    // Not enough points to draw a trend. A flat placeholder line is honest;
    // an invented curve is not.
    return (
      <View style={[{ width, height, justifyContent: 'center' }, style]}>
        <View style={{ height: 1, backgroundColor: palette.border }} />
      </View>
    );
  }

  const stroke = color ?? (paths.rising ? palette.positive : palette.negative);
  const id = gradientId ?? `spark-${paths.rising ? 'up' : 'down'}`;

  return (
    <View style={style} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height}>
        {filled ? (
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={stroke} stopOpacity="0.28" />
              <Stop offset="1" stopColor={stroke} stopOpacity="0" />
            </LinearGradient>
          </Defs>
        ) : null}
        {filled ? <Path d={paths.area} fill={`url(#${id})`} /> : null}
        <Path d={paths.line} stroke={stroke} strokeWidth={1.6} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    </View>
  );
}
