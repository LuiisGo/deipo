import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function login(page:Page,email='founder@example.test') {await page.goto('/admin/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();}
async function confirm(page:Page,name:string){await page.getByRole('button',{name,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirmar',exact:true}).click();}
test('authenticated founder configures, previews and publishes a drop using isolated fixtures',async({page,request})=>{
 await request.get('http://127.0.0.1:54329/reset');await login(page);await expect(page).toHaveURL(/\/admin$/);await page.reload();await expect(page.getByRole('heading',{name:'Overview'})).toBeVisible();
 await page.getByRole('link',{name:'Nuevo drop',exact:true}).click();await page.getByLabel('Número de drop').fill('2');await page.getByLabel('Nombre',{exact:true}).fill('QA Roast');await page.getByLabel('Slug',{exact:true}).fill('qa-roast');await page.getByLabel('Precio (GTQ)',{exact:true}).fill('175');await page.getByLabel('Capacidad',{exact:true}).fill('80');await page.getByRole('button',{name:'Crear borrador'}).click();await expect(page).toHaveURL(/\/admin\/drops\/[a-f0-9-]+$/);const editor=page.url();
 await expect(page.getByRole('button',{name:'Publicar',exact:true})).toBeDisabled();
 const schedule=page.locator('#schedule');await schedule.getByLabel('Apertura',{exact:true}).fill('2030-01-01T00:00');await schedule.getByLabel('Cierre',{exact:true}).fill('2030-01-02T23:59');await schedule.getByLabel('Fecha de entrega',{exact:true}).fill('2030-01-03');await schedule.getByLabel('Label del día').fill('JUEVES');await schedule.getByRole('button',{name:'Guardar',exact:true}).click();await expect(schedule.getByRole('status')).toBeVisible();
 const slots=page.locator('#fulfillment details').filter({hasText:'Agregar horario'});await slots.getByLabel('Inicio',{exact:true}).fill('18:00');await slots.getByLabel('Fin',{exact:true}).fill('19:00');await slots.getByRole('button',{name:'Guardar',exact:true}).click();await expect(slots.getByRole('status')).toBeVisible();
 const item=page.locator('#content details').filter({hasText:'Agregar alimento incluido'});await item.getByLabel('Nombre',{exact:true}).fill('Roast beef');await item.getByLabel('Descripción',{exact:true}).fill('Included meal');await item.getByRole('button',{name:'Guardar',exact:true}).click();await expect(item.getByRole('status')).toBeVisible();
 const zone=page.locator('#fulfillment details').filter({hasText:'Agregar zona'});await zone.getByLabel('Código',{exact:true}).fill('zone-10');await zone.getByLabel('Nombre de zona').fill('Zona 10');await zone.getByLabel('Tarifa GTQ').fill('0');await zone.getByRole('button',{name:'Guardar',exact:true}).click();await expect(zone.getByRole('status')).toBeVisible();
 const media=page.locator('#packaging form').first();await media.getByLabel('Archivo').setInputFiles({name:'hero.webp',mimeType:'image/webp',buffer:Buffer.from('isolated fixture')});await media.getByLabel('Texto alternativo').fill('QA hero');await media.getByRole('button',{name:'Subir asset'}).click();await expect(media.getByRole('status')).toHaveText('Asset guardado.');
 await media.getByRole('combobox').selectOption('packaging_frame');await media.getByLabel('Archivo').setInputFiles({name:'frame.webp',mimeType:'image/webp',buffer:Buffer.from('isolated packaging')});await media.getByLabel('Texto alternativo').fill('Packaging frame');await media.getByLabel('Label',{exact:true}).fill('LA CAJA');await media.getByRole('button',{name:'Subir asset'}).click();await expect(media.getByRole('status')).toHaveText('Asset guardado.');
 const sale=page.locator('#sales form').first();for(const [qty,source]of [['8','Friends and Family'],['3','Chef Network'],['2','Direct']]){await sale.getByLabel('Cantidad',{exact:true}).fill(qty);await sale.getByLabel('Fuente',{exact:true}).fill(source);await sale.getByRole('button',{name:'Registrar venta confirmada'}).click();await expect(sale.getByRole('button')).toBeEnabled();await expect(sale.getByRole('status')).toBeVisible();}
 await expect(page.locator('#inventory')).toContainText('13 / 80 SOLD · 67 disponibles');
 await page.getByRole('link',{name:'Preview autenticado'}).click();await expect(page.getByText('PREVIEW AUTENTICADO · PEDIDOS ONLINE NO HABILITADOS')).toBeVisible();await expect(page.locator('body')).toContainText('QA Roast');await page.goto(editor);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();const a11y=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(a11y.violations).toEqual([]);
 await confirm(page,'Publicar');await expect(page.locator('.admin-title')).toContainText('published');await confirm(page,'Asignar NEXT');await expect(page.locator('#publishing')).toContainText('NEXT: Este drop');
 await confirm(page,'Quitar NEXT');await confirm(page,'Asignar CURRENT');await page.goto('/?mode=preview&state=sold_out&stock=drift');await expect(page.locator('body')).toContainText('QA Roast');await expect(page.getByText('STOCK DE PRUEBA')).toHaveCount(0);await expect(page.getByText('SIMULACIÓN INTERNA DE STOCK',{exact:false})).toHaveCount(0);await page.goto('/checkout?mode=preview');await expect(page.getByRole('heading',{name:'Sin reserva activa.'})).toBeVisible();
 await page.goto(editor);const direct=page.locator('#sales li').filter({hasText:'Direct'});await direct.getByLabel('Motivo de anulación').fill('QA correction');await direct.getByRole('button',{name:'Anular venta'}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirmar',exact:true}).click();await expect(page.locator('#inventory')).toContainText('11 / 80 SOLD · 69 disponibles');
 await page.getByRole('button',{name:'Cerrar sesión'}).click();await expect(page).toHaveURL(/\/admin\/login/);await page.goto(editor);await expect(page).toHaveURL(/\/admin\/login/);
});
test('authenticated non-admin is denied and production has no demo fallback',async({page,request})=>{await request.get('http://127.0.0.1:54329/reset');await login(page,'reader@example.test');await expect(page.locator('.admin-message[role=alert]')).toContainText('no tiene acceso');await page.goto('/admin');await expect(page).toHaveURL(/\/admin\/login/);await page.goto('/?state=active&mode=preview');await expect(page.getByText('Los pedidos online todavía no están habilitados.')).toBeVisible();await expect(page.getByText('013 / 080')).toHaveCount(0);});

test('public backend failure stays unavailable with no synthetic inventory',async({page,request})=>{await request.get('http://127.0.0.1:54329/fail-public');await page.goto('/?mode=preview&state=low_stock');await expect(page.getByText('TEMPORALMENTE NO DISPONIBLE')).toBeVisible();await expect(page.getByText('013 / 080')).toHaveCount(0);await request.get('http://127.0.0.1:54329/reset');});

test('an already authenticated admin loses access when their profile is deactivated', async ({page, request}) => {
 await request.get('http://127.0.0.1:54329/reset'); await login(page); await expect(page).toHaveURL(/\/admin$/);
 await request.get('http://127.0.0.1:54329/deactivate');
 for (const route of ['/admin', '/admin/drops', '/admin/drops/new', '/admin/drops/00000000-0000-4000-8000-000000000003/preview']) {
   await page.goto(route); await expect(page).toHaveURL(/\/admin\/login\?error=denied/);
   await expect(page.getByRole('heading', {name:'Overview'})).toHaveCount(0);
 }
 await request.get('http://127.0.0.1:54329/reset');
});

for (const refreshable of [true, false]) test(`expired access token ${refreshable ? 'refreshes' : 'with revoked refresh token returns to login'}`, async ({page, request, context}) => {
 await request.get('http://127.0.0.1:54329/reset');
 const tokenResponse = await request.post('http://127.0.0.1:54329/auth/v1/token', {data:{email:'founder@example.test',password:'fixture-password'}});
 const session = await tokenResponse.json();
 const parts = session.access_token.split('.');
 const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); claims.exp = Math.floor(Date.now()/1000)-300;
 parts[1] = Buffer.from(JSON.stringify(claims)).toString('base64url'); session.access_token = parts.join('.'); session.expires_at = claims.exp;
 if (!refreshable) session.refresh_token = 'expired';
 await context.addCookies([{name:'sb-127-auth-token', value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'), domain:'127.0.0.1',path:'/',sameSite:'Lax'}]);
 const response = await page.goto('/admin');
 expect(response?.headers()['cache-control']).toContain('no-store');
 if (refreshable) {
   await expect(page.getByRole('heading',{name:'Overview'})).toBeVisible();
   const cookies = await context.cookies(); expect(cookies.some(c=>c.name.startsWith('sb-127-auth-token'))).toBeTruthy();
   await page.reload(); await expect(page.getByRole('heading',{name:'Overview'})).toBeVisible();
 } else {
   await expect(page).toHaveURL(/\/admin\/login/);
   expect((await context.cookies()).filter(c=>c.name.startsWith('sb-127-auth-token') && c.value)).toHaveLength(0);
   await page.goto('/admin/drops'); await expect(page).toHaveURL(/\/admin\/login/);
 }
});

test('production proxy refresh emits Secure host-only cookies and private cache headers', async ({request}) => {
 await request.get('http://127.0.0.1:54329/reset');
 const tokenResponse = await request.post('http://127.0.0.1:54329/auth/v1/token', {data:{email:'founder@example.test',password:'fixture-password'}});
 const session = await tokenResponse.json();
 const parts = session.access_token.split('.'); const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
 claims.exp = Math.floor(Date.now()/1000)-300; parts[1] = Buffer.from(JSON.stringify(claims)).toString('base64url');
 session.access_token = parts.join('.'); session.expires_at = claims.exp;
 const response = await request.get('/admin', {headers:{host:'deploy-preview-12--deipo.netlify.app','x-forwarded-proto':'https',cookie:'sb-127-auth-token=base64-'+Buffer.from(JSON.stringify(session)).toString('base64url')},maxRedirects:0});
 expect(response.status()).toBe(200);
 const cookies = response.headersArray().filter(h=>h.name.toLowerCase()==='set-cookie'); expect(cookies.length).toBeGreaterThan(0);
 for (const cookie of cookies) { expect(cookie.value).toMatch(/; secure/i); expect(cookie.value).toMatch(/samesite=lax/i); expect(cookie.value).not.toMatch(/; domain=/i); }
 expect(response.headers()['cache-control']).toContain('no-store'); expect(response.headers()['pragma']).toBe('no-cache'); expect(response.headers()['expires']).toBe('0');
});
