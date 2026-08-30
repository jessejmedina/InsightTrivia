import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuthStore } from '../../store/authStore';

export default function AuthLayout() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (session) {
      router.replace('/(tabs)/home');
    }
  }, [session]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
