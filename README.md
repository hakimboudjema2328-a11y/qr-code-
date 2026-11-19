# QR Studio — abonnements et QR codes personnalisés

Site public Cloudflare Pages, administration web, Supabase et APK Android WebView construite par GitHub Actions. La structure reste celle demandée : pages HTML autonomes, fichiers web embarqués dans l’APK et base Supabase commune.

## Fonctionnement commercial

1. Dans **Administration → Abonnements**, créez vos formules : nom, description, tarif en DA et durée indicative. Le prix et la durée sont facultatifs. Vous pouvez publier ou masquer une formule ; aucune formule ni aucun tarif ne sont inventés.
2. Sur le site, le client choisit une formule, indique son nom et son téléphone et, s’il le souhaite, des précisions. Le bouton ouvre WhatsApp avec un message prérempli. **Le client doit relire et envoyer ce message lui-même.** Aucune commande ou preuve de paiement n’est créée automatiquement sur le site.
3. Vous échangez avec le client sur WhatsApp et convenez des modalités hors du site. Ensuite, dans **Clients & accès**, créez son compte avec son nom et, facultativement, son téléphone, la formule et une date de fin. Une durée préremplie peut être modifiée ou effacée ; une date vide signifie sans limite.
4. Copiez le code secret, affiché une seule fois, et transmettez-le au client en privé. Il se connecte **avec ce seul code**, puis crée et télécharge ses QR en SVG ou PNG. En cas de perte, générez un nouveau code : l’ancien code et les anciennes sessions sont révoqués, sans supprimer les créations.
5. À l’expiration de l’accès, le client peut toujours se connecter, consulter et télécharger ses anciens QR, mais il ne peut plus en créer. Désactiver volontairement un compte bloque l’accès complet. Les QR téléchargés sont **statiques** : ils continuent à fonctionner une fois imprimés ou distribués, même après l’expiration de l’abonnement.

Les liens WhatsApp, Instagram et Facebook ainsi que l’annonce sont modifiables dans **Paramètres**. La connexion administrateur reste protégée par mot de passe ; l’e-mail n’est demandé que pour la récupération du mot de passe.

> Les anciens endpoints de paiement Chargily renvoient HTTP 410. Les éventuelles anciennes tables de commandes sont conservées, mais aucun nouveau paiement n’est déclenché. Le règlement et sa vérification sont manuels, hors du site.

## Arborescence

```text
site-public/web/                     site autonome, offres, WhatsApp, QR et espace client
admin-app/web/                       administration autonome et responsive
supabase/schema.sql                  schéma complet pour un nouveau projet
supabase/migrations/                 migrations successives pour un projet existant
supabase/functions/qr-admin-auth/    connexion admin par mot de passe seul
supabase/functions/qr-client-auth/   connexion client par code secret
supabase/functions/qr-client-admin/  création et renouvellement des codes par l’admin
supabase/functions/qr-client-qr/     création et export authentifiés des QR
android/                             application WebView et copie des assets
scripts/                             configuration publique et contrôles
.github/workflows/                   tests, APK/AAB, déploiement Cloudflare optionnel
tests/ et e2e/                       tests serveur et navigateur
```

## Installation Supabase

- Sur un projet **nouveau**, exécuter `supabase/schema.sql`. Sur un projet QR Studio existant, appliquer uniquement les migrations manquantes dans l’ordre : ne pas supprimer les données existantes.
- Activer l’authentification par mot de passe, désactiver les inscriptions publiques si les comptes doivent être créés uniquement par l’administrateur, puis créer et confirmer l’utilisateur administrateur. Lui attribuer le rôle dans SQL Editor :

  ```sql
  insert into public.qr_studio_admins(user_id)
  select id from auth.users where email = 'votre-adresse@example.com'
  on conflict (user_id) do nothing;
  ```

- Dans les secrets Edge Functions, configurer `PUBLIC_SITE_URL`, `ADMIN_EMAIL`, `ORDER_ENCRYPTION_KEY` (32 octets aléatoires en base64) et `CLIENT_RATE_PEPPER` (autre clé aléatoire de 32 octets en base64). Les variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont fournies par Supabase. Aucun de ces secrets, sauf l’URL et la clé publique anon/publishable, ne doit être placé dans le site, l’APK ou Git.
- **Sauvegarder la clé de chiffrement de manière privée et durable.** Sa perte rend les QR enregistrés indéchiffrables ; sa rotation exige une migration des données chiffrées. Dans le projet déployé, une sauvegarde chiffrée est conservée dans Supabase Vault sous `qr_studio_order_encryption_key_v1`. Un propriétaire du projet peut la récupérer depuis le SQL Editor privé ; ne jamais publier sa valeur ou la transmettre dans une conversation.
- Dans Auth → URL Configuration, autoriser `https://VOTRE-SITE/?recovery=1`. Un SMTP adapté reste nécessaire pour une récupération administrateur fiable ; les clients n’ont pas besoin d’e-mail.

Déployer les fonctions avec une CLI Supabase authentifiée :

```bash
npx supabase@3.0.0 functions deploy qr-admin-auth qr-client-auth qr-client-admin qr-client-qr --remote=VOTRE_PROJECT_REF --use-api --yes
npx supabase@3.0.0 functions deploy qr-checkout qr-order chargily-webhook --remote=VOTRE_PROJECT_REF --use-api --yes
```

`supabase/config.toml` désactive la vérification JWT de la passerelle pour les deux fonctions de connexion et l’ancien webhook retiré. Les deux fonctions de connexion appliquent leurs propres vérifications et limites ; les autres fonctions utilisateur exigent un JWT. Les anciens endpoints renvoient uniquement 410.

## Cloudflare Pages

```bash
# Valeurs publiques dans l’environnement : SUPABASE_URL, SUPABASE_ANON_KEY, PUBLIC_SITE_URL
bash scripts/prepare-web.sh
npx wrangler pages deploy .output/public --project-name VOTRE_PROJET --branch main
```

Le workflow GitHub de déploiement est désactivé tant que la variable `CLOUDFLARE_PAGES_PROJECT` et les secrets Cloudflare requis ne sont pas configurés. Un envoi sur GitHub ne publie donc pas automatiquement le site en l’absence de ces réglages.

## APK administrateur

Le workflow `build-apk.yml` copie `admin-app/web` dans les assets Android, injecte uniquement la configuration publique depuis les variables GitHub, puis construit et vérifie l’APK. L’application utilise `WebViewAssetLoader`, une connexion HTTPS à Supabase et ouvre les liens externes dans le navigateur.

L’artefact `qr-studio-admin-1` est un **APK debug de test** pour Android 7 ou supérieur. Pour produire aussi un APK/AAB de production, renseigner les secrets de signature `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` et `KEY_PASSWORD`. Tester sur de vrais téléphones avant distribution. Des APK signés par des clés différentes peuvent nécessiter la désinstallation de l’ancienne version.

## Développement et contrôles

```bash
npm ci
npm run check
npx playwright install --with-deps chromium
npm run test:browser
bash scripts/prepare-web.sh
python3 -m http.server 5173 --directory .output/public
```

L’aperçu de l’éditeur encode un contenu d’exemple, pas les données réelles. Le QR final est généré sur le serveur après contrôle de la session et de la date de fin. Testez le scan avec les couleurs et le logo choisis.

Les codes clients sont des secrets aléatoires longs, équivalents à des mots de passe : ne pas les publier. Supabase applique des politiques RLS, un contrôle des sessions et une limitation des tentatives ; le contenu des QR enregistrés est chiffré. Une revue de sécurité indépendante et des essais sur appareils restent recommandés.
