# Massify-qrcode — abonnements et QR codes personnalisés

Site client Cloudflare Pages, Supabase et applications d’administration Windows (EXE) et Android (APK WebView), construites par GitHub Actions. L’interface administrateur est embarquée dans ces applications et n’est plus publiée sous `/admin/`.

## Fonctionnement commercial

1. Dans **Administration → Abonnements**, créez vos formules : nom, description, tarif en DA et durée indicative. Le prix et la durée sont facultatifs. Vous pouvez publier ou masquer une formule ; aucune formule ni aucun tarif ne sont inventés.
2. Sur le site, le client choisit une formule, indique son nom et son téléphone et, s’il le souhaite, des précisions. Le bouton ouvre WhatsApp avec un message prérempli. **Le client doit relire et envoyer ce message lui-même.** Aucune commande ou preuve de paiement n’est créée automatiquement sur le site.
3. Vous échangez avec le client sur WhatsApp et convenez des modalités hors du site. Ensuite, dans **Clients & accès**, créez son compte avec son nom et, facultativement, son téléphone, la formule et une date de fin. Une durée préremplie peut être modifiée ou effacée ; une date vide signifie sans limite.
4. Copiez le code secret, affiché une seule fois, et transmettez-le au client en privé. Il se connecte **avec ce seul code**, puis crée et télécharge ses QR en SVG ou PNG. En cas de perte, générez un nouveau code : l’ancien code et les anciennes sessions sont révoqués, sans supprimer les créations.
5. Vous pouvez indiquer un quota personnel de QR enregistrés : vide signifie illimité, zéro interdit les nouvelles créations. Supprimer un QR libère une place. Une réduction du quota ne supprime jamais les QR existants.
6. Vous pouvez prolonger un abonnement, modifier sa date de fin, désactiver ou supprimer un client. La prolongation part de la date de fin enregistrée si elle est future, sinon d’aujourd’hui ; un accès déjà sans date de fin reste illimité. Une suppression est définitive et efface le compte et ses QR enregistrés. En cas d’échec du service d’authentification pendant la suppression, le compte reste désactivé par sécurité : réessayez.
7. À l’expiration, le client peut se connecter et gérer ses anciens QR, mais ne peut pas en créer. **L’expiration seule ne coupe pas les QR existants.** Désactiver ou supprimer le client bloque ses nouveaux QR « Lien web » et « WhatsApp » ; réactiver un compte désactivé réactive ces liens s’ils n’ont pas été supprimés. Supprimer un QR désactivable bloque aussi ce lien. Les QR Wi-Fi, texte, contact, téléphone, e-mail et SMS sont natifs : leurs copies déjà téléchargées continuent de fonctionner. De même, les anciens QR statiques, y compris URL/WhatsApp, ne peuvent pas être révoqués à distance.
8. Les nouveaux QR web et WhatsApp utilisent une redirection Massify et nécessitent une connexion Internet et la disponibilité du domaine et des services. Les compteurs représentent des **ouvertures estimées**, pas des personnes uniques : les aperçus automatiques peuvent être comptés. Aucune adresse IP n’est enregistrée par l’application. Testez les QR avant impression.

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
supabase/functions/qr-client-admin/  création, prolongation, suppression et codes des clients
supabase/functions/qr-client-qr/     création, suppression et export authentifiés des QR
supabase/functions/qr-resolve/       ouverture publique des liens révocables
android/                             application Android WebView et copie des assets
windows/Admin/                       application Windows WebView2 autonome
scripts/                             configuration publique et contrôles
.github/workflows/                   tests, APK/AAB, déploiement Cloudflare optionnel
tests/ et e2e/                       tests serveur et navigateur
```

## Installation Supabase

- Sur un projet **nouveau**, exécuter `supabase/schema.sql`. Sur un projet Massify-qrcode existant, appliquer uniquement les migrations manquantes dans l’ordre : ne pas supprimer les données existantes.
- Activer l’authentification par mot de passe, désactiver les inscriptions publiques si les comptes doivent être créés uniquement par l’administrateur, puis créer et confirmer l’utilisateur administrateur. Lui attribuer le rôle dans SQL Editor :

  ```sql
  insert into public.qr_studio_admins(user_id)
  select id from auth.users where email = 'votre-adresse@example.com'
  on conflict (user_id) do nothing;
  ```

- Dans les secrets Edge Functions, configurer `PUBLIC_SITE_URL`, `ADMIN_EMAIL`, `ORDER_ENCRYPTION_KEY` (32 octets aléatoires en base64) et `CLIENT_RATE_PEPPER` (autre clé aléatoire de 32 octets en base64). En cas de changement de domaine, `EXTRA_SITE_ORIGINS` peut contenir une liste d’anciennes origines HTTPS exactes séparées par des virgules, pour que les sessions ouvertes sur l’ancien site restent utilisables pendant la transition. Les variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont fournies par Supabase. Aucun de ces secrets, sauf l’URL et la clé publique anon/publishable, ne doit être placé dans le site, l’APK ou Git.
- **Sauvegarder la clé de chiffrement de manière privée et durable.** Sa perte rend les QR enregistrés indéchiffrables ; sa rotation exige une migration des données chiffrées. Dans le projet déployé, une sauvegarde chiffrée est conservée dans Supabase Vault sous `qr_studio_order_encryption_key_v1`. Un propriétaire du projet peut la récupérer depuis le SQL Editor privé ; ne jamais publier sa valeur ou la transmettre dans une conversation.
- Dans Auth → URL Configuration, autoriser `https://VOTRE-SITE/?recovery=1`. Un SMTP adapté reste nécessaire pour une récupération administrateur fiable ; les clients n’ont pas besoin d’e-mail.

