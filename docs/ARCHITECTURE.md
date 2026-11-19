# Architecture

- Deux PWA HTML autonomes : site client et administration, servies par Cloudflare Pages et `/admin/`. L’APK Java embarque l’administration via `WebViewAssetLoader` et nécessite le réseau pour Supabase.
- Les abonnements sont créés par l’administrateur, lus publiquement seulement lorsqu’ils sont publiés. Le formulaire ouvre WhatsApp avec les informations saisies ; aucune transaction financière n’est confirmée automatiquement.
- `qr-client-admin` vérifie la session et le rôle admin avant création d’un utilisateur. Il produit un code de 128 bits aléatoires, affiché une seule fois. Supabase Auth conserve son hachage de mot de passe ; une adresse synthétique dérivée sert uniquement à l’intégration Auth. Le client n’a pas d’e-mail à saisir.
- `qr-client-auth` vérifie le code côté serveur, utilise une limite de tentatives par empreinte HMAC de l’adresse réseau et renvoie seulement les jetons de session. Les empreintes ne sont pas des adresses IP en clair. Les inscriptions publiques peuvent être désactivées.
- Les politiques RLS vérifient le propriétaire, l’état du compte, la version du code et l’existence de la session Supabase. Un renouvellement révoque les anciennes sessions. L’expiration ne bloque pas la lecture des QR existants ; une désactivation bloque tout accès au compte.
- `qr-client-qr` valide le contenu, vérifie les droits et l’échéance côté serveur, et crée les QR sous verrou SQL. Les snapshots sont chiffrés AES-GCM et liés à l’identifiant du QR et du client. Les colonnes chiffrées sont inaccessibles aux clients via PostgREST ; l’export déchiffre uniquement le QR du propriétaire.
- L’aperçu ne contient que des données d’exemple. Les QR finaux sont statiques : leur scan ne peut pas être coupé après téléchargement ou impression. Les neuf styles sont soumis à des tests de décodage.
- Les anciennes fonctions Chargily retournent 410 et les données historiques ne sont pas supprimées. Aucun tarif, abonnement ou paiement fictif n’est créé.
