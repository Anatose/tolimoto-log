import asyncio, json, sys
from playwright.async_api import async_playwright
from google_mock import FakeGoogle
APP = 'http://localhost:4174/'
async def main():
    g = FakeGoogle(APP)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, color_scheme='dark', service_workers='block')
        for pat in ['https://accounts.google.com/**', 'https://www.googleapis.com/**', 'https://sheets.googleapis.com/**']:
            await ctx.route(pat, g.route)
        pg = await ctx.new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        out = {}
        await pg.goto(APP); await pg.click('text=Русский'); await pg.click('text=Продолжить в браузере'); await pg.click('text=Пропустить')
        await pg.set_input_files('input[accept="application/json,.json"]', sys.argv[1] if len(sys.argv) > 1 else 'data/backup.json')
        await pg.wait_for_selector('.fuel-btn')
        # 1. sign in from Settings -> redirect -> back -> connect -> first sync
        await pg.click('button[aria-label="Настройки"]')
        await pg.click('button:has-text("Войти через Google")')
        await pg.wait_for_selector('.pill.ok', timeout=15000)
        out['url_clean'] = pg.url
        book = g.book()
        out['tabs'] = {t: len(v) for t, v in book.items()}
        out['files'] = sorted(f['name'] for f in g.files.values())
        await pg.screenshot(path='/tmp/g1-home.png')
        # 2. hand edits in the sheet
        fuel = book['Fuel']; head = fuel[0]
        last = fuel[-1]; last[head.index('Литры')] = 20
        book['Service log'].append(['2026-11-10', 'Honda NC750X', 45700, 'Ремонт', 'Hand-made row', '#chain', 55, '', '', 'typed in Sheets', '', ''])
        ex = book['Other expenses']; book['Other expenses'] = [ex[0]] + [r for r in ex[1:] if r[2] != 'Техосмотр']
        await pg.click('.pill')
        await pg.wait_for_selector('.pill.ok >> text=Синхронизировано', timeout=15000)
        await pg.wait_for_timeout(300)
        db = await pg.evaluate("""() => new Promise(res => { const r = indexedDB.open('tolimoto-log'); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('tolimoto-log-db'); q.onsuccess = () => res(q.result) } })""")
        lastid = last[head.index('id')]
        out['sheet_edit_taken'] = [f['liters'] for f in db['fuel'] if f['id'] == lastid]
        hand = [s for s in db['service'] if s['description'] == 'Hand-made row']
        out['hand_row'] = [(h['category'], h['tags'], h['parts'], len(h['id']) > 5) for h in hand]
        out['inspection_left'] = [e['kind'] for e in db['expenses'] if e['kind'] == 'inspection']
        out['hand_row_got_id_in_sheet'] = [r[-1] != '' for r in g.book()['Service log'] if r[4] == 'Hand-made row']
        # 3. app edit -> autosync after ~4 s: delete a fill-up
        await pg.click('.nav >> text=Журнал'); await pg.click('.screen .chip:has-text("Заправки")')
        await pg.click('.screen .card.row-btn >> nth=0'); await pg.click('.sheet .btn.danger'); await pg.click('.sheet .btn.danger')
        n_before = len(g.book()['Fuel'])
        await pg.wait_for_timeout(6500)
        out['fuel_rows_sheet'] = [n_before, len(g.book()['Fuel'])]
        # 4. photo in a service record
        await pg.click('.nav >> text=Гараж'); await pg.click('.fab'); await pg.click('.menu >> text=Работа')
        await pg.fill('textarea >> nth=0', 'Чек за колодки')
        await pg.set_input_files('.sheet input[type=file]', {'name': 'receipt.png', 'mimeType': 'image/png', 'buffer': open('public/pwa-512.png','rb').read()})
        await pg.wait_for_selector('.media-row a', timeout=10000)
        out['photo_link'] = await pg.inner_text('.media-row a')
        await pg.screenshot(path='/tmp/g2-photo.png')
        await pg.click('.sheet .btn.primary.big')
        await pg.wait_for_timeout(6000)
        out['uploads'] = g.uploads
        out['media_in_sheet'] = [r[10] for r in g.book()['Service log'] if r[4] == 'Чек за колодки']
        # 5. expired token -> on return to the app the session is renewed by itself (see run_renew.py)
        await pg.evaluate("localStorage.removeItem('tl-google-token')")
        await pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        await pg.wait_for_selector('.pill.ok', timeout=15000)
        out['reauth'] = g.auth_calls[-1] == 'none' and 'silent ok'
        # 6. settings shows account and links
        await pg.click('button[aria-label="Настройки"]')
        out['settings'] = (await pg.inner_text('.sheet-body')).split('Google Таблица и Диск')[1][:260].replace('\n', ' | ')
        await pg.screenshot(path='/tmp/g4-settings.png', full_page=True)
        b2 = g.book()
        out['tabs_order'] = list(b2)
        out['summary_rows'] = len(b2.get('Summary', []))
        out['summary_semicolons'] = any(isinstance(c, str) and c.startswith('=MAX(IFERROR(MAXIFS') and ';' in c for r in b2.get('Summary', []) for c in r)
        out['ru_headers'] = [b2['Service log'][0][0], b2['Fuel'][0][6]]
        out['date_is_number'] = isinstance(b2['Fuel'][1][0], (int, float))
        out['format_requests'] = sorted(set(g.requests))
        out['input_options'] = sorted(set(g.input_options))
        out['errors'] = errs
        for k, v in out.items(): print(k, ':', v)
        await b.close()
asyncio.run(main())
