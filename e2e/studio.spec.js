import { test, expect } from '@playwright/test';
import jsQR from 'jsqr';
import pngPkg from 'pngjs';
import { DEFAULT_STYLE, normalizeSnapshot, renderSvg } from '../shared/qr.js';

test('the editor previews the chosen style and fails closed before configuration', async ({ page }) => {
  const errors = []; page.on('pageerror', err => errors.push(err.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Un petit code/ })).toBeVisible();
  const before = await page.locator('.qr-image').innerHTML();
  await page.getByRole('button', { name: 'Wi-Fi', exact: true }).click();
  await page.getByLabel('Nom du réseau Wi-Fi').fill('Mon réseau');
  await page.getByLabel('Mot de passe', { exact: true }).fill('SecretWIFI');
  await page.getByRole('button', { name: 'Couleur #654fe5' }).click();
  await expect(page.locator('.qr-image')).not.toHaveText('');
  expect(await page.locator('.qr-image').innerHTML()).not.toEqual(before);
  await page.getByRole('button', { name: /Préparer ma commande/ }).click();
  await expect(page.getByText(/Les commandes ne sont pas encore ouvertes/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile navigation and admin adapt without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 }); await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page.getByRole('link', { name: 'Administration', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: /Bonjour, admin/ })).toBeVisible();
  await expect(page.getByText('Connexion en préparation')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('purchased SVG styles scan back to the intended content', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1100 });
  const input = { type: 'url', content: { url: 'https://example.com/my-qr?source=qr-studio' }, style: { ...DEFAULT_STYLE } };
  for (const dots of ['square', 'rounded', 'dots']) for (const corner of ['square', 'rounded', 'circle']) {
    const snapshot = { ...input, style: { ...input.style, dots, corner } };
    const expected = normalizeSnapshot(snapshot).payload;
    const svg = renderSvg(snapshot);
    await page.setContent(`<img alt="qr" style="width:700px" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`);
    const image = pngPkg.PNG.sync.read(await page.getByAltText('qr').screenshot());
    expect(jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data, `${dots}/${corner}`).toBe(expected);
  }
});

test('password recovery sends a link to the expected site route', async ({ page }) => {
  let recoveryUrl = '';
  await page.route('**/api/config', route => route.fulfill({ json: { supabase: { url: 'https://mock.supabase.co', anonKey: 'public-example' }, priceDzd: null, salesEnabled: false } }));
  await page.route('https://mock.supabase.co/**', async route => {
    const req = route.request();
    if (req.url().includes('/auth/v1/recover')) recoveryUrl = req.url();
    await route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' }, body: '{}' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Se connecter/ }).first().click();
  await page.getByRole('button', { name: 'Mot de passe oublié ?' }).click();
  await page.getByLabel('Adresse e-mail').fill('demo@example.com');
  await page.getByRole('button', { name: 'Envoyer le lien' }).click();
  await expect(page.getByText(/Si cette adresse possède un compte/)).toBeVisible();
  expect(new URL(recoveryUrl).searchParams.get('redirect_to')).toContain('/reinitialiser-mot-de-passe');
});
