// Bloque aussi les anciennes copies conservées par le cache de préservation de
// Cloudflare Pages : une simple suppression du fichier ne suffit pas toujours.
// _routes.json limite l'exécution du Worker aux anciennes routes /admin.
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/admin' || path.startsWith('/admin/')) {
      return new Response(request.method === 'HEAD' ? null : 'Cette page est introuvable.\n\nMassify-qrcode', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'X-Robots-Tag': 'noindex'
        }
      });
    }
    return env.ASSETS.fetch(request);
  }
};
