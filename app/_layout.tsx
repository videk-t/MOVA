import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { palette } from '@/theme';
import { useAlertEngine } from '@/data/alert-engine';

void SplashScreen.preventAutoHideAsync();

/**
 * One QueryClient for the app.
 *
 * Retries are limited and never applied to client errors: a 404 for a token
 * that does not exist will not start existing on the third attempt, and
 * retrying it just delays the error state the user needs to see.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      gcTime: 10 * 60_000,
      retry: (failureCount, error) => {
        const status = (error as { status?: number })?.status;
        if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  // A font that fails to download must not leave the user on a blank splash
  // screen forever — render with the system font instead.
  const ready = fontsLoaded || fontError != null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <AppShell />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppShell() {
  // Mounted once so alert sweeps run for the whole session, not per screen.
  useAlertEngine();
  return (
    <View style={styles.root}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="token/[address]" />
        <Stack.Screen name="compare" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="alerts/new" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="tools/risk" />
        <Stack.Screen name="tools/journal" />
        <Stack.Screen name="tools/paper" />
        <Stack.Screen name="tools/trade" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.bg,
  },
});
