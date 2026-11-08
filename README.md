# QR Studio — QR codes personnalisés

Site public + espace administrateur + Supabase + APK Android WebView. L’organisation reprend la méthode du projet KARIDZ : **pages HTML autonomes**, PWA, base Supabase partagée, fichiers web embarqués dans l’APK et construction Android par GitHub Actions. Il n’y a pas de build web React/Vite.

> **État : configuration nécessaire.** Sans projet Supabase, compte administrateur, secrets Chargily, clé de chiffrement et tarif, les comptes et les ventes restent indisponibles. Aucun paiement réel n’est supposé testé. Le paiement par création dans le code est une hypothèse à confirmer ; le tarif et le modèle commercial restent à définir.

## Arborescence

```text
site-public/web/                    site client HTML/CSS/JS + manifest + SW
admin-app/web/                      administration HTML/CSS/JS + manifest + SW
supabase/schema.sql                 tables, RLS et autorisations administrateur
supabase/functions/qr-checkout/     création de paiement Chargily
supabase/functions/qr-order/        vérification et export après paiement
supabase/functions/chargily-webhook/ webhook public à signature obligatoire
android/admin/                      application native WebView Java
android/prepare_assets.sh           copie de l’administration dans l’APK
scripts/prepare-web.sh              préparation Cloudflare : site + /admin/
.github/workflows/build-apk.yml      vérifications, APK GitHub, AAB si signé
tests/ et e2e/                      tests simulés, UI et décodage des QR
```

Par rapport au dépôt de référence, les protections faibles ne sont **pas** copiées : pas de mot de passe codé en dur, pas de RLS ouverte, pas de clés secrètes dans les pages. L’APK embarque bien les fichiers comme KARIDZ mais les sert via `WebViewAssetLoader` (`https://appassets.androidplatform.net/...`) plutôt que `file://`, afin de désactiver l’accès général aux fichiers. Le site et l’administration sont réunis sous une origine Cloudflare : `/` et `/admin/`.

## 1. Supabase et administrateur

1. Choisir ou créer un projet Supabase dédié. Ne pas utiliser un autre projet sans vérifier sa destination et ses données.
2. SQL Editor : exécuter `supabase/schema.sql`. Vérifier les RLS et les privilèges si ces tables existaient déjà. `qr_studio_settings` ne contient que des informations publiques ; commandes et rôles sont protégés. Seules les fonctions serveur ont accès aux brouillons chiffrés.
3. Activer l’authentification e-mail, créer un utilisateur et confirmer son adresse. Dans SQL Editor, attribuer explicitement ce compte :

   ```sql
   insert into public.qr_studio_admins(user_id)
   select id from auth.users where email = 'votre-adresse@example.com'
   on conflict (user_id) do nothing;
   ```

   Remplacer l’adresse ; vérifier qu’une ligne est insérée. Aucun mot de passe administrateur n’est prédéfini.
4. Dans Authentication → URL Configuration, choisir l’URL HTTPS du site et autoriser la redirection `https://VOTRE-SITE/?recovery=1` pour la récupération de mot de passe. Configurer un service SMTP adapté avant une mise en production.
5. Récupérer **uniquement l’URL du projet et la clé anon/publishable publique** pour les sites et l’APK. Ne jamais y placer `service_role`, clés Chargily, mots de passe ou jetons GitHub/Cloudflare.

## 2. Paiement Chargily (d’abord en mode test)

La création de session utilise le prix stocké côté serveur, et non un montant transmis par le navigateur. Les commandes sont limitées à l’utilisateur connecté. Les brouillons (dont un éventuel mot de passe Wi-Fi) sont chiffrés par AES-GCM ; l’export n’est autorisé qu’après confirmation serveur du paiement. Le webhook Chargily vérifie HMAC-SHA256 sur le corps brut puis revérifie la session auprès de Chargily. Les environnements `test` et `live` restent séparés.

Dans les **secrets des Edge Functions Supabase**, définir :

- `PUBLIC_SITE_URL` : origine HTTPS du site, sans chemin final.
- `CHARGILY_MODE` : `test` ou `live` ; commencer par `test`.
- `CHARGILY_SECRET_KEY` : clé Chargily correspondant exactement à ce mode.
- `ORDER_ENCRYPTION_KEY` : 32 octets aléatoires encodés en base64 (`openssl rand -base64 32`). **Conserver cette clé en lieu sûr** : sa perte rend les anciennes créations indéchiffrables ; la rotation exige une migration contrôlée.

