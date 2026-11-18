"""Archive, restore and delete a vehicle with Google sync (Google is replaced by google_mock.py).

Build with VITE_GOOGLE_CLIENT_ID=test, serve dist/ on port 4174, then: python3 e2e/run_archive.py
"""
import asyncio, json, os, sys, tempfile
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from google_mock import FakeGoogle

APP = 'http://localhost:4174/'
FIXTURE = {
    'app': 'tolimoto-log', 'v': 1,
    'vehicles': [
        {'id': 'va', 'name': 'Old Bike', 'type': 'moto', 'color': '#FF8A3D', 'currency': '€', 'odometer': 30000},
        {'id': 'vb', 'name': 'Family Car', 'type': 'car', 'color': '#4C9AFF', 'currency': '€', 'odometer': 120000},
    ],
    'service': [
        {'id': 'sa', 'vehicleId': 'va', 'date': '2025-05-01', 'odometer': 29000, 'category': 'service', 'description': 'Oil A', 'tags': ['engineoil'], 'parts': 50, 'labour': None, 'notes': '', 'media': ''},
        {'id': 'sb', 'vehicleId': 'vb', 'date': '2025-06-01', 'odometer': 119000, 'category': 'service', 'description': 'Oil B', 'tags': ['engineoil'], 'parts': 90, 'labour': None, 'notes': '', 'media': ''},
    ],
    'fuel': [{'id': 'fa', 'vehicleId': 'va', 'date': '2025-05-02', 'odometer': 29100, 'liters': 10, 'total': 17, 'full': True, 'missed': False, 'station': ''}],
    'expenses': [], 'schedule': [],
}
DB_JS = """() => new Promise(res => { const r = indexedDB.open('tolimoto-log'); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get(KEY); q.onsuccess = () => res(q.result) } })"""

def chrome(p):
    if os.path.exists('/usr/bin/google-chrome'):
        return p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    return p.chromium.launch(channel='chrome')

async def main():
    fx = os.path.join(tempfile.mkdtemp(), 'fixture.json')
    json.dump(FIXTURE, open(fx, 'w'))
    g = FakeGoogle(APP)
    out, errs = {}, []
    async with async_playwright() as p:
        b = await chrome(p)
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, color_scheme='dark', service_workers='block')
        for pat in ['https://accounts.google.com/**', 'https://www.googleapis.com/**', 'https://sheets.googleapis.com/**']:
            await ctx.route(pat, g.route)
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        kv = lambda key: pg.evaluate(DB_JS.replace('KEY', json.dumps(key)))
        garage = lambda: g.book()['Garage']
        await pg.goto(APP)
        await pg.click('text=Русский'); await pg.click('text=Продолжить в браузере'); await pg.click('text=Пропустить')
        await pg.set_input_files('input[accept="application/json,.json"]', fx)
        await pg.wait_for_selector('.fuel-btn')
        await pg.click('button[aria-label="Настройки"]')
        await pg.click('button:has-text("Войти через Google")')
        await pg.wait_for_selector('.pill.ok', timeout=15000)
        out['garage_head'] = garage()[0]
        # 1. archive the active vehicle from its screen
        await pg.click('.vcard .vname >> nth=0')
        await pg.click('.sheet button:has-text("В архив")')
        await pg.wait_for_selector('text=Архив (1) ›')
        out['carousel_after_archive'] = await pg.locator('.carousel .vcard:not(.add)').count()
        out['active_after_archive'] = await pg.inner_text('.fuel-btn')
        await pg.wait_for_timeout(6500)
        row = next(r for r in garage()[1:] if r[0] == 'Old Bike')
        out['sheet_archived_cell'] = row[garage()[0].index('В архиве с')]
        # 2. the archive: open, back to the garage, archive again
        await pg.click('text=Архив (1) ›')
        out['archive_card'] = (await pg.inner_text('.arch-card')).replace('\n', ' | ')
        await pg.click('.arch-card button:has-text("Открыть")')
        out['view_journal'] = await pg.locator('.sheet .phone-only .card').count()
        await pg.keyboard.press('Escape')
        await pg.click('.arch-card button:has-text("Вернуть в гараж")')
        await pg.keyboard.press('Escape')
        out['carousel_after_restore'] = await pg.locator('.carousel .vcard:not(.add)').count()
        # fill-up form offers only vehicles in the garage
        await pg.click('.vcard .vname >> nth=0')
        await pg.click('.sheet button:has-text("В архив")')
        await pg.click('.fuel-btn')
        out['fuel_vehicle_chips'] = await pg.locator('.sheet .vchips .chip').count()
        await pg.keyboard.press('Escape')
        # 3. delete the archived vehicle: two steps, then the sync removes it from the sheet
        await pg.click('text=Архив (1) ›')
        await pg.click('.arch-card button:has-text("Удалить")')
        out['delete_warning'] = await pg.inner_text('.sheet .notice.warn')
        out['backup_button'] = await pg.locator('.sheet button:has-text("Сохранить копию JSON")').count()
        await pg.click('.sheet button:has-text("Продолжить")')
        final = pg.locator('.sheet button:has-text("Удалить навсегда")')
        out['final_disabled_before_name'] = await final.is_disabled()
        await pg.fill('.sheet input', 'old bike')
        await final.click()
        await pg.wait_for_selector('.fuel-btn')
        out['archive_link_gone'] = await pg.locator('text=Архив (1) ›').count() == 0
        await pg.wait_for_timeout(500)
        out['deleted_list_after_delete'] = await kv('deleted-vehicles')
        await pg.wait_for_timeout(6500)
        out['sheet_vehicles_after_delete'] = [r[0] for r in garage()[1:]]
        out['sheet_service_after_delete'] = [r[4] for r in g.book()['Service log'][1:]]
        out['sheet_fuel_after_delete'] = len(g.book()['Fuel']) - 1
        out['deleted_list_after_sync'] = await kv('deleted-vehicles')
        # sync again: nothing comes back
        await pg.click('.pill'); await pg.wait_for_selector('.pill.ok >> text=Синхронизировано', timeout=15000)
        db = await kv('tolimoto-log-db')
        out['app_vehicles_after_resync'] = [v['name'] for v in db['vehicles']]
        # 4. an old sheet without the new columns: read as before, the columns come back on the next write
        book = g.book()
        head = book['Garage'][0]
        keep = [0, 1, 2, 3, 4, len(head) - 1]
        book['Garage'] = [[r[i] if i < len(r) else '' for i in keep] for r in book['Garage']]
        book['Garage'][1][3] = 123456
        await pg.click('.pill'); await pg.wait_for_selector('.pill.ok >> text=Синхронизировано', timeout=15000)
        db = await kv('tolimoto-log-db')
        out['old_sheet_read'] = [(v['name'], v['odometer'], v['archived'], v['ownership']) for v in db['vehicles']]
        out['old_sheet_rewritten_head'] = g.book()['Garage'][0][5:9]
        # 5. every vehicle archived: the empty garage, with the archive on the first screen
        await pg.click('.vcard .vname >> nth=0')
        await pg.click('.sheet button:has-text("В архив")')
        await pg.wait_for_selector('text=Добавьте первый транспорт')
        out['empty_garage_archive_link'] = await pg.locator('text=Архив (1) ›').count()
        out['errors'] = errs
        for k, v in out.items(): print(k, ':', v)
        await b.close()

asyncio.run(main())
