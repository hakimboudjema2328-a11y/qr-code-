import { useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, CheckCircle2, CircleHelp, CreditCard, Download, FileImage, Globe2, ImagePlus, Link2, LockKeyhole, Mail, MessageCircle, MessageSquare, Palette, Phone, QrCode, RotateCcw, ScanLine, ShieldCheck, Sparkles, Type, UserRound, Wifi, X } from 'lucide-react';
import { DEFAULT_DRAFT, exampleSnapshot, hasGoodContrast, normalizeSnapshot, renderSvg } from '../shared/qr.js';
import { api, money, validCheckoutUrl } from './api.js';
import { useAuth } from './Auth.jsx';

const types = [
  { id: 'url', label: 'Lien web', icon: Link2, bg: 'violet' }, { id: 'text', label: 'Texte', icon: Type, bg: 'blue' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, bg: 'green' }, { id: 'wifi', label: 'Wi-Fi', icon: Wifi, bg: 'orange' },
  { id: 'email', label: 'E-mail', icon: Mail, bg: 'rose' }, { id: 'phone', label: 'Téléphone', icon: Phone, bg: 'cyan' },
  { id: 'sms', label: 'SMS', icon: MessageSquare, bg: 'yellow' }, { id: 'contact', label: 'Contact', icon: UserRound, bg: 'lilac' }
];
const palette = ['#24203f', '#654fe5', '#137b70', '#2463aa', '#cf5b4c', '#bd4887'];
function Field({ label, value, onChange, placeholder, type = 'text', help, maxLength, disabled = false }) {
  return <label className="form-label">{label}<input className="text-input" type={type} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} disabled={disabled}/>{help && <span className="field-help">{help}</span>}</label>;
}
function Area({ label, value, onChange, placeholder, help }) {
  return <label className="form-label">{label}<textarea className="text-input textarea" rows={3} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={700}/>{help && <span className="field-help">{help}</span>}</label>;
}
function ContentFields({ draft, update }) {
  const c = draft.content; const set = key => value => update(key, value);
  const phone = <Field label="Numéro de téléphone" value={c.phone} onChange={set('phone')} placeholder="+213 555 12 34 56" type="tel" help="Avec l’indicatif international, par exemple +213."/>;
  if (draft.type === 'url') return <Field label="Lien de destination" value={c.url} onChange={set('url')} placeholder="https://votre-site.com" help="C’est l’adresse que vos visiteurs ouvriront après le scan."/>;
  if (draft.type === 'text') return <Area label="Votre message" value={c.text} onChange={set('text')} placeholder="Écrivez le texte à afficher après le scan…" help="Un message court est plus facile à scanner."/>;
  if (draft.type === 'whatsapp') return <>{phone}<Area label="Message prérempli · facultatif" value={c.message} onChange={set('message')} placeholder="Bonjour, je souhaite en savoir plus…"/></>;
  if (draft.type === 'phone') return phone;
  if (draft.type === 'sms') return <>{phone}<Area label="Message prérempli · facultatif" value={c.message} onChange={set('message')} placeholder="Votre message…"/></>;
  if (draft.type === 'email') return <><Field label="Adresse e-mail" type="email" value={c.email} onChange={set('email')} placeholder="bonjour@exemple.com"/><Field label="Objet · facultatif" value={c.subject} onChange={set('subject')} placeholder="Demande d’information"/><Area label="Message · facultatif" value={c.message} onChange={set('message')} placeholder="Bonjour…"/></>;
  if (draft.type === 'wifi') return <><Field label="Nom du réseau Wi-Fi" value={c.wifiName} onChange={set('wifiName')} placeholder="Nom de votre réseau"/><div className="field-split"><Field label="Mot de passe" value={c.wifiPassword} onChange={set('wifiPassword')} placeholder="Mot de passe" type="password" disabled={c.wifiSecurity === 'nopass'}/><label className="form-label">Sécurité<select className="text-input" value={c.wifiSecurity} onChange={e => update('wifiSecurity', e.target.value)}><option value="WPA">WPA / WPA2</option><option value="WEP">WEP</option><option value="nopass">Aucun</option></select></label></div><label className="check-row"><input type="checkbox" checked={!!c.hidden} onChange={e => update('hidden', e.target.checked)}/> Réseau masqué</label><p className="field-help">Les identifiants Wi-Fi sont visibles par toute personne qui scanne le QR code.</p></>;
  return <><Field label="Nom complet" value={c.name} onChange={set('name')} placeholder="Prénom et nom"/><div className="field-split"><Field label="Téléphone · facultatif" value={c.phone} onChange={set('phone')} type="tel" placeholder="+213…"/><Field label="E-mail · facultatif" value={c.email} onChange={set('email')} type="email" placeholder="vous@exemple.com"/></div><Field label="Entreprise · facultatif" value={c.company} onChange={set('company')} placeholder="Nom de l’entreprise"/><Field label="Site web · facultatif" value={c.website} onChange={set('website')} placeholder="https://votre-site.com"/></>;
}
function MiniPattern({ kind }) {
  return <span className={`mini-pattern ${kind}`} aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i}/>)}</span>;
}