Supabase fournit automatiquement aux fonctions `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY`. Ne pas placer ces secrets dans GitHub Variables, le site ou l’APK. Déployer les fonctions depuis ce répertoire avec la CLI Supabase connectée au bon projet :

```bash
supabase functions deploy qr-checkout --project-ref VOTRE_PROJECT_REF
supabase functions deploy qr-order --project-ref VOTRE_PROJECT_REF
supabase functions deploy chargily-webhook --project-ref VOTRE_PROJECT_REF --no-verify-jwt
```

Seul le webhook désactive la vérification JWT de la passerelle, car Chargily n’a pas de compte utilisateur Supabase. **Sa signature est vérifiée par le code.** Les deux fonctions clientes exigent un JWT et revérifient l’utilisateur. L’URL webhook est fournie automatiquement à Chargily : `https://VOTRE-PROJET.supabase.co/functions/v1/chargily-webhook`.

Dans l’administration, définir le tarif convenu, sélectionner le mode déclaré (qui doit correspondre à `CHARGILY_MODE` côté serveur) puis activer les ventes. Une incohérence entre les deux désactive la création de paiement. Tester inscription, confirmation e-mail, paiement test, webhook, actualisation et téléchargements. Passer en `live` uniquement après validation du compte Chargily et des essais. Les commandes de test ne doivent pas être considérées comme des ventes réelles.

## 3. Cloudflare Pages

Remplir les **valeurs publiques** dans l’environnement de construction ou les GitHub Variables : `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PUBLIC_SITE_URL`. Les fichiers `supabase-config.js` du dépôt sont des modèles vides ; le script écrit la configuration dans une copie, jamais un secret. Un domaine Supabase personnalisé est ajouté automatiquement à la CSP de la copie.

```bash
bash scripts/prepare-web.sh
# Publier .output/public sur un projet Cloudflare Pages :
npx wrangler pages deploy .output/public --project-name VOTRE_PROJET --branch main
```

Le workflow `cloudflare-pages.yml` est volontairement inactif tant que la variable `CLOUDFLARE_PAGES_PROJECT` et les secrets GitHub `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` ne sont pas configurés. Utiliser un jeton Cloudflare à permissions minimales, renouvelé et stocké comme secret. Les modifications GitHub ne sont donc pas publiées automatiquement tant que ce workflow n’est pas activé.

## 4. APK via GitHub Actions

Le workflow `build-apk.yml` vérifie les pages, copie l’intégralité de `admin-app/web` dans les assets, injecte la **configuration publique**, puis construit et vérifie l’APK. Ajouter dans les GitHub Variables du dépôt QR `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PUBLIC_SITE_URL` ; relancer l’action après modification. Sans ces valeurs l’APK affiche une page de configuration, mais l’administration ne peut pas se connecter. Télécharger l’artefact `qr-studio-admin` depuis Actions.

Par défaut, seul un **APK debug de test** est créé (Android 7+, non destiné à une publication Play Store). Pour générer aussi une version release et un AAB signés, ajouter les secrets `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` dans le dépôt QR. La signature release doit être conservée de manière sûre. Deux APK signés par des clés différentes peuvent nécessiter la désinstallation de l’ancien avant installation. Tester sur de vrais téléphones avant distribution. Le navigateur externe ouvre les liens hors de l’APK ; l’export CSV utilise le sélecteur de documents Android.

## 5. Aperçu et tests

```bash
npm ci
npm run check             # validation HTML/CSS/JS + fonctions Deno + tests simulés
npx playwright install chromium
npm run test:browser      # responsive, authentification simulée, QR décodés
bash scripts/prepare-web.sh
python3 -m http.server 5173 --directory .output/public
# http://localhost:5173/ et http://localhost:5173/admin/
```

Sans configuration publique, l’aperçu reste utilisable mais les ventes et la connexion sont désactivées. L’aperçu QR encode un **exemple**, pas les données du client. Les QR générés sont statiques : modifier leur destination après achat nécessiterait une fonctionnalité distincte. Testez toujours le scan avec le logo et les couleurs retenues.

## Sécurité opérationnelle

Tout jeton transmis dans une conversation doit être **révoqué puis remplacé**, même s’il semble en lecture seule. Limiter les droits des nouveaux jetons et les stocker dans les emplacements de secrets des services. Le dépôt de référence KARIDZ est consulté uniquement en lecture et sa configuration Supabase n’est pas copiée ici. Une revue de sécurité et des tests réels restent nécessaires avant ouverture commerciale.
