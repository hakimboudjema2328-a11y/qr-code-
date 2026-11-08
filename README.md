# QR Studio

Créateur de QR codes personnalisés en français : React / Vite, Cloudflare Pages Functions, Supabase et Chargily Pay. Ce projet poursuit le dépôt initial `qr-code-`.

- Site de démonstration Cloudflare : **https://qr-studio-2328.pages.dev**
- Administration : **https://qr-studio-2328.pages.dev/admin**
- Application Android : dossier `android/`, construite par le workflow GitHub Actions « Construire l’APK administrateur ».

> **État actuel : démonstration, pas une boutique active.** Le tarif n’a pas été fixé et les accès Supabase / Chargily n’ont pas été configurés. Les ventes, les connexions et les téléchargements payants restent indisponibles tant que la configuration ci-dessous et les essais ne sont pas terminés. Aucun vrai paiement n’a été testé. Le modèle d’achat à l’unité est une hypothèse provisoire, à confirmer avant activation.

## Fonctionnalités

- Éditeur adaptatif : lien, texte, WhatsApp, Wi-Fi, e-mail, téléphone, SMS et vCard ; couleurs, formes, logo et légende.
- L’aperçu gratuit utilise un **contenu d’exemple**, pas les données personnelles du client. Une commande fige une création ; le QR correspondant est téléchargeable en SVG ou PNG après confirmation du paiement.
- Comptes et historique de commandes via Supabase Auth ; panneau administrateur protégé côté serveur par l’UUID du compte admin. L’admin peut régler le prix, activer / désactiver les commandes, gérer un message et une adresse de support, et consulter les 200 dernières commandes (les totaux affichés ne sont pas un historique complet).
- Checkout Chargily Pay v2 préparé en DZD. Le prix vient de la base, pas du navigateur ; la validation utilise la signature HMAC du webhook **et** une requête serveur à Chargily. Le simple retour sur le site ne suffit jamais à marquer une commande payée. Les frais sont configurés côté marchand.
- Contenu des commandes chiffré avec AES-256-GCM avant stockage. Les rôles `anon` et `authenticated` ne peuvent pas accéder directement aux tables ; la clé `service_role` reste côté Cloudflare.
- Les paiements de test et les paiements réels sont séparés par mode et les exports de test ne sont pas accessibles en mode réel.

Les QR sont **statiques** : leur contenu ne peut pas être modifié après achat et ils ne fournissent pas de statistiques de scans. Tester chaque QR avant impression. Toute personne qui scanne un QR Wi-Fi peut en voir les identifiants.

## 1. Sécurité des clés

Les anciens jetons GitHub, Supabase et Cloudflare communiqués dans la conversation doivent être **révoqués puis remplacés**. Ne collez pas de nouvelles clés dans une conversation et ne les commitez jamais. Utilisez uniquement les zones chiffrées de Cloudflare et les secrets GitHub. Le jeton de gestion Supabase `sbp_…` n’est **pas** la clé `service_role` du projet.

## 2. Préparer Supabase

1. Choisissez un projet Supabase approprié (de préférence distinct pour les essais et la production). Faites une sauvegarde si la base contient déjà des données.
2. Dans **SQL Editor**, exécutez une seule fois [`supabase/migrations/001_qr_studio.sql`](supabase/migrations/001_qr_studio.sql). Le script crée uniquement les tables `qr_studio_settings` et `qr_studio_orders`, active la RLS et retire l’accès direct aux rôles navigateur.
3. Dans **Authentication → Users**, créez le compte administrateur avec une adresse e-mail confirmée et un mot de passe fort. Copiez son **UUID** pour `ADMIN_USER_ID`. Un compte inscrit normalement n’est pas automatiquement administrateur.
4. Dans la configuration d’authentification, définissez l’URL du site et les URLs de redirection autorisées vers `https://qr-studio-2328.pages.dev` et `https://qr-studio-2328.pages.dev/reinitialiser-mot-de-passe`. Activez la confirmation des adresses e-mail et configurez un service d’e-mail adapté à la production.
5. Récupérez l’URL du projet, la clé publique `anon` / `publishable`, et la **clé JWT historique `service_role`** dans Supabase. Ne confondez pas cette dernière avec le jeton de gestion `sbp_…`. La clé service doit rester secrète.

