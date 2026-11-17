"""Automatic renewal of the Google session: works silently, never loops, never leaves an open form."""
import asyncio, sys
from playwright.async_api import async_playwright
from google_mock import FakeGoogle
APP = 'http://localhost:4174/'
async def main():
    g = FakeGoogle(APP)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
        for pat in ['https://accounts.google.com/**', 'https://www.googleapis.com/**', 'https://sheets.googleapis.com/**']:
            await ctx.route(pat, g.route)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        out = {}
        await pg.goto(APP); await pg.click('text=Русский'); await pg.click('text=Продолжить в браузере'); await pg.click('text=Пропустить')
        await pg.set_input_files('input[accept="application/json,.json"]', sys.argv[1])
        await pg.wait_for_selector('.fuel-btn')
        await pg.click('button[aria-label="Настройки"]'); await pg.click('button:has-text("Войти через Google")')
        await pg.wait_for_selector('.pill.ok', timeout=15000)
        out['connect'] = list(g.auth_calls)
        # A: session ran out, app is opened again -> silent renewal, no tap
        await pg.evaluate("localStorage.removeItem('tl-google-token')")
        await pg.reload(); await pg.wait_for_selector('.pill.ok', timeout=15000)
        out['A_auto_renew'] = list(g.auth_calls)
        # B: Google wants the user -> "Sign in again", and no second attempt for 10 minutes
        g.silent_mode = 'need_login'
        await pg.evaluate("localStorage.removeItem('tl-google-token'); localStorage.removeItem('tl-auto-auth-at')")
        await pg.reload(); await pg.wait_for_selector('.pill.warn >> text=Войти снова', timeout=15000)
        n = len(g.auth_calls)
        await pg.reload(); await pg.wait_for_selector('.pill.warn', timeout=15000); await pg.wait_for_timeout(1500)
        out['B_no_loop'] = [g.auth_calls[-1], n, len(g.auth_calls)]
        # C: a form is open -> the app does not leave it
        g.silent_mode = 'ok'
        await pg.click('.fuel-btn'); await pg.fill('input.huge', '45999')
        await pg.evaluate("localStorage.removeItem('tl-auto-auth-at'); document.dispatchEvent(new Event('visibilitychange'))")
        await pg.wait_for_timeout(1500)
        out['C_form_kept'] = [len(g.auth_calls) == n + 0 or len(g.auth_calls) == n, await pg.locator('input.huge').input_value()]
        # D: after the form is closed, returning to the app renews
        await pg.click('button[aria-label="Закрыть"]')
        await pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        await pg.wait_for_selector('.pill.ok', timeout=15000)
        out['D_renew_after_form'] = g.auth_calls[-1]
        out['errors'] = errs
        for k, v in out.items(): print(k, ':', v)
        await b.close()
asyncio.run(main())
