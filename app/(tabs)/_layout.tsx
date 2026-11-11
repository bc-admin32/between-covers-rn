import { Tabs } from 'expo-router';
import { View, StyleSheet, AppState } from 'react-native';
import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';
import { registerForPushNotifications } from '../../lib/pushNotifications';
import { useGuest } from '../../lib/useGuest';
import { loadSavedCozyLayout, refreshActiveCozyLayout, useActiveCozyLayout } from '../../lib/cozyLayout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  HouseSimple,
  HeartStraight,
  Keyhole,
  Book,
  Chats,
  User,
} from '../../components/icons';

const ACTIVE_COLOR = '#B83255';
const INACTIVE_COLOR = '#6A5550';
const PILL_COLOR = '#EBC2CD';
// One solid bar on every screen; inactive icons are 6.7:1 on it.
const BAR_COLOR = '#FDFAF6';
const BAR_BORDER = '#E0D8CC';
const ICON_SIZE = 22;
// Room for the icon row above the bottom safe area.
const BAR_CONTENT_HEIGHT = 56;

type IconName = 'home' | 'cozy' | 'library' | 'lounge' | 'profile';

function TabIcon({ name, focused, playroom = false }: { name: IconName; focused: boolean; playroom?: boolean }) {
  const color = focused ? ACTIVE_COLOR : INACTIVE_COLOR;
  const weight = focused ? 'fill' : 'regular';

  const icon = {
    home:    <HouseSimple  size={ICON_SIZE} color={color} weight={weight} />,
    // The PlayRoom months get a keyhole.
    cozy:    playroom
      ? <Keyhole       size={ICON_SIZE} color={color} weight={weight} />
      : <HeartStraight size={ICON_SIZE} color={color} weight={weight} />,
    library: <Book          size={ICON_SIZE} color={color} weight={weight} />,
    lounge:  <Chats         size={ICON_SIZE} color={color} weight={weight} />,
    profile: <User          size={ICON_SIZE} color={color} weight={weight} />,
  }[name];

  // Every icon sits in the same pill-sized box, so they line up; only the
  // active one fills it.
  return (
    <View style={[styles.iconPill, focused && styles.iconPillActive]}>
      {icon}
    </View>
  );
}

export default function TabLayout() {
  const [hasLiveEvent, setHasLiveEvent] = useState(false);
  const insets = useSafeAreaInsets();
  const { isGuest, requireAccount } = useGuest();
  const cozyLayout = useActiveCozyLayout();

  // The live month's layout (lib/cozyLayout.ts), for every screen: the saved
  // value right away, then /cozy/home at launch and each time the app comes
  // back (so everything flips on the 1st even if Cozy isn't opened).
  useEffect(() => {
    loadSavedCozyLayout();
    refreshActiveCozyLayout();
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') refreshActiveCozyLayout(); });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    apiGet<{ events: { status: string }[] }>('/live?status=ACTIVE')
      .then((res) => setHasLiveEvent(res.events.some((e) => e.status === 'ACTIVE')))
      .catch(() => {});
  }, []);

  // Push registration needs an account (and guests shouldn't get the
  // permission prompt), so wait until we know this is a signed-in user.
  useEffect(() => {
    if (isGuest === false) registerForPushNotifications();
  }, [isGuest]);

  const bottomPad = insets.bottom > 0 ? insets.bottom : 8;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, { height: BAR_CONTENT_HEIGHT + bottomPad, paddingBottom: bottomPad }],
        tabBarShowLabel: false,
        tabBarItemStyle: styles.tabBarItem,
        tabBarHideOnKeyboard: true,
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
            <TabIcon name="cozy" focused={focused} playroom={cozyLayout === 'playroom'} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('library', { screen: 'index' });
          },
        })}
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
        listeners={{
          tabPress: (e) => {
            if (requireAccount('profile', { returnTo: '/profile' })) e.preventDefault();
          },
        }}
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
    // Part of the layout, not floating: screens end at its top edge, so
    // nothing scrolls underneath it.
    backgroundColor: BAR_COLOR,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BAR_BORDER,
    elevation: 0,
  },
  tabBarItem: {
    overflow: 'visible',
  },
  iconPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: {
    backgroundColor: PILL_COLOR,
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