Pour les clés Supabase modernes `sb_secret_…`, l’authentification REST peut différer : le backend actuel attend la clé JWT historique `service_role` ; ne la remplacez pas par un `sb_secret_…` sans adapter et tester le backend.

## 3. Configurer Cloudflare Pages

Le projet Cloudflare **`qr-studio-2328`** a été créé en mode **Direct Upload**. `PUBLIC_SITE_URL` et `CHARGILY_MODE=test` sont prévus pour l’environnement de production Pages. Dans Cloudflare → **Workers & Pages → qr-studio-2328 → Settings → Variables and Secrets**, vérifiez ces valeurs et ajoutez les suivantes à l’environnement souhaité :

| Nom | Valeur | Nature |
| --- | --- | --- |
| `PUBLIC_SITE_URL` | `https://qr-studio-2328.pages.dev` (origine HTTPS, sans chemin ni slash final) | Variable |
| `SUPABASE_URL` | URL HTTPS du projet Supabase | Variable |
| `SUPABASE_ANON_KEY` | clé publique `anon` / `publishable` | Variable publique |
| `SUPABASE_SERVICE_ROLE_KEY` | clé JWT historique `service_role` du projet | **Secret chiffré** |
| `ADMIN_USER_ID` | UUID exact de l’utilisateur administrateur confirmé | Variable |
| `ORDER_ENCRYPTION_KEY` | 32 octets aléatoires encodés en base64 | **Secret chiffré** |
| `CHARGILY_MODE` | `test` pour les essais, puis `live` uniquement après validation | Variable |
| `CHARGILY_SECRET_KEY` | clé secrète Chargily correspondant au mode choisi | **Secret chiffré** |

Générez `ORDER_ENCRYPTION_KEY` sur votre machine avec `openssl rand -base64 32`. Conservez-en une sauvegarde dans un gestionnaire de secrets. **Changer ou perdre cette clé sans migration rend les anciennes créations indéchiffrables.** Ce n’est pas l’un des jetons d’accès exposés à révoquer.

Redéployez après modification des variables / secrets. La politique CSP dans `public/_headers` autorise les domaines `*.supabase.co` ; si votre projet utilise un domaine Supabase personnalisé, ajoutez explicitement ce domaine à `connect-src` avant déploiement. Si vous changez de domaine, mettez à jour `PUBLIC_SITE_URL`, les URLs Supabase et la variable GitHub `ADMIN_SITE_URL`, puis reconstruisez l’APK.

## 4. Préparer Chargily et ouvrir les ventes

1. Créez / vérifiez le compte marchand Chargily. Utilisez d’abord la clé **test** et `CHARGILY_MODE=test`. Chargily demande la vérification du compte pour le mode réel.
2. Le webhook est envoyé à `https://qr-studio-2328.pages.dev/api/webhook` ; renseignez également cette adresse dans le tableau de bord Chargily si nécessaire. La signature est contrôlée sur le corps brut.
3. Connectez-vous à `/admin` avec le compte admin, définissez le prix en **dinars entiers** et l’adresse de support, puis activez les commandes. Le tarif exact et le modèle commercial restent à confirmer avec le propriétaire.
4. Testez de bout en bout en mode test : création d’un compte confirmé, paiement réussi, paiement annulé, webhook invalide, retour sans webhook, téléchargement PNG / SVG, réouverture depuis « Mes créations » et contrôle du QR avec plusieurs téléphones. Les tests automatisés du dépôt utilisent des services simulés : ils ne remplacent pas ce test Chargily réel.
5. Complétez les mentions légales, CGV, politique de remboursement, confidentialité, durée de conservation et procédure de suppression ; configurez la limitation de débit / WAF, la supervision et les sauvegardes. Ensuite seulement, mettez une clé réelle et `CHARGILY_MODE=live`, redéployez et vérifiez une transaction réelle de faible montant selon vos règles métier.

