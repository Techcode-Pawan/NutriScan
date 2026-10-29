import { Redirect } from 'expo-router';
import { LoadingState } from '@/components/States';
import { useAuth } from '@/store/auth';

export default function Index() {
  const { ready, onboarded } = useAuth();
  if (!ready) return <LoadingState label="Starting NutriScan..." />;
  return <Redirect href={onboarded ? '/(tabs)' : '/welcome'} />;
}
