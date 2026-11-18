"""System Back (Android button / gesture, browser Back) and the schedule of a car, with Google mocked.

Build with VITE_GOOGLE_CLIENT_ID=test, serve dist/ on port 4174, then: python3 e2e/run_back.py
Back closes the top window, then goes to the previous tab, then the main tab; on the main tab it leaves
the app, except after a Google sign-in, where it stays (the account chooser is behind it in the history).
"""
import asyncio, json, os, sys, tempfile
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from google_mock import FakeGoogle

APP = 'http://localhost:4174/'
MOTO = [('engineoil', 'Масло двигателя', 10000, 365), ('oilfilter', 'Масляный фильтр', 10000, 365), ('forkoil', 'Масло в вилке', 30000, 730),
        ('chain', 'Цепь и звёзды', 25000, None), ('brakefluid', 'Тормозная жидкость', None, 730)]
# made before the fix: a car first saved as a motorcycle still carries the motorcycle list
FIXTURE = {
    'app': 'tolimoto-log', 'v': 1,
    'vehicles': [
        {'id': 'c', 'name': 'Subaru Outback', 'type': 'car', 'color': '#4C9AFF', 'currency': '€', 'odometer': 90000},
        {'id': 'm', 'name': 'Honda NC750X', 'type': 'moto', 'color': '#FF8A3D', 'currency': '€', 'odometer': 30000},
    ],
    'service': [], 'fuel': [], 'expenses': [],
    'schedule': [{'id': f'{v}{i}', 'vehicleId': v, 'name': n, 'tag': t, 'intervalKm': km, 'intervalDays': d, 'hint': ''}
                 for v in ('c', 'm') for i, (t, n, km, d) in enumerate(MOTO)],
}
DB_JS = """() => new Promise(res => { const r = indexedDB.open('tolimoto-log'); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('tolimoto-log-db'); q.onsuccess = () => res(q.result) } })"""

def chrome(p):
    if os.path.exists('/usr/bin/google-chrome'):
        return p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    return p.chromium.launch(channel='chrome')

async def main():
    fx = os.path.join(tempfile.mkdtemp(), 'fixture.json')
    json.dump(FIXTURE, open(fx, 'w'), ensure_ascii=False)
    g = FakeGoogle(APP)
    out, errs = {}, []
    async with async_playwright() as p:
        b = await chrome(p)
        ctx = await b.new_context(viewport={'width': 412, 'height': 900}, is_mobile=True, has_touch=True, service_workers='block',
                                  user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36')
        for pat in ['https://accounts.google.com/**', 'https://www.googleapis.com/**', 'https://sheets.googleapis.com/**']:
            await ctx.route(pat, g.route)
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))

        async def back():
            await pg.evaluate('history.back()')
            await pg.wait_for_timeout(250)

        tab = lambda: pg.inner_text('.nav .tab.on')
        sheets = lambda: pg.locator('.sheet, .menu-backdrop').count()
        await pg.goto('about:blank')
        await pg.goto(APP)
        await pg.click('button:has-text("Русский")'); await pg.click('button:has-text("Продолжить в браузере")'); await pg.click('button:has-text("Пропустить")')
        await pg.check('.ob-ack input'); await pg.click('button:has-text("Продолжить без Google")')
        await pg.set_input_files('input[accept="application/json,.json"]', fx)
        await pg.wait_for_selector('.carousel')
        db = await pg.evaluate(DB_JS)
        out['car_schedule'] = sorted(x['tag'] for x in db['schedule'] if x['vehicleId'] == 'c')
        out['bike_schedule'] = sorted(x['tag'] for x in db['schedule'] if x['vehicleId'] == 'm')
        # 1. tabs: Back goes to the previous tab, then the main one
        await pg.click('.nav >> text=Журнал'); await pg.click('.nav >> text=Регламент'); await pg.click('.nav >> text=Статистика')
        steps = []
        for _ in range(3):
            await back(); steps.append(await tab())
        out['tabs_back'] = steps
        # 2. windows: Back closes only the top one and stays on the tab
        await pg.click('.nav >> text=Регламент')
        out['schedule_screen'] = await pg.locator('.screen b').all_inner_texts()
        await pg.click('.fab'); await pg.click('.menu button:has-text("Работа")')
        out['service_form_open'] = await sheets()
        await back()
        out['after_back_form'] = [await sheets(), await tab()]
        await pg.click('.nav >> text=Гараж')
        await pg.click('.vcard .vname >> nth=0')
        await pg.click('.sheet button:has-text("Экспорт истории (PDF)")')
        out['stacked'] = await pg.locator('.sheet').count()
        await back(); out['after_back_1'] = await pg.locator('.sheet').count()
        await back(); out['after_back_2'] = await pg.locator('.sheet').count()
        out['still_app'] = pg.url.startswith(APP)
        # 3. after a Google sign-in Back on the main tab never reaches Google's page
        await pg.click('.nav >> text=Журнал')
        await back()  # to the main tab
        await pg.click('button[aria-label="Настройки"]')
        await pg.click('button:has-text("Войти через Google")')
        await pg.wait_for_selector('.pill.ok', timeout=15000)
        out['history_after_signin'] = await pg.evaluate('history.length')
        for _ in range(3):
            await back()
        out['after_signin_url_is_app'] = pg.url.startswith(APP)
        out['after_signin_hint'] = await pg.locator('.toast').all_inner_texts()
        out['after_signin_sheets'] = await sheets()
        # 4. a new tab without sign-in: Back on the main tab leaves the app (browser, not installed)
        p2 = await ctx.new_page()
        await p2.goto('about:blank'); await p2.goto(APP)
        await p2.wait_for_selector('.carousel')
        await p2.click('.nav >> text=Журнал')
        await p2.evaluate('history.back()'); await p2.wait_for_timeout(250)
        out['p2_tab_after_back'] = await p2.inner_text('.nav .tab.on')
        await p2.evaluate('history.back()'); await p2.wait_for_timeout(800)
        out['p2_left_app'] = p2.url
        out['errors'] = errs
        for k, v in out.items(): print(k, ':', v)
        await b.close()

asyncio.run(main())
