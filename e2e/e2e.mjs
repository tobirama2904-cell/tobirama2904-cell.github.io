// LEGION E2E: two real users (admin + user) through public relays.
import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:8905';
const results = [];
const ok = (n, c) => { results.push([c ? 'PASS' : 'FAIL', n]); console.log((c ? 'PASS ' : 'FAIL ') + n); };
const errors = [];
function watch(page, tag) {
  page.on('pageerror', e => errors.push(`[${tag}] PAGEERROR: ${String(e).slice(0, 200)}`));
  page.on('console', m => { if (m.type() === 'error' && !/WebSocket|wss:|net::|favicon/i.test(m.text())) errors.push(`[${tag}] CONSOLE: ${m.text().slice(0, 200)}`); });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TAG = 'e2e' + Date.now().toString(36);

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
async function newUser(name, email, pass) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  watch(page, email);
  await page.goto(BASE + '/register', { timeout: 30000 });
  await page.getByPlaceholder('Имя / ник').fill(name);
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Пароль (мин. 6)').fill(pass);
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await page.getByRole('button', { name: 'Сохранил — войти →' }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Сохранил — войти →' }).click();
  await page.waitForFunction(() => location.pathname.includes('/chat'), { timeout: 30000 });
  try { const sk = page.getByRole('button', { name: 'Пропустить' }); if (await sk.isVisible({ timeout: 5000 })) await sk.click(); } catch {}
  const pub = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('legion-id-v1') || '{}').id || ''; } catch { return ''; } });
  return { ctx, page, pub, name, email };
}

