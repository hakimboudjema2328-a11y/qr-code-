import { useEffect, useMemo, useRef, useState } from 'react';
import QRCodeStyling from 'qr-code-styling';
import {
  QrCode, Link2, MessageCircle, Mail, Phone, Wifi, Type, Download,
  ImagePlus, Palette, Sparkles, Printer, ChevronDown, Check, Menu
} from 'lucide-react';

const TYPES = [
  { id: 'url', label: 'URL', icon: Link2 },
  { id: 'text', label: 'Texte', icon: Type },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'email', label: 'E-mail', icon: Mail },
  { id: 'phone', label: 'Téléphone', icon: Phone },
  { id: 'wifi', label: 'Wi-Fi', icon: Wifi },
];

const initial = {
  type: 'url', url: 'https://example.com', text: 'Bonjour ! Découvrez notre site.',
  phone: '', email: '', subject: '', message: '', country: '+213',
  wifiName: '', wifiPassword: '', wifiSecurity: 'WPA', hidden: false,
  fg: '#172554', bg: '#ffffff', dots: 'rounded', corner: 'extra-rounded',
  label: 'SCANNEZ-MOI', frame: true
};

function escapeWifi(value) {
  return String(value).replace(/([\\;,:"])/g, '\\$1');
}

export default function App() {
  const [data, setData] = useState(initial);
  const [logo, setLogo] = useState('');
  const [tab, setTab] = useState('content');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const qrRef = useRef(null);
  const qrInstance = useRef(null);
  const fileRef = useRef(null);

  const payload = useMemo(() => {
    if (data.type === 'url') return data.url.trim() || 'https://example.com';
    if (data.type === 'text') return data.text || ' ';
    if (data.type === 'whatsapp') {
      const number = data.phone.replace(/[^\d]/g, '');
      const msg = encodeURIComponent(data.message);
      return number ? `https://wa.me/${number}${msg ? `?text=${msg}` : ''}` : 'https://wa.me/';
    }
    if (data.type === 'email') {
      const params = new URLSearchParams();
      if (data.subject) params.set('subject', data.subject);
      if (data.message) params.set('body', data.message);
      return `mailto:${data.email || 'contact@example.com'}${params.toString() ? `?${params}` : ''}`;
    }
    if (data.type === 'phone') return `tel:${data.phone.replace(/[^\d+]/g, '')}`;
    if (data.type === 'wifi') {
      const security = data.wifiSecurity === 'nopass' ? 'nopass' : data.wifiSecurity;
      return `WIFI:T:${security};S:${escapeWifi(data.wifiName)};P:${escapeWifi(data.wifiPassword)};H:${data.hidden ? 'true' : 'false'};;`;
    }
    return '';
  }, [data]);

  useEffect(() => {
    const instance = new QRCodeStyling({
      width: 300, height: 300, type: 'svg', data: payload,
      image: logo || undefined,
      dotsOptions: { color: data.fg, type: data.dots },
      backgroundOptions: { color: data.bg },
      cornersSquareOptions: { color: data.fg, type: data.corner },
      cornersDotOptions: { color: data.fg, type: 'dot' },
      imageOptions: { crossOrigin: 'anonymous', margin: 7, imageSize: 0.28, hideBackgroundDots: true },
      qrOptions: { errorCorrectionLevel: 'H' }
    });
    qrInstance.current = instance;
    if (qrRef.current) {
      qrRef.current.innerHTML = '';
      instance.append(qrRef.current);
    }
  }, [payload, data.fg, data.bg, data.dots, data.corner, logo]);

  const update = (key, value) => setData(prev => ({ ...prev, [key]: value }));
  const download = async (extension) => {
    if (!qrInstance.current) return;
    await qrInstance.current.download({ name: 'qr-studio', extension });
    setNotice(`QR code téléchargé en ${extension.toUpperCase()}`);
    setTimeout(() => setNotice(''), 2600);
  };
  const uploadLogo = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setNotice('Choisissez un fichier image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result));
    reader.readAsDataURL(file);
  };
  const reset = () => { setData(initial); setLogo(''); };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-icon"><QrCode size={23}/></span><span>qr<span className="brand-accent">studio</span></span></a>
        <nav className={menuOpen ? 'nav-links open' : 'nav-links'}>
          <a href="#create" onClick={() => setMenuOpen(false)}>Créer un QR code</a>
          <a href="#how" onClick={() => setMenuOpen(false)}>Comment ça marche</a>
        </nav>
        <div className="top-actions"><span className="secure"><span className="secure-dot"/> Gratuit & privé</span><button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Ouvrir le menu"><Menu/></button></div>
      </header>

      <main>
        <section className="hero">
          <div className="eyebrow"><Sparkles size={14}/> SIMPLE · RAPIDE · PERSONNALISABLE</div>
          <h1>Vos idées, en un <span>scan.</span></h1>
          <p>Créez des QR codes uniques en quelques secondes. Personnalisez leur apparence et téléchargez-les gratuitement.</p>
        </section>

        <section className="workspace" id="create">
          <div className="editor panel">
            <div className="panel-heading">
              <div><span className="step">ÉTAPE 01</span><h2>Configurez votre QR code</h2></div>
              <button className="reset-btn" onClick={reset}>Réinitialiser</button>
            </div>
            <div className="tabs">
              <button className={tab === 'content' ? 'tab active' : 'tab'} onClick={() => setTab('content')}>Contenu</button>
              <button className={tab === 'design' ? 'tab active' : 'tab'} onClick={() => setTab('design')}>Personnalisation</button>
            </div>

            {tab === 'content' ? <>
              <label className="field-label">TYPE DE QR CODE</label>
              <div className="type-grid">
                {TYPES.map(item => {
                  const Icon = item.icon;
                  return <button key={item.id} className={data.type === item.id ? 'type-option selected' : 'type-option'} onClick={() => update('type', item.id)}><Icon size={18}/><span>{item.label}</span></button>;
                })}
              </div>
              <div className="form-fields">
                {data.type === 'url' && <Field label="Adresse du site web" hint="https://" value={data.url} onChange={v => update('url', v)} placeholder="https://monsite.com"/>}
                {data.type === 'text' && <TextField label="Votre texte" value={data.text} onChange={v => update('text', v)} placeholder="Écrivez votre message..."/>}
                {data.type === 'whatsapp' && <>
                  <Field label="Numéro WhatsApp" value={data.phone} onChange={v => update('phone', v)} placeholder="213555123456"/>
                  <TextField label="Message prérempli (facultatif)" value={data.message} onChange={v => update('message', v)} placeholder="Bonjour, je souhaite en savoir plus..."/>
                  <p className="helper">Incluez l'indicatif du pays, sans espaces si possible.</p>
                </>}
                {data.type === 'email' && <>
                  <Field label="Adresse e-mail" value={data.email} onChange={v => update('email', v)} placeholder="contact@exemple.com"/>
                  <Field label="Objet (facultatif)" value={data.subject} onChange={v => update('subject', v)} placeholder="Demande d'information"/>
                  <TextField label="Message (facultatif)" value={data.message} onChange={v => update('message', v)} placeholder="Votre message..."/>
                </>}
                {data.type === 'phone' && <Field label="Numéro de téléphone" value={data.phone} onChange={v => update('phone', v)} placeholder="+213 555 12 34 56"/>}
                {data.type === 'wifi' && <>
                  <Field label="Nom du réseau (SSID)" value={data.wifiName} onChange={v => update('wifiName', v)} placeholder="Mon Wi-Fi"/>
                  <Field label="Mot de passe" value={data.wifiPassword} onChange={v => update('wifiPassword', v)} placeholder="Mot de passe Wi-Fi"/>
                  <label className="field-label">SÉCURITÉ</label>
                  <select className="select-input" value={data.wifiSecurity} onChange={e => update('wifiSecurity', e.target.value)}><option value="WPA">WPA / WPA2</option><option value="WEP">WEP</option><option value="nopass">Aucun mot de passe</option></select>
                  <label className="check-row"><input type="checkbox" checked={data.hidden} onChange={e => update('hidden', e.target.checked)}/> Réseau masqué</label>
                </>}
              </div>
            </> : <>
              <div className="design-section">
                <div className="section-title"><Palette size={17}/> Couleurs</div>
                <div className="color-row">
                  <ColorControl label="QR code" value={data.fg} onChange={v => update('fg', v)}/>
                  <ColorControl label="Arrière-plan" value={data.bg} onChange={v => update('bg', v)}/>
                </div>
                <div className="section-title"><Sparkles size={17}/> Style du QR code</div>
                <label className="field-label">FORME DES POINTS</label>
                <div className="choice-row">{[['square','Carré'],['dots','Rond'],['rounded','Arrondi'],['classy','Élégant']].map(([v,l]) => <button key={v} className={data.dots === v ? 'choice selected' : 'choice'} onClick={() => update('dots', v)}>{l}</button>)}</div>
                <label className="field-label">COINS DU QR CODE</label>
                <div className="choice-row">{[['square','Carré'],['dot','Rond'],['extra-rounded','Arrondi']].map(([v,l]) => <button key={v} className={data.corner === v ? 'choice selected' : 'choice'} onClick={() => update('corner', v)}>{l}</button>)}</div>
                <div className="section-title"><ImagePlus size={17}/> Logo au centre</div>
                <div className="upload-box">
                  {logo ? <><img src={logo} alt="Logo importé"/><span>Logo ajouté</span><button onClick={() => setLogo('')}>Supprimer</button></> : <><button className="upload-button" onClick={() => fileRef.current?.click()}><ImagePlus size={17}/> Importer un logo</button><span>PNG, JPG ou SVG · conseillé : image carrée</span></>}
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadLogo}/>
                </div>
                <div className="section-title"><Type size={17}/> Cadre et légende</div>
                <label className="check-row"><input type="checkbox" checked={data.frame} onChange={e => update('frame', e.target.checked)}/> Afficher un cadre</label>
                {data.frame && <Field label="Texte sous le QR code" value={data.label} onChange={v => update('label', v)} placeholder="SCANNEZ-MOI"/>}
              </div>
            </>}
            <div className="editor-foot"><span><Check size={15}/> Aperçu mis à jour automatiquement</span><button onClick={() => setTab(tab === 'content' ? 'design' : 'content')}>{tab === 'content' ? 'Personnaliser' : 'Modifier le contenu'} <span>→</span></button></div>
          </div>

          <aside className="preview-column">
            <div className="preview-card panel">
              <div className="preview-head"><div><span className="step">ÉTAPE 02</span><h2>Aperçu en direct</h2></div><span className="live"><i/> EN DIRECT</span></div>
              <div className="qr-stage">
                <div className={data.frame ? 'qr-paper framed' : 'qr-paper'} style={{background: data.bg}}>
                  <div className="qr-render" ref={qrRef}/>
                  {data.frame && <div className="qr-caption" style={{color: data.fg}}>{data.label || ' '}</div>}
                </div>
              </div>
              <div className="preview-meta"><span><span className="meta-dot"/> QR code prêt à être scanné</span><span>300 × 300 px</span></div>
              <div className="download-area">
                <button className="download-main" onClick={() => download('png')}><Download size={18}/> Télécharger PNG</button>
                <div className="download-secondary"><button onClick={() => download('svg')}>Télécharger SVG</button><span>·</span><button onClick={() => window.print()}><Printer size={15}/> Imprimer / PDF</button></div>
              </div>
              {notice && <div className="notice"><Check size={15}/>{notice}</div>}
            </div>
            <div className="privacy-note"><span className="privacy-icon">✓</span><div><strong>Vos données restent privées</strong><p>La création se fait dans votre navigateur. Vos contenus ne sont pas envoyés à un serveur.</p></div></div>
          </aside>
        </section>

        <section className="how-section" id="how">
          <div className="eyebrow">EN 3 ÉTAPES</div><h2>Un QR code prêt en quelques clics.</h2>
          <div className="how-grid">
            <div><span>01</span><h3>Choisissez le contenu</h3><p>Ajoutez un lien, un message, vos coordonnées ou les accès Wi-Fi.</p></div>
            <div><span>02</span><h3>Personnalisez le design</h3><p>Adaptez les couleurs, les formes et ajoutez votre logo.</p></div>
            <div><span>03</span><h3>Téléchargez et partagez</h3><p>Exportez votre création en PNG ou SVG, ou imprimez-la.</p></div>
          </div>
        </section>
      </main>
      <footer><a className="brand" href="#"><span className="brand-icon"><QrCode size={20}/></span><span>qr<span className="brand-accent">studio</span></span></a><span>Créez. Personnalisez. Partagez.</span><span>© {new Date().getFullYear()} QR Studio</span></footer>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, hint }) {
  return <label className="field"><span className="field-label">{label}</span><div className="input-wrap">{hint && <span>{hint}</span>}<input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}/></div></label>;
}
function TextField({ label, value, onChange, placeholder }) {
  return <label className="field"><span className="field-label">{label}</span><textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}/></label>;
}
function ColorControl({ label, value, onChange }) {
  return <label className="color-control"><span>{label}</span><div><input type="color" value={value} onChange={e => onChange(e.target.value)}/><code>{value.toUpperCase()}</code></div></label>;
}
