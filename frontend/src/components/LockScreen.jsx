import { useState, useEffect } from 'react';

const API = '/api/auth';

function useTime() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function formatTime(d) {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(d) {
  return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export default function LockScreen({ onUnlock }) {
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const time = useTime();

  const handleReveal = () => {
    if (!showPassword) setShowPassword(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid password');
      if (data.ok) {
        sessionStorage.setItem('authenticated', 'true');
        onUnlock();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleReveal}
      onKeyDown={(e) => (e.key === 'Enter' ? handleReveal() : null)}
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg, #0d1117)',
        color: 'var(--text, #e6edf3)',
        cursor: showPassword ? 'default' : 'pointer',
        padding: '2rem',
      }}
    >
      {!showPassword ? (
        <>
          <div style={{ fontSize: 'clamp(4rem, 15vw, 8rem)', fontWeight: 300, letterSpacing: '-0.02em' }}>
            {formatTime(time)}
          </div>
          <div style={{ marginTop: '0.5rem', fontSize: '1.25rem', color: 'var(--muted, #8b949e)' }}>
            {formatDate(time)}
          </div>
          <div style={{ marginTop: '2rem', fontSize: '0.9rem', color: 'var(--muted, #8b949e)' }}>
            Press Enter or click to sign in
          </div>
        </>
      ) : (
        <form
          onSubmit={handleSubmit}
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            minWidth: 280,
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Admin sign in</h2>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              fontSize: '1rem',
              border: '1px solid var(--border, #30363d)',
              borderRadius: 8,
              background: 'var(--surface, #161b22)',
              color: 'var(--text)',
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              fontSize: '1rem',
              fontWeight: 600,
              border: 'none',
              borderRadius: 8,
              background: 'var(--accent, #238636)',
              color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          {error && (
            <div style={{ color: 'var(--warning, #f85149)', fontSize: '0.9rem' }}>{error}</div>
          )}
        </form>
      )}
    </div>
  );
}
