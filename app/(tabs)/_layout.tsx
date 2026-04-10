import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { apiGet } from '../../lib/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const [hasLiveEvent, setHasLiveEvent] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    apiGet<{ events: { status: string }[] }>('/live?status=ACTIVE')
      .then((res) => {
        setHasLiveEvent(res.events.some((e) => e.status === 'ACTIVE'));
      })
      .catch(() => {});
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, { paddingBottom: insets.bottom }],
        tabBarActiveTintColor: '#B83255',
        tabBarInactiveTintColor: '#6A5969',
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="cozy"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'heart' : 'heart-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'book' : 'book-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="lounge"
        options={{
          tabBarIcon: ({ focused }) => (
            <View>
              <TabIcon name={focused ? 'chatbubbles' : 'chatbubbles-outline'} focused={focused} />
              {hasLiveEvent && !focused && <View style={styles.dot} />}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'person' : 'person-outline'} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

function TabIcon({ name, focused }: { name: any; focused: boolean }) {
  return (
    <View style={[styles.iconContainer, focused && styles.iconActive]}>
      <Ionicons
        name={name}
        size={22}
        color={focused ? '#B83255' : '#6A5969'}
      />
    </View>
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