Déployer les fonctions avec une CLI Supabase authentifiée :

```bash
npx supabase@3.0.0 functions deploy qr-admin-auth qr-client-auth qr-client-admin qr-client-qr qr-resolve --remote=VOTRE_PROJECT_REF --use-api --yes
npx supabase@3.0.0 functions deploy qr-checkout qr-order chargily-webhook --remote=VOTRE_PROJECT_REF --use-api --yes
```

`supabase/config.toml` désactive la vérification JWT de la passerelle pour les deux fonctions de connexion, le résolveur public et l’ancien webhook retiré. Le résolveur ne renvoie que les liens actifs, jamais les données chiffrées ; ses réponses sont sans cache. Les fonctions de gestion exigent un JWT et vérifient les droits. Les anciens endpoints de paiement renvoient uniquement 410.

## Cloudflare Pages

```bash
# Valeurs publiques dans l’environnement : SUPABASE_URL, SUPABASE_ANON_KEY, PUBLIC_SITE_URL
bash scripts/prepare-web.sh
npx wrangler pages deploy .output/public --project-name VOTRE_PROJET --branch main
```

La préparation ne copie jamais `admin-app/web` dans le site public. Elle génère une règle `/r/*` vers le résolveur Supabase. Un fichier `404.html` empêche le repli SPA. Un petit Worker Pages, limité par `_routes.json` aux anciennes routes `/admin` et `/admin/*`, renvoie 404 sans cache même lorsqu’une copie d’un ancien fichier reste dans le cache de préservation de Cloudflare. Pour éviter un retour aux anciens fichiers en cas d’échec ou d’épuisement du quota du Worker, choisir l’option **fail closed** dans les paramètres d’exécution Pages. Les autres chemins restent servis statiquement.

Les adresses immuables d’anciens déploiements Pages peuvent encore contenir l’ancienne interface ; elles sont distinctes du site principal. La suppression d’un déploiement historique peut rendre son adresse inutilisable et ne garantit pas une purge immédiate du cache Cloudflare : vérifier les conséquences avant suppression.

Le workflow GitHub de déploiement est désactivé tant que la variable `CLOUDFLARE_PAGES_PROJECT` et les secrets Cloudflare requis ne sont pas configurés. Renseigner `CLOUDFLARE_PAGES_PROJECT=massify-qrcode` et `PUBLIC_SITE_URL=https://massify-qrcode.pages.dev` dans les variables du dépôt. Le workflow refuse l’ancien projet, réservé à la redirection.

