import React, { useState } from 'react';
import { Eye, EyeOff, Lock, User } from 'lucide-react';

export function LoginScreen({ onSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
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
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="brand-mark">M</span>
          <span>Moneta</span>
        </div>

        <div className="auth-tabs" role="tablist">
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

        <h1>{isRegister ? 'Buat akun barumu' : 'Selamat datang kembali'}</h1>
        <p className="login-sub">
          {isRegister
            ? 'Cukup pakai username dan password untuk mulai mencatat keuangan pribadimu.'
            : 'Masuk untuk mengakses dashboard dan laporan keuanganmu.'}
        </p>

        {error && <div className="form-error">{error}</div>}

        <label className="login-field">
          <span>Username</span>
          <div className="password-input-wrap">
            <User size={15} className="password-lead" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="cth. John Doe"
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
            <Lock size={15} className="password-lead" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan password..."
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
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
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
                Daftar sekarang
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
