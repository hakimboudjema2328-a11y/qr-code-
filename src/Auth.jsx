import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ArrowRight, LockKeyhole, Mail, X } from 'lucide-react';

const AuthContext = createContext(null);
export function AuthProvider({ config, children }) {
  const client = useMemo(() => config.supabase?.url && config.supabase?.anonKey ? createClient(config.supabase.url, config.supabase.anonKey) : null, [config.supabase?.url, config.supabase?.anonKey]);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(!!client);
  useEffect(() => {
    if (!client) { setSession(null); setLoading(false); return; }
    let alive = true; setLoading(true);
    client.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session); setLoading(false); } });
    const { data } = client.auth.onAuthStateChange((_event, next) => { if (alive) { setSession(next); setLoading(false); } });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, [client]);
  return <AuthContext.Provider value={{ client, session, loading, signOut: () => client?.auth.signOut() }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);

export function AuthForm({ onSuccess, initialMode = 'login', allowSignup = true }) {
  const { client } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault(); setError(''); setMessage('');
    if (!client) { setError('La connexion n’est pas encore configurée.'); return; }
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); return; }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error: authError } = await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/?verified=1` } });
        if (authError) throw authError;
        if (data.session) onSuccess?.();
        else setMessage('Vérifiez votre boîte e-mail et confirmez votre adresse, puis connectez-vous.');
      } else {
        const { error: authError } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        onSuccess?.();
      }
    } catch (err) {
      const translated = /invalid login|invalid credentials/i.test(err.message) ? 'E-mail ou mot de passe incorrect.' : /email not confirmed/i.test(err.message) ? 'Confirmez d’abord votre adresse e-mail.' : 'Connexion impossible. Vérifiez vos informations ou réessayez plus tard.';
      setError(translated);
    } finally { setBusy(false); }
  }
  if (!client) return <div className="setup-note"><LockKeyhole size={20}/><div><strong>Connexion en préparation</strong><p>Le propriétaire doit d’abord configurer Supabase pour activer les comptes.</p></div></div>;
  return <form onSubmit={submit} className="auth-form">
    <label className="form-label">Adresse e-mail<div className="icon-input"><Mail size={17}/><input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com" autoComplete="email"/></div></label>
    <label className="form-label">Mot de passe<div className="icon-input"><LockKeyhole size={17}/><input required minLength={8} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="8 caractères minimum" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}/></div></label>
    {error && <div role="alert" className="form-alert error">{error}</div>}{message && <div role="status" className="form-alert success">{message}</div>}
    <button disabled={busy} className="button button-primary full" type="submit">{busy ? 'Un instant…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'} <ArrowRight size={17}/></button>
    {allowSignup && <p className="auth-switch">{mode === 'login' ? 'Pas encore de compte ?' : 'Vous avez déjà un compte ?'} <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setMessage(''); }}>{mode === 'login' ? 'Créer un compte' : 'Se connecter'}</button></p>}
  </form>;
}
export function AuthModal({ onClose, initialMode }) {
  useEffect(() => { const onKey = e => e.key === 'Escape' && onClose(); window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="icon-button modal-close" aria-label="Fermer" onClick={onClose}><X size={19}/></button>
      <div className="modal-icon"><LockKeyhole size={22}/></div><div className="eyebrow">VOTRE ESPACE PERSONNEL</div>
      <h2 id="auth-title">On se retrouve ici.</h2><p>Connectez-vous pour retrouver vos créations et suivre vos commandes.</p>
      <AuthForm initialMode={initialMode} onSuccess={onClose}/>
    </section>
  </div>;
}
