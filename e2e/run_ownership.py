"""Full cost of ownership and the buyer's history export, without Google.

Build with VITE_GOOGLE_CLIENT_ID=test, serve dist/ on port 4174, then: python3 e2e/run_ownership.py [out_dir]
Checks: setup screen -> Stats tile with two figures -> detail screen; export screen -> PDF file.
"""
import asyncio, json, os, sys, tempfile
from playwright.async_api import async_playwright

APP = 'http://localhost:4174/'
OUT = sys.argv[1] if len(sys.argv) > 1 else tempfile.gettempdir()

# the example from the task: bought for 7 200 at 10 000 km, 18 400 km since, 3 864 spent
FIXTURE = {
    'app': 'tolimoto-log', 'v': 1,
    'vehicles': [{'id': 'v1', 'name': 'Honda NC750X', 'type': 'moto', 'color': '#FF8A3D', 'currency': '€', 'odometer': 28400}],
    'service': [
        {'id': 's1', 'vehicleId': 'v1', 'date': '2024-04-01', 'odometer': 15000, 'category': 'service', 'description': 'Замена масла и фильтра', 'tags': ['engineoil', 'oilfilter'], 'parts': 800, 'labour': 304, 'notes': 'Motul 7100', 'media': 'https://drive.google.com/file/d/abc123/view'},
        {'id': 's2', 'vehicleId': 'v1', 'date': '2024-06-01', 'odometer': 16200, 'category': 'accessories', 'description': 'Кофры', 'tags': [], 'parts': 368, 'labour': None, 'notes': '', 'media': ''},
        {'id': 's3', 'vehicleId': 'v1', 'date': '2025-05-10', 'odometer': 24000, 'category': 'service', 'description': 'Цепь и звёзды', 'tags': ['chain'], 'parts': 0, 'labour': None, 'notes': '', 'media': ''},
    ],
    'fuel': [{'id': 'f1', 'vehicleId': 'v1', 'date': '2024-05-01', 'odometer': 20000, 'liters': 900, 'total': 1656, 'full': True, 'missed': False, 'station': ''}],
    'expenses': [{'id': 'e1', 'vehicleId': 'v1', 'date': '2025-01-10', 'kind': 'insurance', 'amount': 736, 'note': '', 'media': ''}],
    'schedule': [],
}

def chrome(p):
    if os.path.exists('/usr/bin/google-chrome'):
        return p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    return p.chromium.launch(channel='chrome')

async def main():
    fx = os.path.join(tempfile.mkdtemp(), 'fixture.json')
    json.dump(FIXTURE, open(fx, 'w'), ensure_ascii=False)
    out, errs = {}, []
    async with async_playwright() as p:
        b = await chrome(p)
        ctx = await b.new_context(accept_downloads=True, viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='dark', service_workers='block')
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(APP)
        await pg.click('button:has-text("Русский")'); await pg.click('button:has-text("Продолжить в браузере")'); await pg.click('button:has-text("Пропустить")')
        await pg.check('.ob-ack input'); await pg.click('button:has-text("Продолжить без Google")')
        await pg.set_input_files('input[accept="application/json,.json"]', fx)
        await pg.wait_for_selector('.carousel')
        # 1. Stats tile: only a quiet link while nothing is set
        await pg.click('.nav >> text=Статистика')
        await pg.click('.chip:has-text("Все")')
        out['link_before'] = await pg.inner_text('.quiet-link')
        await pg.click('.quiet-link')
        await pg.fill('.sheet input[type=date]', '2023-03-01')
        await pg.fill('.sheet .field:has-text("Пробег при покупке") input', '10000')
        await pg.fill('.sheet .field:has-text("Цена покупки") input', '7200')
        await pg.fill('.sheet .field:has-text("Сколько стоит сейчас") input', '5400')
        await pg.screenshot(path=f'{OUT}/own-1-setup.png')
        await pg.click('.sheet .btn.primary.big')
        await pg.wait_for_selector('.own-line')
        out['tile'] = (await pg.inner_text('.card.tile >> nth=0')).replace('\n', ' | ')
        await pg.screenshot(path=f'{OUT}/own-2-tile.png')
        # 2. detail screen
        await pg.click('.own-line')
        await pg.wait_for_selector('.own-big')
        out['per_km'] = await pg.inner_text('.own-big b')
        out['per_month'] = await pg.inner_text('.own-month')
        out['legend'] = (await pg.inner_text('.own-legend')).replace('\n', ' | ')
        out['footer'] = await pg.inner_text('.sheet-body p.small.num')
        await pg.screenshot(path=f'{OUT}/own-3-detail.png', full_page=True)
        await pg.keyboard.press('Escape')
        # 3. export: Garage -> vehicle -> Export history (PDF)
        await pg.click('.nav >> text=Гараж')
        await pg.click('.vcard .vname')
        await pg.click('.sheet button:has-text("Экспорт истории (PDF)")')
        await pg.wait_for_selector('text=История для покупателя')
        out['export_summary'] = (await pg.inner_text('.sheet .card.small')).replace('\n', ' | ')
        await pg.screenshot(path=f'{OUT}/own-4-export.png', full_page=True)
        async with pg.expect_download(timeout=20000) as dl:
            await pg.click('.sheet .btn.primary.big')
        d = await dl.value
        pdf_path = f'{OUT}/own-5-history.pdf'
        await d.save_as(pdf_path)
        data = open(pdf_path, 'rb').read()
        out['pdf_name'] = d.suggested_filename
        out['pdf_ok'] = data[:5] == b'%PDF-' and len(data) > 20000
        out['pdf_pages'] = len(__import__('re').findall(rb'/Type /Page[^s]', data))
        out['pdf_font_embedded'] = b'/FontFile2' in data
        out['photos_off_note'] = await pg.locator('.notice.warn:has-text("Фото не загрузились")').count()
        out['save_again'] = await pg.locator('.sheet button:has-text("Сохранить или отправить PDF")').count()
        out['failed_note'] = await pg.locator('.notice.warn[role=alert]').count()
        await pg.screenshot(path=f'{OUT}/own-6-after.png', full_page=True)
        out['errors'] = errs
        for k, v in out.items(): print(k, ':', v)
        await b.close()

asyncio.run(main())
