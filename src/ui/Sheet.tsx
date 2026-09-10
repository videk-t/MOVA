import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, radius, space } from '@/theme';
import { Text } from './Text';

export interface SheetRef {
  open: () => void;
  close: () => void;
}

export interface SheetProps {
  title?: string;
  subtitle?: string;
  /** Optional: a sheet may legitimately carry only a title. */
  children?: ReactNode;
  /** Snap points as percentages or pixel heights. */
  snapPoints?: (string | number)[];
  onClose?: () => void;
}

/**
 * Bottom sheet used for progressive disclosure — score explanations, filters,
 * trade-out links and forms. Content lives one layer down rather than on the
 * screen, so the primary view stays readable at a glance.
 *
 * The sheet is mounted only while it is open. Left mounted at `index={-1}` its
 * resting position on Android sat above the bottom edge rather than off-screen,
 * so the handle and title showed through over the page. Not rendering a closed
 * sheet removes the whole class of problem, and keeps its content off the tree
 * until someone asks for it.
 */
export const Sheet = forwardRef<SheetRef, SheetProps>(function Sheet(
  { title, subtitle, children, snapPoints, onClose },
  ref,
) {
  const sheetRef = useRef<BottomSheet>(null);
  const insets = useSafeAreaInsets();
  const points = useMemo(() => snapPoints ?? ['65%'], [snapPoints]);
  const [open, setOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    // Animate out; the unmount happens in onClose once the animation lands.
    close: () => sheetRef.current?.close(),
  }));

  const handleClose = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} pressBehavior="close" />
    ),
    [],
  );

  if (!open) return null;

  return (
    <BottomSheet
      ref={sheetRef}
      // Opens straight to its snap point, animating up from the bottom.
      index={0}
      snapPoints={points}
      // v5 defaults dynamic sizing on, which fights explicit snap points.
      enableDynamicSizing={false}
      enablePanDownToClose
      onClose={handleClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      style={styles.sheet}
    >
      <BottomSheetScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space['3xl'] }]}
        showsVerticalScrollIndicator={false}
      >
        {title ? (
          <View style={styles.header}>
            <Text variant="h2">{title}</Text>
            {subtitle ? (
              <Text variant="body" tone="secondary" style={styles.subtitle}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : null}
        {children}
      </BottomSheetScrollView>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  sheet: {
    // The sheet sits above the tab bar and its own shadow.
    zIndex: 100,
  },
  background: {
    backgroundColor: palette.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderStrong,
  },
  handle: {
    backgroundColor: palette.textTertiary,
    width: 38,
  },
  content: {
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
  },
  header: {
    marginBottom: space.xl,
  },
  subtitle: {
    marginTop: space.sm,
  },
});
