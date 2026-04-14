import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  HouseSimple,
  HeartStraight,
  Book,
  Chats,
  User,
} from 'phosphor-react-native';

const ACTIVE_COLOR = '#B83255';
const INACTIVE_COLOR = '#8C7B8C';
const ICON_SIZE = 22;

type IconName = 'home' | 'cozy' | 'library' | 'lounge' | 'profile';

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  const color = focused ? ACTIVE_COLOR : INACTIVE_COLOR;
  const weight = focused ? 'fill' : 'regular';

  const icon = {
    home:    <HouseSimple  size={ICON_SIZE} color={color} weight={weight} />,
    cozy:    <HeartStraight size={ICON_SIZE} color={color} weight={weight} />,
    library: <Book          size={ICON_SIZE} color={color} weight={weight} />,
    lounge:  <Chats         size={ICON_SIZE} color={color} weight={weight} />,
    profile: <User          size={ICON_SIZE} color={color} weight={weight} />,
  }[name];

  return (
    <View style={[styles.iconContainer, focused && styles.iconActive]}>
      {icon}
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
        tabBarStyle: [styles.tabBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 8 }],
        tabBarShowLabel: false,
        tabBarItemStyle: styles.tabBarItem,
        tabBarBackground: () => null,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarLabel: () => null,
          tabBarIcon: ({ focused }) => (
            <TabIcon name="home" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="cozy"
        options={{
          tabBarLabel: () => null,
          tabBarIcon: ({ focused }) => (
            <TabIcon name="cozy" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          tabBarLabel: () => null,
          tabBarIcon: ({ focused }) => (
            <TabIcon name="library" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="lounge"
        options={{
          tabBarLabel: () => null,
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
          tabBarLabel: () => null,
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
    backgroundColor: 'rgba(255,255,255,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  iconActive: {
    backgroundColor: '#fff',
    shadowColor: '#B83255',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 6,
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
