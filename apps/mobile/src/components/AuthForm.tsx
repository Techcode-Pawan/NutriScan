import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { ApiError } from '@/services/api';
import { useAuth } from '@/store/auth';
import { font } from '@/theme';
import { Button, Card, Notice, Screen, TextField } from './ui';

export function validateEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : 'Enter a valid email address';
}
export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Include at least one letter and one number';
  return null;
}

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const e = { email: validateEmail(email), password: mode === 'register' ? validatePassword(password) : password ? null : 'Enter your password' };
    setErrors(e);
    setServerError(null);
    if (e.email || e.password) return;
    setBusy(true);
    try {
      if (mode === 'login') await auth.login(email.trim(), password);
      else await auth.register(email.trim(), password, name.trim());
      router.dismissAll();
      router.replace('/(tabs)');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not complete the request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        {mode === 'register' ? <TextField label="Name (optional)" value={name} onChangeText={setName} autoComplete="name" maxLength={60} /> : null}
        <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={errors.email} testID="email" />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          error={errors.password}
          hint={mode === 'register' ? 'At least 8 characters with a letter and a number.' : undefined}
          testID="password"
        />
        {serverError ? <Notice text={serverError} tone="danger" /> : null}
        <Button title={mode === 'login' ? 'Log in' : 'Create account'} onPress={submit} loading={busy} testID="submit" />
      </Card>
      <Button
        title={mode === 'login' ? 'New here? Create an account' : 'Already registered? Log in'}
        variant="ghost"
        onPress={() => router.replace(mode === 'login' ? '/auth/register' : '/auth/login')}
      />
      <Text style={[font.small, { textAlign: 'center' }]}>
        Your account stores only your email, preferences, scan history and favourites. You can delete it at any time.
      </Text>
    </Screen>
  );
}
