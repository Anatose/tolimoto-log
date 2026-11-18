"""In-memory stand-in for the Google endpoints the app calls: sign-in redirect, Drive, Sheets."""
import json, re, urllib.parse, itertools

class FakeGoogle:
    def __init__(self, app_url):
        self.app_url = app_url
        self.files = {}          # id -> {name, mimeType, parents, appProperties}
        self.sheets = {}         # spreadsheet id -> {title: [[...]]}
        self.ids = itertools.count(1)
        self.calls = []
        self.uploads = []
        self.auth_calls = []
        self.sheet_ids = {}
        self.requests = []
        self.locale = 'ru_RU'
        self.input_options = []
        self.silent_mode = 'ok'
        self.media = {}          # file id -> (content type, bytes), served by alt=media

    def nid(self, p): return f"{p}{next(self.ids)}"

    async def route(self, route):
        req = route.request
        u = urllib.parse.urlparse(req.url)
        q = urllib.parse.parse_qs(u.query)
        self.calls.append(f"{req.method} {u.netloc}{u.path}")
        ok = lambda body: route.fulfill(status=200, content_type='application/json', body=json.dumps(body))
        if u.netloc == 'accounts.google.com':
            self.auth_calls.append(q.get('prompt', [''])[0])
            if q.get('prompt', [''])[0] == 'none' and self.silent_mode == 'need_login':
                frag = urllib.parse.urlencode({'error': 'interaction_required', 'state': q['state'][0]})
                return await route.fulfill(status=302, headers={'Location': q['redirect_uri'][0] + '#' + frag})
            frag = urllib.parse.urlencode({'access_token': 'tok-123', 'expires_in': '3599', 'token_type': 'Bearer',
                                           'scope': 'email https://www.googleapis.com/auth/drive.file openid', 'state': q['state'][0]})
            return await route.fulfill(status=302, headers={'Location': q['redirect_uri'][0] + '#' + frag})
        if req.headers.get('authorization') != 'Bearer tok-123':
            return await route.fulfill(status=401, body='{}')
        if u.path == '/oauth2/v3/userinfo':
            return await ok({'email': 'anatose@example.com'})
        md = re.match(r'/drive/v3/files/([^/]+)$', u.path)
        if md and q.get('alt') == ['media']:
            if md.group(1) not in self.media: return await route.fulfill(status=404, body='{}')
            ctype, data = self.media[md.group(1)]
            return await route.fulfill(status=200, content_type=ctype, body=data)
        if u.netloc == 'www.googleapis.com' and u.path == '/drive/v3/files' and req.method == 'GET':
            qq = q['q'][0]
            role = re.search(r"value='(\w+)'", qq).group(1)
            parent = re.search(r"'([^']+)' in parents", qq)
            res = [dict(id=k, name=f['name'], webViewLink=f'https://drive.google.com/x/{k}') for k, f in self.files.items()
                   if f['appProperties'].get('tolimotoLog') == role and (not parent or parent.group(1) in f['parents'])]
            return await ok({'files': res})
        if u.path == '/drive/v3/files' and req.method == 'POST':
            b = json.loads(req.post_data)
            k = self.nid('file')
            self.files[k] = dict(name=b['name'], mimeType=b['mimeType'], parents=b.get('parents') or [], appProperties=b.get('appProperties', {}))
            if b['mimeType'].endswith('spreadsheet'): self.sheets[k] = {'Sheet1': []}
            return await ok({'id': k, 'name': b['name'], 'webViewLink': f'https://docs.google.com/{k}'})
        if u.path == '/upload/drive/v3/files':
            body = req.post_data_buffer
            meta = json.loads(re.search(rb'\r\n\r\n(\{.*?\})\r\n', body).group(1))
            k = self.nid('photo')
            self.files[k] = dict(name=meta['name'], mimeType='image', parents=meta['parents'], appProperties=meta['appProperties'])
            self.uploads.append((meta['name'], len(body)))
            return await ok({'id': k, 'webViewLink': f'https://drive.google.com/file/d/{k}/view'})
        m = re.match(r'/v4/spreadsheets/([^/:]+)(.*)', u.path)
        if u.netloc == 'sheets.googleapis.com' and m:
            sid, rest = m.group(1), m.group(2)
            book = self.sheets[sid]
            ids = self.sheet_ids.setdefault(sid, {})
            for t in book:
                if t not in ids: ids[t] = next(self.ids)
            if rest == '' and req.method == 'GET':
                return await ok({'properties': {'locale': self.locale}, 'sheets': [{'properties': {'title': t, 'sheetId': ids[t]}} for t in book]})
            if rest == ':batchUpdate':
                replies = []
                for r in json.loads(req.post_data)['requests']:
                    self.requests.append(next(iter(r)))
                    rep = {}
                    if 'addSheet' in r:
                        t = r['addSheet']['properties']['title']; book[t] = []; ids[t] = next(self.ids)
                        rep = {'addSheet': {'properties': {'title': t, 'sheetId': ids[t]}}}
                    if 'deleteSheet' in r:
                        t = next(k for k, v in ids.items() if v == r['deleteSheet']['sheetId']); book.pop(t); ids.pop(t)
                    if 'updateSheetProperties' in r and 'title' in r['updateSheetProperties']['properties']:
                        p = r['updateSheetProperties']['properties']; old = next(k for k, v in ids.items() if v == p['sheetId'])
                        book[p['title']] = book.pop(old); ids[p['title']] = ids.pop(old)
                    replies.append(rep)
                return await ok({'replies': replies})
            tab = lambda rng: re.match(r"'?(.+?)'?(!|$)", rng).group(1)
            if rest == '/values:batchGet':
                out = []
                for r in q['ranges']:
                    vals = book.get(tab(r), [])
                    if r.endswith('!Z1'):
                        z = vals[0][25] if vals and len(vals[0]) > 25 else None
                        vals = [[z]] if z else []
                    out.append({'values': vals})
                return await ok({'valueRanges': out})
            if rest == '/values:batchClear':
                for r in json.loads(req.post_data)['ranges']: book[tab(r)] = []
                return await ok({})
            if rest == '/values:batchUpdate':
                b = json.loads(req.post_data)
                for d in b['data']:
                    t = tab(d['range']); cell = re.search(r"!([A-Z]+)1$", d['range'])
                    if cell and cell.group(1) != 'A':
                        rows = book.setdefault(t, [])
                        while not rows: rows.append([])
                        col = ord(cell.group(1)) - 65
                        rows[0] = (rows[0] + [''] * 30)[:col] + [d['values'][0][0]]
                    else:
                        book[t] = d['values']
                self.input_options.append(b['valueInputOption'])
                return await ok({})
        return await route.fulfill(status=404, body='{"error":"not mocked"}')

    def book(self):
        return next(iter(self.sheets.values()))