try {
  // B first (plain user), then A (admin)
  const B = await newUser('E2E_Борис', `boris-${TAG}@test.com`, 'boris-pass-123');
  ok('register-user-B', !!B.pub);
  const A = await newUser('E2E_Админ', 'tobirama2904@gmail.com', 'e2e-admin-' + TAG);
  ok('register-admin-A', !!A.pub);

  // 1. admin link visible
  try {
    const st = await A.page.evaluate(() => ({ ls: Object.keys(localStorage), path: location.pathname, adminLinks: document.querySelectorAll('a[href="/admin"]').length, body: (document.body.innerText || '').slice(0, 300) }));
    console.log('INFO A-state:', JSON.stringify(st).slice(0, 500));
    await A.page.getByRole('link', { name: 'Админка' }).first().waitFor({ timeout: 30000 });
    ok('admin-link-visible', true);
  } catch { ok('admin-link-visible', false); }

  // 2. admin page
  await A.page.goto(BASE + '/admin');
  try {
    await A.page.getByText('tobirama2904@gmail.com').first().waitFor({ timeout: 30000 });
    ok('admin-page-email', true);
  } catch { ok('admin-page-email', false); }
  const auditTab = await A.page.getByText(/DM-аудит/).count();
  ok('admin-audit-tab', auditTab > 0);

  // 3. B publishes post with hashtag
  const POST_TXT = `Всем привет ${TAG} #${TAG} проверка связи`;
  await B.page.goto(BASE + '/feed');
  await B.page.getByPlaceholder(/Что нового/).first().waitFor({ timeout: 60000 });
  await B.page.getByPlaceholder(/Что нового/).first().fill(POST_TXT);
  const pubBtn = B.page.locator('button', { hasText: /^Опубликовать$/ }).first();
  await pubBtn.waitFor({ state: 'visible', timeout: 30000 });
  await pubBtn.evaluate(e => e.scrollIntoView({ block: 'center' }));
  await B.page.waitForTimeout(800);
  console.log('INFO pubBtn disabled=', await pubBtn.isDisabled(), 'count=', await B.page.locator('button', { hasText: /^Опубликовать$/ }).count());
  if (await pubBtn.isDisabled()) { await B.page.getByPlaceholder(/Что нового/).first().press('x'); await B.page.waitForTimeout(500); }
  await pubBtn.click({ timeout: 15000 });
  try {
    await B.page.getByText(POST_TXT.slice(0, 30), { exact: false }).first().waitFor({ timeout: 90000 });
    ok('post-publish', true);
  } catch { ok('post-publish', false); }

  // 4. A sees B's post in feed
  await A.page.goto(BASE + '/feed');
  try {
    await A.page.getByText(POST_TXT.slice(0, 30), { exact: false }).first().waitFor({ timeout: 90000 });
    ok('feed-cross-user', true);
  } catch { ok('feed-cross-user', false); }

  // 5. hashtag search
  try {
    await A.page.getByRole('button', { name: '#' + TAG }).first().click({ timeout: 15000 });
    await A.page.getByText(POST_TXT.slice(0, 20), { exact: false }).nth(1).waitFor({ timeout: 60000 });
    ok('hashtag-search', true);
  } catch { ok('hashtag-search', false); }

  // 6. A creates poll in feed
  const POLL_Q = 'Любимый цвет ' + TAG + '?';
  await A.page.goto(BASE + '/feed');
  await A.page.getByPlaceholder(/Что нового/).first().waitFor({ timeout: 60000 });
  await A.page.getByRole('button', { name: 'Опрос' }).click();
  await A.page.getByPlaceholder('Вопрос…').fill(POLL_Q);
  await A.page.getByPlaceholder('Вариант 1').fill('Синий');
  await A.page.getByPlaceholder('Вариант 2').fill('Красный');
  await A.page.getByRole('button', { name: 'Опубликовать опрос' }).click();
  try {
    await A.page.getByText(POLL_Q, { exact: false }).first().waitFor({ timeout: 90000 });
    ok('feed-poll-publish', true);
  } catch { ok('feed-poll-publish', false); }

  // 7. B votes the poll
  await B.page.goto(BASE + '/feed');
  try {
    await B.page.getByText(POLL_Q, { exact: false }).first().waitFor({ timeout: 90000 });
    await B.page.getByRole('button', { name: /Синий/ }).first().click({ timeout: 15000 });
    await B.page.getByText('голосов: 1').first().waitFor({ timeout: 90000 });
    ok('poll-vote', true);
  } catch { ok('poll-vote', false); }

  // 8. users directory: A sees B
  await A.page.goto(BASE + '/users');
  try {
    await A.page.getByText('E2E_Борис').first().waitFor({ timeout: 90000 });
    ok('directory-sees-B', true);
  } catch { ok('directory-sees-B', false); }

  // 9. DM A->B (real relay roundtrip)
  const DM1 = 'Привет Борис ' + TAG;
  await A.page.goto(BASE + '/messages?dm=' + B.pub);
  await A.page.getByPlaceholder('Сообщение…').waitFor({ timeout: 60000 });
  await A.page.getByPlaceholder('Сообщение…').fill(DM1);
  await A.page.keyboard.press('Enter');
  await sleep(2000);
  await B.page.goto(BASE + '/messages?dm=' + A.pub);
  try {
    await B.page.getByText(DM1).first().waitFor({ timeout: 120000 });
    ok('dm-A-to-B', true);
  } catch { ok('dm-A-to-B', false); }

  // 10. DM B->A reply
  const DM2 = 'Привет Админ ' + TAG;
  try {
    await B.page.getByPlaceholder('Сообщение…').fill(DM2);
    await B.page.keyboard.press('Enter');
    await A.page.getByText(DM2).first().waitFor({ timeout: 120000 });
    ok('dm-B-to-A', true);
  } catch { ok('dm-B-to-A', false); }

  // 11. admin ghost audit sees the convo
  await A.page.goto(BASE + '/admin');
  try {
    await A.page.getByText(/DM-аудит/).first().click({ timeout: 15000 });
    await A.page.getByText(DM1.slice(0, 20), { exact: false }).first().waitFor({ timeout: 120000 });
    ok('ghost-audit', true);
  } catch {
    // maybe need to open the convo first
    try {
      const convos = A.page.getByRole('button', { name: /↔/ });
      if (await convos.count() > 0) {
        await convos.first().click();
        await A.page.getByText(DM1.slice(0, 20), { exact: false }).first().waitFor({ timeout: 60000 });
        ok('ghost-audit', true);
      } else ok('ghost-audit', false);
    } catch { ok('ghost-audit', false); }
  }

  // 12. profile + edit status
  await A.page.goto(BASE + '/profile?id=' + A.pub);
  try {
    await A.page.getByText('E2E_Админ').first().waitFor({ timeout: 60000 });
    ok('profile-view', true);
  } catch { ok('profile-view', false); }
  try {
    await A.page.getByRole('button', { name: 'Изменить' }).click({ timeout: 15000 });
    const st = 'Статус ' + TAG;
    await A.page.getByPlaceholder('').first().waitFor({ timeout: 5000 }).catch(() => {});
    const inputs = A.page.locator('label input');
    await inputs.nth(1).fill(st);
    await A.page.getByRole('button', { name: 'Сохранить' }).click();
    await A.page.getByText(st).first().waitFor({ timeout: 60000 });
    ok('profile-edit', true);
  } catch { ok('profile-edit', false); }

  // 13. copilot FAB opens panel
  try {
    await A.page.getByTitle('Copilot-помощник').click({ timeout: 15000 });
    await A.page.getByText('знает страницу').first().waitFor({ timeout: 15000 });
    ok('copilot-fab', true);
  } catch { ok('copilot-fab', false); }

  // 14. create text post via /create
  const CTXT = 'Пост из Создать ' + TAG;
  await A.page.goto(BASE + '/create');
  try {
    await A.page.getByText('Текст', { exact: true }).first().click({ timeout: 15000 });
    await A.page.getByPlaceholder('Подпись…').fill(CTXT);
    await A.page.getByRole('button', { name: /Опубликовать/ }).click();
    await A.page.waitForFunction(() => location.pathname.includes('/feed'), { timeout: 90000 });
    ok('create-text-post', true);
  } catch { ok('create-text-post', false); }

  // 15. clips + voice pages load
  await A.page.goto(BASE + '/clips');
  try { await A.page.getByText('Клипы').first().waitFor({ timeout: 30000 }); ok('clips-load', true); } catch { ok('clips-load', false); }
  await A.page.goto(BASE + '/voice');
  try { await A.page.getByText('Голосовые комнаты').first().waitFor({ timeout: 30000 }); ok('voice-rooms-ui', true); } catch { ok('voice-rooms-ui', false); }

  // 16. voice room create + join (soft: join asserts, peer-sees-peer logs only)
  try {
    await A.page.getByPlaceholder('Название эфира…').fill('E2E эфир ' + TAG);
    await A.page.getByRole('button', { name: 'В эфир' }).click();
    await A.page.getByRole('button', { name: 'Выйти' }).waitFor({ timeout: 90000 });
    ok('voice-room-create-join', true);
  } catch { ok('voice-room-create-join', false); }
  try {
    await B.page.goto(BASE + '/voice');
    await B.page.getByText('E2E эфир ' + TAG).first().waitFor({ timeout: 120000 });
    const row = B.page.locator('div', { hasText: 'E2E эфир ' + TAG }).last();
    await B.page.getByRole('button', { name: 'Слушать' }).first().click({ timeout: 15000 });
    await B.page.getByRole('button', { name: 'Выйти' }).waitFor({ timeout: 90000 });
    ok('voice-room-B-join', true);
    await sleep(15000);
    const seesPeer = await A.page.getByText('E2E_Борис').count();
    console.log('INFO peer-visible-on-A:', seesPeer > 0);
  } catch { ok('voice-room-B-join', false); }

  await B.ctx.close();
  await A.ctx.close();
} catch (e) {
  console.log('E2E-CRASH:', String(e).slice(0, 300));
}
await browser.close();
const pass = results.filter(r => r[0] === 'PASS').length;
console.log(`RESULT pass=${pass} fail=${results.length - pass}`);
console.log('--- js errors (' + errors.length + ') ---');
[...new Set(errors)].slice(0, 20).forEach(e => console.log(e));
process.exit(pass === results.length ? 0 : 1);
