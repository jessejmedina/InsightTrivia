import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { Colors } from '../../constants/colors';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Play', tabBarIcon: ({ color }) => <TabIcon emoji="🎮" color={color} /> }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{ title: 'Rankings', tabBarIcon: ({ color }) => <TabIcon emoji="🏆" color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <TabIcon emoji="👤" color={color} /> }}
      />
      <Tabs.Screen
        name="admin"
        options={{ title: 'Questions', tabBarIcon: ({ color }) => <TabIcon emoji="📝" color={color} /> }}
      />
    </Tabs>
  );
}

function TabIcon({ emoji, color }: { emoji: string; color: ColorValue }) {
  const { Text } = require('react-native');
  return <Text style={{ fontSize: 20, opacity: color === Colors.accent ? 1 : 0.5 }}>{emoji}</Text>;
}
