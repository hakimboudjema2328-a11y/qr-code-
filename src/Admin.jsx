import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, BarChart3, CircleDollarSign, ClipboardList, CreditCard, LockKeyhole, RefreshCw, Save, Settings2, ShieldCheck, ShoppingBag } from 'lucide-react';
import { api, formatDate, money } from './api.js';
import { AuthForm, useAuth } from './Auth.jsx';
import { Status } from './Orders.jsx';

const empty = { price_dzd: '', checkout_enabled: false, announcement: '', support_email: '' };
export default function Admin() {
  const { session, loading, signOut } = useAuth(); const [data, setData] = useState(null); const [form, setForm] = useState(empty); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function load() {
    if (!session) return; setBusy(true); setError('');
    try { const result = await api('/api/admin', { token: session.access_token }); setData(result); setForm({ ...empty, ...result.settings, price_dzd: result.settings.price_dzd ?? '' }); }
    catch (err) { setError(err.message); setData(null); } finally { setBusy(false); }
  }
  useEffect(() => { if (session) load(); else { setData(null); setError(''); } }, [session?.access_token]);
  const paid = useMemo(() => data?.orders.filter(o => o.status === 'paid') || [], [data]);
  async function save(e) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { const result = await api('/api/admin/settings', { token: session.access_token, method: 'PATCH', body: { price_dzd: form.price_dzd === '' ? null : Number(form.price_dzd), checkout_enabled: form.checkout_enabled, announcement: form.announcement, support_email: form.support_email } }); setForm(f => ({ ...f, ...result.settings, price_dzd: result.settings.price_dzd ?? '' })); setData(d => ({ ...d, settings: result.settings })); setMessage('Paramètres enregistrés.'); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  if (!session && !loading) return <section className="admin-login"><div className="admin-login-card surface"><div className="modal-icon"><ShieldCheck size={23}/></div><div className="eyebrow">ESPACE SÉCURISÉ</div><h1>Bonjour, admin<span>.</span></h1><p>Connectez-vous avec votre compte administrateur pour gérer QR Studio.</p><AuthForm allowSignup={false}/><div className="admin-login-foot"><LockKeyhole size={14}/> L’accès est vérifié côté serveur.</div></div></section>;
  return <section className="secondary-page admin-page"><div className="eyebrow"><span className="eyebrow-dot"/> VOTRE ESPACE DE GESTION</div><div className="page-title-row"><div><h1>Tableau de bord<span>.</span></h1><p>Les informations essentielles de votre activité, au même endroit.</p></div><div className="title-actions"><button className="button button-outline" onClick={load} disabled={busy}><RefreshCw size={16}/> Actualiser</button><button className="text-button" onClick={signOut}>Déconnexion</button></div></div>
    {error && <div role="alert" className="form-alert error">{error}</div>}{loading || (busy && !data) ? <div className="empty-state surface">Chargement de l’espace administrateur…</div> : null}
    {session && !data && !busy && error && <div className="empty-state surface"><LockKeyhole size={27}/><h2>Accès indisponible</h2><p>Vérifiez la configuration et les droits de ce compte. Les données de gestion ne sont jamais affichées sans autorisation.</p><button className="button button-outline" onClick={signOut}>Changer de compte</button></div>}
    {data && <><div className="admin-badge"><ShieldCheck size={15}/> Connecté en tant que {data.user.email} <span>·</span> {data.mode === 'test' ? 'Mode de paiement test' : data.mode === 'live' ? 'Mode de paiement réel' : 'Paiement non configuré'}</div>
      <div className="stats-grid"><Stat icon={ShoppingBag} label="Commandes" value={data.orders.length} detail="Sur les 200 dernières" color="violet"/><Stat icon={CircleDollarSign} label="Montant payé" value={money(paid.reduce((a, o) => a + o.amount_dzd, 0))} detail="Sur les 200 dernières" color="green"/><Stat icon={CreditCard} label="Paiements confirmés" value={paid.length} detail="Sur les 200 dernières" color="orange"/></div>
      <div className="admin-grid"><section className="surface admin-panel"><div className="admin-panel-heading"><div className="heading-icon"><Settings2 size={19}/></div><div><h2>Paramètres du site</h2><p>Tarif, disponibilité et informations publiques.</p></div></div>
        {!data.ready && <div className="setup-warning"><strong>Configuration incomplète.</strong> Ajoutez les variables Cloudflare, la clé de chiffrement et les accès Supabase / Chargily avant d’activer les paiements.</div>}
        <form onSubmit={save} className="settings-form"><label className="form-label">Prix par création <span>en dinars algériens</span><div className="price-input"><input className="text-input" type="number" min="1" max="10000000" step="1" value={form.price_dzd} onChange={e => setForm(f => ({ ...f, price_dzd: e.target.value }))} placeholder="À définir"/><span>DA</span></div></label>
          <label className="form-label">Message d’annonce <span>facultatif</span><input className="text-input" value={form.announcement} onChange={e => setForm(f => ({ ...f, announcement: e.target.value }))} maxLength={180} placeholder="Une information à afficher sur le site"/></label>
          <label className="form-label">E-mail de contact <span>facultatif</span><input className="text-input" type="email" value={form.support_email} onChange={e => setForm(f => ({ ...f, support_email: e.target.value }))} placeholder="contact@exemple.com"/></label>
          <div className="settings-toggle-row"><div><strong>Accepter les commandes</strong><p>{form.checkout_enabled ? 'Les clients peuvent commander.' : 'Les ventes sont désactivées.'}</p></div><button type="button" className={`toggle ${form.checkout_enabled ? 'on' : ''}`} role="switch" aria-checked={form.checkout_enabled} aria-label="Accepter les commandes" onClick={() => setForm(f => ({ ...f, checkout_enabled: !f.checkout_enabled }))}><span/></button></div>
          {message && <div className="form-alert success" role="status">{message}</div>}<button className="button button-primary" disabled={busy} type="submit"><Save size={16}/> {busy ? 'Enregistrement…' : 'Enregistrer'}</button></form>
      </section><section className="surface admin-panel admin-orders"><div className="admin-panel-heading"><div className="heading-icon orange"><ClipboardList size={19}/></div><div><h2>Dernières commandes</h2><p>Jusqu’aux 200 commandes les plus récentes.</p></div></div>
        {!data.orders.length ? <div className="admin-empty"><BarChart3 size={25}/><strong>Tout commence ici.</strong><span>Les commandes apparaîtront dans cet espace.</span></div> : <div className="table-wrap"><table><thead><tr><th>CLIENT / DATE</th><th>STATUT</th><th>MONTANT</th></tr></thead><tbody>{data.orders.map(order => <tr key={order.id}><td><strong>{order.customer_email}</strong><small>{formatDate(order.created_at)} · #{order.id.slice(0, 8)}</small></td><td><Status status={order.status}/></td><td><strong>{money(order.amount_dzd)}</strong></td></tr>)}</tbody></table></div>}
      </section></div><p className="admin-disclaimer">Les métriques portent sur les 200 commandes les plus récentes, pas sur l’historique complet. Les données des QR sont chiffrées ; leur contenu n’apparaît pas ici.</p>
    </>}
  </section>;
}
function Stat({ icon: Icon, label, value, detail, color }) { return <div className="stat-card surface"><div className={`stat-icon ${color}`}><Icon size={20}/></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
