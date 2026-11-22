import React, { useState } from 'react';
import { Eye, EyeOff, Lock, User } from 'lucide-react';

export function LoginScreen({ onSuccess, notice = '' }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isRegister = mode === 'register';

  function switchMode(next) {
    setMode(next);
    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || (isRegister ? 'Gagal mendaftar.' : 'Username atau password salah.'));
      }
      onSuccess(result.user);
    } catch (err) {
      setError(err.message || 'Gagal terhubung ke server.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>Moneta</span>
        </div>

        <div className="segmented-control" role="tablist" aria-label="Pilih mode autentikasi">
          <button
            type="button"
            role="tab"
            aria-selected={!isRegister}
            className={!isRegister ? 'active' : ''}
            onClick={() => switchMode('login')}
          >
            Masuk
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isRegister}
            className={isRegister ? 'active' : ''}
            onClick={() => switchMode('register')}
          >
            Daftar Akun
          </button>
        </div>

        <h1>{isRegister ? 'Buat akun Moneta' : 'Selamat datang kembali'}</h1>
        <p className="login-sub">
          {isRegister
            ? 'Gunakan username dan password untuk memulai ruang keuangan pribadimu.'
            : 'Masuk untuk memantau saldo, transaksi, dan anggaranmu.'}
        </p>

        {notice && !error && <div className="form-notice" role="status">{notice}</div>}
        {error && <div className="form-error" role="alert">{error}</div>}

        <label className="login-field">
          <span>Username</span>
          <div className="password-input-wrap">
            <User size={16} className="password-lead" aria-hidden="true" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              autoComplete="username"
              minLength={isRegister ? 3 : 1}
              required
              autoFocus
            />
          </div>
        </label>

        <label className="login-field">
          <span>Password {isRegister && <em className="optional">(min. 6 karakter)</em>}</span>
          <div className="password-input-wrap">
            <Lock size={16} className="password-lead" aria-hidden="true" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              minLength={isRegister ? 6 : 1}
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
            >
              {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </div>
        </label>

        <button type="submit" className="primary-button login-submit" disabled={submitting}>
          {submitting
            ? (isRegister ? 'Membuat akun...' : 'Memeriksa...')
            : (isRegister ? 'Daftar & Masuk' : 'Masuk ke Dashboard')}
        </button>

        <div className="login-foot">
          {isRegister ? (
            <>
              Sudah punya akun?{' '}
              <button type="button" className="inline-switch" onClick={() => switchMode('login')}>
                Masuk di sini
              </button>
            </>
          ) : (
            <>
              Belum punya akun?{' '}
              <button type="button" className="inline-switch" onClick={() => switchMode('register')}>
                Daftar akun baru
              </button>
            </>
          )}
        </div>
      </form>
    </main>
  );
}
