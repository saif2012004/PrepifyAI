import { Tabs } from 'expo-router';
import { Home, User } from 'lucide-react-native';
import { colors } from '../../src/theme/colors';

/** Larger than default tab icon size so taps are easier and less likely to miss-hit. */
const TAB_ICON_SIZE = 32;

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: 80,
          paddingBottom: 14,
          paddingTop: 10,
        },
        tabBarItemStyle: {
          paddingVertical: 6,
          paddingHorizontal: 12,
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
        tabBarLabelStyle: {
          fontSize: 13,
          fontWeight: '600',
          marginBottom: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <Home size={TAB_ICON_SIZE} color={color} strokeWidth={2.25} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <User size={TAB_ICON_SIZE} color={color} strokeWidth={2.25} />
          ),
        }}
      />
    </Tabs>
  );
}
