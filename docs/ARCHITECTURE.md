# Architecture et garanties

- Deux PWA autonomes : `site-public/web` et `admin-app/web`, HTML/CSS/JavaScript dans `index.html`, configuration publique distincte, SDK Supabase local, aucune compilation web.
- Déploiement Cloudflare Pages : les deux dossiers sont copiés dans `.output/public`, avec l’administration sous `/admin/`.
- APK : `android/prepare_assets.sh` copie l’app admin ; Java/WebViewAssetLoader charge les assets embarqués, le réseau reste nécessaire pour Supabase. Les liens externes quittent la WebView. GitHub Actions produit un APK de test et, si un keystore est fourni, un APK/AAB release signé.
- Supabase Auth + RLS : utilisateurs et administrateurs séparés, aucune écriture directe des commandes depuis le navigateur, colonnes sensibles non accessibles aux clients.
- Edge Functions : création Chargily, rapprochement et export authentifiés ; webhook public seulement avec signature ; contenu chiffré AES-GCM avec identifiant commande/utilisateur comme données associées.
- Aucune page ne reçoit de clé service-role ou Chargily. Le montant est relu côté serveur. Un retour navigateur ne confirme pas le paiement. Les modes test/réel sont strictement séparés.
- L’aperçu n’encode qu’un exemple ; l’export du contenu réel est produit côté serveur après paiement confirmé. Il n’empêche évidemment pas un utilisateur de créer un QR ailleurs.
- Par rapport à KARIDZ : pas de RLS permissive, pas de mot de passe par défaut et pas d’accès universel `file://`. Les notifications et les trois applications propres à la location de voitures ne sont pas répliquées car hors du projet QR.

- La connexion administrateur demande uniquement le mot de passe : l’adresse de récupération reste dans le secret `ADMIN_EMAIL` de Supabase. La fonction vérifie Supabase Auth et le rôle ; un verrou limite les tentatives incorrectes.
