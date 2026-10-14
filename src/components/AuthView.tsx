import { useState } from 'react';
import { KeyRound, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ThemeToggle } from './ThemeProvider';

type Mode = 'login' | 'signup' | 'forgot';

export default function AuthView() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: 'dailycheck://auth/callback'
          }
        });
        if (error) throw error;
        setMessage('Check your inbox to verify your email address.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: 'dailycheck://auth/reset-password'
        });
        if (error) throw error;
        setMessage('Password reset instructions were sent if this account exists.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-screen">
      <ThemeToggle floating />
      <section className="auth-panel">
        <div className="brand-lockup">
          <span className="brand-mark">
            <KeyRound className="h-6 w-6" />
          </span>
          <div>
            <p className="eyebrow">DailyCheck</p>
            <h1>Your month, one day at a time.</h1>
          </div>
        </div>
        <form onSubmit={submit} className="form-stack">
          <label>
            Email
            <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          {mode !== 'forgot' && (
            <label>
              Password
              <input
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>
          )}
          <button className="primary-button" type="submit" disabled={loading}>
            <Mail className="h-4 w-4" />
            {loading ? 'Working...' : mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </button>
        </form>
        {message && <p className="notice">{message}</p>}
        <div className="segmented">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Login
          </button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
            Sign up
          </button>
          <button type="button" className={mode === 'forgot' ? 'active' : ''} onClick={() => setMode('forgot')}>
            Reset
          </button>
        </div>
      </section>
    </main>
  );
}
