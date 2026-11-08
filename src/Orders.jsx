import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock3, Download, FileCode2, FolderOpen, LockKeyhole, RefreshCw } from 'lucide-react';
import { api, downloadQr, formatDate, money, validCheckoutUrl } from './api.js';
import { useAuth } from './Auth.jsx';

const labels = { creating: 'En préparation', pending: 'En attente', paid: 'Payé', failed: 'Échoué', canceled: 'Annulé', error: 'Non finalisé' };
const typeLabels = { url: 'Lien web', text: 'Texte', whatsapp: 'WhatsApp', wifi: 'Wi-Fi', email: 'E-mail', phone: 'Téléphone', sms: 'SMS', contact: 'Contact' };
export function Status({ status }) { return <span className={`status status-${status}`}>{labels[status] || status}</span>; }
export default function Orders({ openAuth, navigate }) {
  const { session, loading } = useAuth(); const [orders, setOrders] = useState([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [downloading, setDownloading] = useState('');
  async function load(reconcile = false) {
    if (!session) return; setBusy(true); setError('');
    try {
      let data = await api('/api/orders', { token: session.access_token });
      if (reconcile) {
        const pending = data.orders.filter(o => o.status === 'pending').slice(0, 10);
        await Promise.all(pending.map(o => api(`/api/orders/${o.id}`, { token: session.access_token }).catch(() => null)));
        if (pending.length) data = await api('/api/orders', { token: session.access_token });
      }
      setOrders(data.orders);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  useEffect(() => { if (session) load(); else setOrders([]); }, [session?.access_token]);
  async function getFile(order, format) { setDownloading(`${order.id}-${format}`); setError(''); try { await downloadQr(session.access_token, order.id, format); } catch (err) { setError(err.message); } finally { setDownloading(''); } }
  return <section className="secondary-page">
    <div className="eyebrow"><span className="eyebrow-dot"/> VOTRE BIBLIOTHÈQUE</div><div className="page-title-row"><div><h1>Mes créations<span>.</span></h1><p>Retrouvez ici vos commandes et vos QR codes achetés.</p></div>{session && <button className="button button-outline" disabled={busy} onClick={() => load(true)}><RefreshCw size={16}/> Actualiser</button>}</div>
    {!session && !loading ? <div className="empty-state surface"><div className="empty-icon"><LockKeyhole size={26}/></div><h2>Vos créations vous attendent.</h2><p>Connectez-vous pour suivre vos commandes et télécharger vos QR codes.</p><button className="button button-primary" onClick={openAuth}>Me connecter <ArrowRight size={16}/></button></div> : null}
    {session && <><div className="library-note"><CheckCircle2 size={17}/> Chaque commande correspond à une création figée, téléchargeable à nouveau depuis votre compte.</div>{error && <div className="form-alert error" role="alert">{error}</div>}
      {busy && !orders.length ? <div className="empty-state surface">Chargement de vos créations…</div> : !orders.length ? <div className="empty-state surface"><div className="empty-icon"><FolderOpen size={26}/></div><h2>Une page encore blanche.</h2><p>Votre première création n’attend que vous.</p><button className="button button-primary" onClick={() => navigate('/')}>Créer un QR code <ArrowRight size={16}/></button></div> : <div className="order-list">{orders.map(order => <article className="order-card surface" key={order.id}><div className="order-mark"><QrMini/></div><div className="order-detail"><div className="order-name"><h3>{typeLabels[order.qr_type] || 'QR personnalisé'}</h3><Status status={order.status}/></div><p>Commande #{order.id.slice(0, 8).toUpperCase()} · {formatDate(order.created_at)} · {money(order.amount_dzd)}</p></div><div className="order-actions">{order.status === 'paid' ? <><button className="button button-primary small" disabled={!!downloading} onClick={() => getFile(order, 'png')}><Download size={15}/> {downloading === `${order.id}-png` ? 'Création…' : 'PNG'}</button><button className="button button-outline small" disabled={!!downloading} onClick={() => getFile(order, 'svg')}><FileCode2 size={15}/> SVG</button></> : order.status === 'pending' && validCheckoutUrl(order.provider_checkout_url) ? <a href={order.provider_checkout_url} className="button button-outline small">Reprendre le paiement <ArrowRight size={14}/></a> : <span className="small-muted">Aucun fichier disponible</span>}</div></article>)}</div>}
    </>}
  </section>;
}
function QrMini() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v3M14 20h3M20 20h1"/></svg>; }

export function PaymentReturn({ orderId, canceled, openAuth, navigate }) {
  const { session, loading } = useAuth(); const [order, setOrder] = useState(null); const [error, setError] = useState(''); const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!session || !orderId) return;
    let active = true; let timeout;
    async function check(count) {
      if (!active) return; setChecking(true);
      try {
        const data = await api(`/api/orders/${encodeURIComponent(orderId)}`, { token: session.access_token });
        if (!active) return; setOrder(data.order); setError('');
        if (data.order.status === 'pending' && count < 5) timeout = setTimeout(() => check(count + 1), 3000);
      } catch (err) { if (active) setError(err.message); } finally { if (active) setChecking(false); }
    }
    check(0); return () => { active = false; clearTimeout(timeout); };
  }, [session?.access_token, orderId]);
  const paid = order?.status === 'paid';
  return <section className="secondary-page"><div className="return-card surface"><div className={`return-icon ${paid ? 'paid' : ''}`}>{paid ? <CheckCircle2 size={30}/> : <Clock3 size={30}/>}</div><div className="eyebrow">SUIVI DE COMMANDE</div><h1>{paid ? 'Paiement confirmé !' : canceled ? 'Paiement non confirmé' : 'Nous vérifions votre paiement.'}</h1>
    <p>{paid ? 'Votre création est prête. Retrouvez vos fichiers dans votre bibliothèque.' : 'Seule la confirmation de Chargily débloque le téléchargement. La vérification peut prendre quelques instants.'}</p>
    {!session && !loading && <button className="button button-primary" onClick={openAuth}>Me connecter <ArrowRight size={16}/></button>}
    {order && <div className="return-status">Statut de la commande <Status status={order.status}/></div>}{error && <div className="form-alert error">{error}</div>}
    {session && <button className="button button-primary" onClick={() => navigate('/mes-qr')}>Voir mes créations <ArrowRight size={16}/></button>}{checking && <small className="small-muted">Vérification en cours…</small>}
  </div></section>;
}
