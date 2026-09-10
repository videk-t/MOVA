import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { runOnJS } from 'react-native-reanimated';
import type { Candle } from '@/core/types';
import { formatPrice } from '@/core/format';
import { palette, space } from '@/theme';
import { Text } from './Text';
import { select } from './haptics';

export interface PriceChartProps {
  candles: Candle[];
  height?: number;
  /** Shows the volume histogram beneath the price line. */
  showVolume?: boolean;
}

interface Point {
  x: number;
  y: number;
  candle: Candle;
}

const PADDING_TOP = 12;
const PADDING_BOTTOM = 8;
const VOLUME_HEIGHT_RATIO = 0.18;

/**
 * Interactive price chart.
 *
 * Touch anywhere to scrub: a crosshair follows the finger and the header shows
 * the price and time at that point, returning to the latest value on release.
 * The gesture runs on the UI thread and only crosses to JS when the highlighted
 * candle actually changes, so scrubbing stays smooth on a long series.
 */
export function PriceChart({ candles, height = 220, showVolume = true }: PriceChartProps) {
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const chartHeight = showVolume ? height * (1 - VOLUME_HEIGHT_RATIO) : height;
  const volumeHeight = height - chartHeight;

  const model = useMemo(() => {
    const clean = candles.filter((c) => Number.isFinite(c.c) && c.c > 0);
    if (clean.length < 2 || width <= 0) return null;

    const closes = clean.map((c) => c.c);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const span = max - min || Math.max(max * 0.02, Number.EPSILON);
    const usable = chartHeight - PADDING_TOP - PADDING_BOTTOM;

    const points: Point[] = clean.map((candle, i) => ({
      x: (i / (clean.length - 1)) * width,
      y: PADDING_TOP + (1 - (candle.c - min) / span) * usable,
      candle,
    }));

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
    const area = `${line} L${width.toFixed(2)},${chartHeight} L0,${chartHeight} Z`;

    const maxVolume = Math.max(...clean.map((c) => c.v), 1);
    const first = clean[0]!.c;
    const last = clean[clean.length - 1]!.c;

    return { points, line, area, min, max, maxVolume, rising: last >= first, count: clean.length };
  }, [candles, width, chartHeight]);

  const updateIndex = useCallback(
    (index: number | null) => {
      setActiveIndex((current) => {
        if (current === index) return current;
        if (index != null) select();
        return index;
      });
    },
    [],
  );

  const pan = useMemo(() => {
    const count = model?.count ?? 0;
    const chartWidth = width;

    const pick = (x: number) => {
      'worklet';
      if (count < 2 || chartWidth <= 0) return null;
      const ratio = Math.max(0, Math.min(1, x / chartWidth));
      return Math.round(ratio * (count - 1));
    };

    return Gesture.Pan()
      .minDistance(0)
      .activateAfterLongPress(0)
      .onBegin((event) => {
        'worklet';
        const index = pick(event.x);
        if (index != null) runOnJS(updateIndex)(index);
      })
      .onUpdate((event) => {
        'worklet';
        const index = pick(event.x);
        if (index != null) runOnJS(updateIndex)(index);
      })
      .onFinalize(() => {
        'worklet';
        runOnJS(updateIndex)(null);
      });
  }, [model?.count, width, updateIndex]);

  if (!model) {
    return (
      <View style={[styles.container, { height }]} onLayout={onLayout}>
        <View style={styles.emptyChart}>
          <Text variant="label" tone="tertiary">
            {candles.length === 0 ? 'No price history available' : 'Not enough price history to chart'}
          </Text>
        </View>
      </View>
    );
  }

  const active = activeIndex != null ? model.points[activeIndex] : null;
  const latest = model.points[model.points.length - 1]!;
  const shown = active ?? latest;
  const stroke = model.rising ? palette.positive : palette.negative;

  return (
    <View style={styles.wrapper}>
      <View style={styles.readout}>
        <Text variant="h2" tabular>
          {formatPrice(shown.candle.c)}
        </Text>
        <Text variant="caption" tone="tertiary" tabular>
          {active ? formatTimestamp(shown.candle.t) : 'Latest · touch and drag the chart to inspect'}
        </Text>
      </View>

      <GestureDetector gesture={pan}>
        <View style={[styles.container, { height }]} onLayout={onLayout} accessibilityLabel="Price chart">
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="priceArea" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={stroke} stopOpacity="0.24" />
                <Stop offset="1" stopColor={stroke} stopOpacity="0" />
              </LinearGradient>
            </Defs>

            {/* Horizontal guides at the extremes of the visible range. */}
            <Line x1={0} y1={PADDING_TOP} x2={width} y2={PADDING_TOP} stroke={palette.border} strokeWidth={1} />
            <Line
              x1={0}
              y1={chartHeight - PADDING_BOTTOM}
              x2={width}
              y2={chartHeight - PADDING_BOTTOM}
              stroke={palette.border}
              strokeWidth={1}
            />

            <Path d={model.area} fill="url(#priceArea)" />
            <Path
              d={model.line}
              stroke={stroke}
              strokeWidth={2}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {showVolume
              ? model.points.map((point, i) => {
                  const barHeight = Math.max(1, (point.candle.v / model.maxVolume) * (volumeHeight - 4));
                  const barWidth = Math.max(1, width / model.count - 1.5);
                  return (
                    <Rect
                      key={point.candle.t}
                      x={point.x - barWidth / 2}
                      y={height - barHeight}
                      width={barWidth}
                      height={barHeight}
                      fill={activeIndex === i ? stroke : palette.surfaceHigh}
                      opacity={activeIndex === i ? 0.9 : 0.6}
                      rx={0.5}
                    />
                  );
                })
              : null}

            {active ? (
              <>
                <Line x1={active.x} y1={0} x2={active.x} y2={height} stroke={palette.borderStrong} strokeWidth={1} />
                <Circle cx={active.x} cy={active.y} r={5} fill={stroke} stroke={palette.bg} strokeWidth={2} />
              </>
            ) : (
              <Circle cx={latest.x} cy={latest.y} r={4} fill={stroke} stroke={palette.bg} strokeWidth={2} />
            )}
          </Svg>
        </View>
      </GestureDetector>

      <View style={styles.axis}>
        <Text variant="caption" tone="tertiary" tabular>
          {formatPrice(model.min)}
        </Text>
        <Text variant="caption" tone="tertiary" tabular>
          {formatPrice(model.max)}
        </Text>
      </View>
    </View>
  );
}

function formatTimestamp(t: number): string {
  const date = new Date(t);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  wrapper: {
    gap: space.sm,
  },
  readout: {
    gap: 2,
  },
  container: {
    width: '100%',
    overflow: 'hidden',
  },
  emptyChart: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: palette.border,
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