export default function Editor({ config, openAuth, navigate }) {
  const [draft, setDraft] = useState(() => structuredClone(DEFAULT_DRAFT));
  const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const fileRef = useRef(null);
  const attempt = useRef(null); const { session } = useAuth();
  const update = (key, value) => { setDraft(prev => ({ ...prev, content: { ...prev.content, [key]: value } })); setNotice(''); attempt.current = null; };
  const updateStyle = (key, value) => { setDraft(prev => ({ ...prev, style: { ...prev.style, [key]: value } })); setNotice(''); attempt.current = null; };
  const setType = type => { setDraft(prev => ({ ...prev, type })); setNotice(''); attempt.current = null; };
  const goodContrast = hasGoodContrast(draft.style.foreground, draft.style.background);
  const previewSvg = useMemo(() => { try { return renderSvg(exampleSnapshot(draft.style), { preview: true }); } catch { return ''; } }, [draft.style]);
  function upload(e) {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = '';
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 200_000) { setNotice('Utilisez un logo PNG, JPG ou WebP de 200 Ko maximum.'); return; }
    const reader = new FileReader(); reader.onload = () => updateStyle('logo', String(reader.result)); reader.onerror = () => setNotice('Impossible de lire ce fichier.'); reader.readAsDataURL(file);
  }
  async function checkout() {
    setNotice('');
    try { normalizeSnapshot(draft); } catch (err) { setNotice(err.message); document.getElementById('editor-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (!config.salesEnabled) { setNotice('Les commandes ne sont pas encore ouvertes. Le tarif et le paiement doivent être configurés.'); return; }
    if (!session) { openAuth(); return; }
    setBusy(true);
    try {
      attempt.current ||= crypto.randomUUID();
      const result = await api('/api/checkout', { token: session.access_token, method: 'POST', body: { draft, attemptId: attempt.current } });
      if (result.paid) { navigate('/mes-qr'); return; }
      if (!validCheckoutUrl(result.checkoutUrl)) throw new Error('Lien de paiement invalide.');
      window.location.assign(result.checkoutUrl);
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  return <>
    <div className="page-intro">
      <div className="eyebrow"><span className="eyebrow-dot"/> VOTRE ATELIER CRÉATIF</div>
      <h1>Un petit code.<br className="mobile-break"/> <span>De grandes idées.</span></h1>
      <p>Créez un QR code à votre image et partagez ce qui compte, en un simple scan.</p>
    </div>
    {config.announcement && <div className="announcement"><Sparkles size={16}/>{config.announcement}</div>}
    <div className="steps-bar" aria-label="Étapes de création"><div className="step-item current"><span>01</span><div><strong>Choisissez le contenu</strong><small>Que souhaitez-vous partager ?</small></div></div><i/><div className="step-item"><span>02</span><div><strong>Personnalisez</strong><small>Donnez-lui votre style</small></div></div><i/><div className="step-item"><span>03</span><div><strong>Téléchargez</strong><small>Après paiement confirmé</small></div></div></div>
    <div className="studio-grid">
      <section className="editor-card surface" id="editor-top">
        <div className="section-heading"><div className="heading-icon"><QrCode size={20}/></div><div><div className="overline">COMME VOUS L’IMAGINEZ</div><h2>Créons votre QR code</h2><p>Tout commence par ce que vous souhaitez partager.</p></div><button className="text-button reset-button" onClick={() => { setDraft(structuredClone(DEFAULT_DRAFT)); attempt.current = null; setNotice(''); }}><RotateCcw size={14}/> Réinitialiser</button></div>
        <div className="editor-body">
          <div className="subheading-row"><div><span className="number-label">01</span><h3>Choisissez un type</h3></div><span className="small-muted">8 possibilités</span></div>
          <div className="type-grid">{types.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => setType(item.id)} className={`type-card ${draft.type === item.id ? 'selected' : ''}`} aria-pressed={draft.type === item.id}><span className={`type-icon ${item.bg}`}><Icon size={19} strokeWidth={1.8}/></span><span>{item.label}</span>{draft.type === item.id && <span className="type-check"><Check size={10}/></span>}</button>; })}</div>
          <div className="content-fields"><ContentFields draft={draft} update={update}/></div>
          <div className="divider"/>
          <div className="subheading-row design-heading" id="personnaliser"><div><span className="number-label">02</span><h3>À votre image</h3></div><span className="small-muted"><Sparkles size={13}/> Personnalisation</span></div>
          <div className="design-grid">
            <div className="design-block"><label className="design-label">Couleur du QR code</label><div className="swatches">{palette.map(color => <button key={color} className={`swatch ${draft.style.foreground === color ? 'active' : ''}`} style={{ '--swatch': color }} onClick={() => updateStyle('foreground', color)} aria-label={`Couleur ${color}`} aria-pressed={draft.style.foreground === color}>{draft.style.foreground === color && <Check size={12}/>}</button>)}<label className="custom-color" title="Choisir une autre couleur"><Palette size={16}/><input aria-label="Choisir la couleur du QR" type="color" value={draft.style.foreground} onChange={e => updateStyle('foreground', e.target.value)}/></label></div></div>
            <div className="design-block"><label className="design-label" htmlFor="bgcolor">Couleur de fond</label><label className="background-color"><input id="bgcolor" type="color" value={draft.style.background} onChange={e => updateStyle('background', e.target.value)}/><span>{draft.style.background.toUpperCase()}</span><small>Modifier</small></label></div>
          </div>
          {!goodContrast && <p className="contrast-warning" role="status">Choisissez un QR foncé sur un fond clair pour un contraste suffisant.</p>}
          <div className="design-block shape-block"><label className="design-label">Forme des points</label><div className="shape-options">{[['rounded','Arrondis'],['square','Carrés'],['dots','Points']].map(([key, label]) => <button key={key} onClick={() => updateStyle('dots', key)} className={`shape-choice ${draft.style.dots === key ? 'selected' : ''}`} aria-pressed={draft.style.dots === key}><MiniPattern kind={key}/><span>{label}</span>{draft.style.dots === key && <CheckCircle2 size={15}/>}</button>)}</div></div>
          <div className="advanced-options"><div><label className="design-label" htmlFor="corner">Forme des coins</label><select className="text-input" id="corner" value={draft.style.corner} onChange={e => updateStyle('corner', e.target.value)}><option value="rounded">Arrondis</option><option value="square">Carrés</option><option value="circle">Ronds</option></select></div><div><label className="design-label">Votre logo <span>facultatif</span></label><div className="logo-upload">{draft.style.logo ? <><img src={draft.style.logo} alt="Logo ajouté"/><span>Logo ajouté</span><button onClick={() => updateStyle('logo', '')} aria-label="Supprimer le logo"><X size={15}/></button></> : <button onClick={() => fileRef.current?.click()}><ImagePlus size={16}/> Ajouter un logo</button>}<input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} hidden/></div><span className="field-help">PNG, JPG, WebP · max. 200 Ko</span></div></div>
          <div className="frame-section"><div><div className="frame-title"><strong>Ajouter une légende</strong><button type="button" className={`toggle ${draft.style.frame ? 'on' : ''}`} onClick={() => updateStyle('frame', !draft.style.frame)} role="switch" aria-checked={draft.style.frame} aria-label="Ajouter une légende"><span/></button></div><p>Un petit appel à l’action sous votre QR code.</p></div>{draft.style.frame && <input className="text-input" aria-label="Texte de la légende" value={draft.style.label} maxLength={28} onChange={e => updateStyle('label', e.target.value)} placeholder="SCANNEZ-MOI"/>}</div>
        </div>
        <div className="editor-bottom"><span><ShieldCheck size={16}/> Votre création est protégée</span><a href="#apercu">Voir l’aperçu <ArrowRight size={15}/></a></div>
      </section>
      <aside className="preview-column" id="apercu">
        <div className="preview-card surface"><div className="preview-heading"><div><div className="overline">ÇA PREND FORME</div><h2>Aperçu en direct <Sparkles size={16}/></h2></div><span className="live-pill"><i/> EN DIRECT</span></div>
          <div className="preview-stage"><div className="stage-decoration one"/><div className="stage-decoration two"/><div className="qr-paper"><div className="qr-image" dangerouslySetInnerHTML={{ __html: previewSvg }}/></div><div className="stage-caption"><ScanLine size={14}/> APERÇU D’EXEMPLE</div></div>
          <p className="preview-explainer">Cet exemple montre votre design. Votre QR personnel sera créé après paiement.</p>
          <div className="format-row"><span><FileImage size={15}/> PNG haute qualité</span><span><QrCode size={15}/> SVG vectoriel</span></div>
          <div className="price-line"><div><strong>Votre QR personnalisé</strong><span>Une création, à télécharger après paiement</span></div><div className="price-amount">{money(config.priceDzd)}<small>{config.priceDzd ? 'par création' : 'tarif à définir'}</small></div></div>
          <button className="button button-primary full checkout-button" onClick={checkout} disabled={busy}><span>{busy ? 'Préparation…' : config.salesEnabled ? 'Continuer vers le paiement' : 'Préparer ma commande'}</span><ArrowRight size={18}/></button>
          {notice && <div role="status" className="form-alert error editor-notice">{notice}</div>}
          {!config.salesEnabled && <p className="availability"><CircleHelp size={14}/> Commandes bientôt disponibles</p>}
          {config.paymentMode === 'test' && <p className="availability">Mode test : aucun paiement réel.</p>}
          <p className="secure-checkout"><LockKeyhole size={13}/> Paiement prévu via Chargily · CIB & EDAHABIA</p>
        </div>
        <div className="tip-card"><div className="tip-icon"><Sparkles size={17}/></div><div><strong>Le petit conseil du studio</strong><p>Gardez un bon contraste et testez toujours votre QR code avant impression.</p></div></div>
      </aside>
    </div>
    <section className="how-section" id="comment-ca-marche"><div className="section-kicker">SIMPLE COMME BONJOUR</div><h2>Votre idée mérite d’être partagée.</h2><p>Trois petites étapes, et le tour est joué.</p><div className="how-grid"><div><span>01</span><Globe2 size={21}/><h3>Choisissez votre contenu</h3><p>Un lien, un contact, le Wi-Fi… à vous de choisir.</p></div><div><span>02</span><Palette size={21}/><h3>Créez votre style</h3><p>Couleurs, formes et logo : faites-vous plaisir.</p></div><div><span>03</span><Download size={21}/><h3>Partagez votre QR</h3><p>Après paiement confirmé, téléchargez-le en PNG ou SVG.</p></div></div></section>
  </>;
}
