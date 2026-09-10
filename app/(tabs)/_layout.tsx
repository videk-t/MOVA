import { Tabs } from 'expo-router';
import { palette } from '@/theme';
import { TabBar, type TabBarProps } from '@/features/navigation/TabBar';

export default function TabsLayout() {
  return (
    <Tabs
      // The tab bar floats over the content, so the navigator's own bar is
      // replaced entirely rather than restyled.
      tabBar={(props: TabBarProps) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: palette.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
      <Tabs.Screen name="watchlist" options={{ title: 'Watchlist' }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
