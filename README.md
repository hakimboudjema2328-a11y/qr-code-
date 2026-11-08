# QR Studio

Application React de création et personnalisation de QR codes.

## Installation
1. Installez Node.js (version 18 ou supérieure).
2. Décompressez le projet.
3. Ouvrez un terminal dans le dossier `qr-studio`.
4. Exécutez :

```bash
npm install
npm run dev
```

5. Ouvrez l'adresse locale affichée par Vite (généralement http://localhost:5173).

## Production
```bash
npm run build
npm run preview
```

Le dossier `dist/` contient le site prêt à être déployé sur Vercel, Netlify ou un hébergement statique.

## Notes
- Les QR codes sont générés dans le navigateur.
- PNG et SVG sont exportés par `qr-code-styling`.
- « Imprimer / PDF » ouvre la boîte d'impression du navigateur : choisissez « Enregistrer au format PDF ».
- Les QR codes Wi-Fi utilisent le format standard WIFI.
- Pour un scan fiable, gardez un bon contraste entre le QR code et son arrière-plan et testez le résultat avant impression.
