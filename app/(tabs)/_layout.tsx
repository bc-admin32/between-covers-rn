import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
const ACTIVE_COLOR = '#B83255';
const INACTIVE_COLOR = '#6A5969';

const ICONS: Record<string, { active: string; inactive: string }> = {
  home:    { active: '⌂',  inactive: '⌂'  },
  cozy:    { active: '♥',  inactive: '♡'  },
  library: { active: '☰',  inactive: '☰'  },
  lounge:  { active: '◉',  inactive: '○'  },
  profile: { active: '◈',  inactive: '◇'  },
};

function TabIcon({ name, focused }: { name: keyof typeof ICONS; focused: boolean }) {
  const icon = ICONS[name];
  return (
    <View style={[styles.iconContainer, focused && styles.iconActive]}>
      <Text style={[styles.iconText, { color: focused ? ACTIVE_COLOR : INACTIVE_COLOR }]}>
        {focused ? icon.active : icon.inactive}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const [hasLiveEvent, setHasLiveEvent] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    apiGet<{ events: { status: string }[] }>('/live?status=ACTIVE')
      .then((res) => setHasLiveEvent(res.events.some((e) => e.status === 'ACTIVE')))
      .catch(() => {});
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, { paddingBottom: insets.bottom }],
        tabBarShowLabel: false,
        tabBarItemStyle: styles.tabBarItem,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="home" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="cozy"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="cozy" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="library" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="lounge"
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={styles.loungeWrapper}>
              <TabIcon name="lounge" focused={focused} />
              {hasLiveEvent && !focused && <View style={styles.dot} />}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="profile" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    elevation: 0,
    height: 88,
  },
  tabBarItem: {
    overflow: 'visible',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  iconActive: {
    backgroundColor: '#fff',
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  iconText: {
    fontSize: 20,
    lineHeight: 22,
  },
  loungeWrapper: {
    position: 'relative',
  },
  dot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#B83255',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
});
