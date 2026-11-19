// Anciens endpoints de paiement volontairement désactivés après passage à WhatsApp.
export function retiredHandler() {
  return new Response(JSON.stringify({error:'Ce service de paiement a été remplacé par les demandes WhatsApp.'}),{
    status:410,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
  });
}
