"""First run in a browser tab: language -> install intro -> tour -> storage choice; backup reminder and data-safety sheet."""
import asyncio, json, sys
from playwright.async_api import async_playwright
APP = 'http://localhost:4174/'
async def main():
    out = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for ua_name, ua in [('iphone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'),
                            ('android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36')]:
            ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='dark', service_workers='block', user_agent=ua)
            pg = await ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(APP); await pg.click('text=Русский')
            await pg.wait_for_selector('text=Установите приложение')
            out[ua_name + '_intro'] = (await pg.locator('.ob-steps').inner_text()).replace('\n', ' | ')[:160]
            await pg.screenshot(path=f'/tmp/ob-{ua_name}-1.png')
            await pg.click('text=Продолжить в браузере')
            await pg.wait_for_selector('text=Заправка в одно касание'); await pg.screenshot(path=f'/tmp/ob-{ua_name}-2.png')
            b_next = 'button:has-text("Дальше")'
            for _ in range(3): await pg.click(b_next)
            await pg.wait_for_selector('text=Где хранить ваши записи?'); await pg.screenshot(path=f'/tmp/ob-{ua_name}-3.png')
            out[ua_name + '_local_disabled'] = await pg.locator('button:has-text("Продолжить без Google")').is_disabled()
            if ua_name == 'iphone':
                await pg.check('.ob-ack input'); await pg.click('text=Продолжить без Google')
                await pg.wait_for_selector('text=Новый транспорт, text=Транспорт', timeout=5000) if False else await pg.wait_for_timeout(500)
                out['after_local'] = (await pg.locator('body').inner_text())[:80].replace('\n', ' | ')
                # restore from the backup via Settings -> data safety later
            else:
                await pg.set_input_files('input[accept="application/json,.json"]', sys.argv[1])
                await pg.wait_for_selector('.fuel-btn')
                out['restored'] = True
                await pg.wait_for_selector('.backup-due', timeout=3000)
                out['reminder'] = (await pg.locator('.backup-due').inner_text()).replace('\n', ' | ')
                await pg.screenshot(path='/tmp/ob-home-reminder.png')
                await pg.click('.backup-due >> text=Позже'); await pg.wait_for_timeout(300)
                out['reminder_after_later'] = await pg.locator('.backup-due').count()
                await pg.click('.pill'); await pg.wait_for_selector('text=Сохранность данных')
                await pg.screenshot(path='/tmp/ob-safety.png')
                out['safety'] = (await pg.locator('.sheet').inner_text())[:200].replace('\n', ' | ')
            out[ua_name + '_errors'] = errs
            await ctx.close()
    for k, v in out.items(): print(k, ':', v)
asyncio.run(main())
