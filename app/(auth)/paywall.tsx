import { useRouter } from 'expo-router';
import { useEffect } from 'react';

// Paywall requires expo-iap native module which needs a new binary build.
// Until that build is available, redirect straight to login.
export default function PaywallScreen() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/(auth)/login');
  }, []);
  return null;
}