Pour conserver les anciens liens après le changement de domaine, le dossier `legacy-redirect/` peut être publié uniquement sur l’ancien projet Pages : il redirige vers `massify-qrcode.pages.dev` en conservant les chemins et les paramètres. Ne pas le publier sur le nouveau projet. Les sessions du navigateur étant liées au domaine, les clients et administrateurs peuvent devoir se reconnecter sur la nouvelle adresse ; les comptes et QR enregistrés ne sont pas modifiés.

## APK administrateur

Le workflow `build-apk.yml` copie `admin-app/web` dans les assets Android, injecte uniquement la configuration publique depuis les variables GitHub, puis construit et vérifie l’APK. L’application utilise `WebViewAssetLoader`, une connexion HTTPS à Supabase et ouvre les liens externes dans le navigateur.

L’artefact `massify-qrcode-admin-android` est un **APK debug de test** pour Android 7 ou supérieur. Pour produire aussi un APK/AAB de production, renseigner les secrets de signature `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` et `KEY_PASSWORD`. Tester sur de vrais téléphones avant distribution. Des APK signés par des clés différentes peuvent nécessiter la désinstallation de l’ancienne version.

## Application Windows administrateur

Le workflow `build-windows.yml` construit `Massify-qrcode-Admin.exe` en **Windows 64 bits**, avec l’interface administrateur et .NET embarqués. La connexion Internet et Microsoft Edge **WebView2 Runtime** sont nécessaires ; le runtime est généralement présent sur Windows 10/11 et peut être installé depuis Microsoft si besoin. La page n’est pas servie depuis le site public : elle est chargée depuis les ressources locales de l’application. Les liens externes s’ouvrent dans le navigateur.

L’EXE n’est pas signé par un certificat commercial : Windows SmartScreen peut demander une confirmation. Vérifiez la somme SHA-256 fournie par GitHub Actions et ne distribuez le logiciel qu’aux administrateurs autorisés. Il n’est pas testé sur toutes les versions de Windows ou tous les appareils. Le lien de récupération du mot de passe utilise toujours une page de réinitialisation sur le site public ; cette page n’expose pas le tableau de bord.

## Développement et contrôles

```bash
npm ci
npm run check
npx playwright install --with-deps chromium
npm run test:browser
bash scripts/prepare-web.sh
python3 -m http.server 5173 --directory .output/public
# Tests locaux de l’interface admin uniquement : bash scripts/prepare-test-web.sh
```

L’aperçu de l’éditeur encode un contenu d’exemple, pas les données réelles. Le QR final est généré sur le serveur après contrôle de la session et de la date de fin. La taille souhaitée du logo est réglable de 8 % à 22 % de la largeur de la grille QR ; elle peut être réduite automatiquement pour préserver les motifs de repérage et une marge de correction des erreurs. Dans ce cas, la taille appliquée est annoncée après la création. La correction élevée ne garantit pas la lecture dans toutes les conditions : testez le QR téléchargé sur plusieurs téléphones, et en taille réelle avant impression.

Après connexion par code, le client arrive dans son espace personnel : création, QR enregistrés, abonnement et déconnexion. Une session restaurée conserve cet affichage ; un abonnement expiré bloque seulement les nouvelles créations. Le site et l’administration proposent un thème clair ou sombre ; des palettes sont disponibles dans l’éditeur.

Les logos PNG, JPG et WebP jusqu’à 5 Mo (6 000 pixels de côté et 24 mégapixels au maximum) sont réduits localement avant l’enregistrement. L’export PNG 1 800 px est calculé localement sans lecture de canvas, pour rester utilisable lorsque le navigateur protège l’extraction de canvas. Les conversions utilisent les copies locales de resvg 2.6.2 (MPL-2.0) et jSquash PNG 3.1.1 / WebP 1.5.0 (Apache-2.0), ainsi que la police de secours DejaVu pour les légendes notamment arabes. Leurs licences figurent dans `site-public/web/vendor/` et `site-public/web/fonts/`. Le premier chargement de ces composants nécessite une connexion ; l’export SVG reste proposé si le PNG échoue. Testez toujours les QR sur de vrais téléphones avant impression.

Les codes clients sont des secrets aléatoires longs, équivalents à des mots de passe : ne pas les publier. Supabase applique des politiques RLS, un contrôle des sessions et une limitation des tentatives ; le contenu des QR enregistrés est chiffré. Une revue de sécurité indépendante et des essais sur appareils restent recommandés.