Références : [création de checkout Chargily](https://dev.chargily.com/pay-v2/api-reference/checkouts/create), [webhooks Chargily](https://dev.chargily.com/pay-v2/webhooks), [variables et secrets Cloudflare Pages](https://developers.cloudflare.com/pages/functions/bindings/).

## 5. Construire l’APK depuis GitHub

1. La variable de dépôt **`ADMIN_SITE_URL`** a été initialisée avec `https://qr-studio-2328.pages.dev` ; vérifiez-la dans GitHub → **Settings → Secrets and variables → Actions → Variables**.
2. Dans **Actions → Construire l’APK administrateur**, cliquez sur **Run workflow**. L’entrée `site_url` peut être laissée vide pour utiliser la variable. Si vous la remplissez, fournissez l’origine HTTPS seule, sans `/admin`.
3. À la fin, ouvrez l’exécution et téléchargez l’artefact **`qr-studio-admin-debug`**. Décompressez-le et installez l’APK sur un appareil Android 7 ou supérieur. Une connexion Internet est nécessaire ; l’écran de connexion ne fonctionnera qu’après configuration de Supabase.

L’APK est une **WebView**, pas un client administratif autonome : elle ouvre `/admin` sur le site indiqué, bloque le HTTP et les erreurs TLS, limite la navigation interne à l’hôte configuré et ouvre les liens HTTPS externes dans le navigateur. L’autorisation admin est contrôlée par le serveur, pas par l’APK.

**Attention : l’artefact est une version debug**, destinée aux tests, pas une publication Play Store. Chaque machine / exécution GitHub peut utiliser une clé de signature debug différente ; une nouvelle version peut exiger de désinstaller la précédente. Pour une distribution réelle, créer une signature release stable, conserver le keystore en lieu sûr et configurer des secrets GitHub dédiés.

## 6. Déploiements ultérieurs depuis GitHub

Le site a été publié sur Cloudflare en **Direct Upload**. Le workflow « Déployer Cloudflare Pages » est prêt, mais reste ignoré tant que la variable `CLOUDFLARE_PAGES_PROJECT` n’est pas renseignée. Après rotation des anciens jetons :

- Créez la variable GitHub `CLOUDFLARE_PAGES_PROJECT` = `qr-studio-2328`.
- Créez les secrets GitHub `CLOUDFLARE_ACCOUNT_ID` et `CLOUDFLARE_API_TOKEN` avec un nouveau jeton limité au déploiement Pages du bon compte.
- Lancez le workflow manuellement ou poussez sur `main`. Les variables d’exécution et secrets de paiement restent dans Cloudflare, jamais dans le dépôt.

Un projet Pages créé en Direct Upload ne se transforme pas en projet à intégration Git native ; pour utiliser le build Git intégré de Cloudflare, créez un nouveau projet Pages et adaptez les URLs / variables.

## Développement et tests

Node.js 22 recommandé :

```bash
npm ci
npm run dev                 # aperçu visuel, sans backend Pages
npm run check               # tests unitaires + build web
npx playwright install chromium
npm run test:browser        # interface responsive + décodage effectif des QR
```

Pour tester aussi les Pages Functions localement avec Wrangler et vos propres secrets, copiez vos valeurs dans un fichier `.dev.vars` **non commité**, puis :

```bash
npm run build
npx wrangler pages dev dist --compatibility-date=2026-11-01
```

Ne testez jamais de vrais paiements avec des valeurs de démonstration. Les sources n’intègrent aucune des clés fournies dans la conversation.
