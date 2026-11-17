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

    def nid(self, p): return f"{p}{next(self.ids)}"

    async def route(self, route):
        req = route.request
        u = urllib.parse.urlparse(req.url)
        q = urllib.parse.parse_qs(u.query)
        self.calls.append(f"{req.method} {u.netloc}{u.path}")
        ok = lambda body: route.fulfill(status=200, content_type='application/json', body=json.dumps(body))
        if u.netloc == 'accounts.google.com':
            frag = urllib.parse.urlencode({'access_token': 'tok-123', 'expires_in': '3599', 'token_type': 'Bearer',
                                           'scope': 'email https://www.googleapis.com/auth/drive.file openid', 'state': q['state'][0]})
            return await route.fulfill(status=302, headers={'Location': q['redirect_uri'][0] + '#' + frag})
        if req.headers.get('authorization') != 'Bearer tok-123':
            return await route.fulfill(status=401, body='{}')
        if u.path == '/oauth2/v3/userinfo':
            return await ok({'email': 'anatose@example.com'})
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
            if rest == '' and req.method == 'GET':
                return await ok({'sheets': [{'properties': {'title': t, 'sheetId': i}} for i, t in enumerate(book)]})
            if rest == ':batchUpdate':
                titles = list(book)
                for r in json.loads(req.post_data)['requests']:
                    if 'addSheet' in r: book[r['addSheet']['properties']['title']] = []
                    if 'updateSheetProperties' in r:
                        p = r['updateSheetProperties']['properties']; old = titles[p['sheetId']]
                        book[p['title']] = book.pop(old)
                return await ok({})
            tab = lambda rng: re.match(r"'?(.+?)'?(!|$)", rng).group(1)
            if rest == '/values:batchGet':
                return await ok({'valueRanges': [{'values': book.get(tab(r), [])} for r in q['ranges']]})
            if rest == '/values:batchClear':
                for r in json.loads(req.post_data)['ranges']: book[tab(r)] = []
                return await ok({})
            if rest == '/values:batchUpdate':
                for d in json.loads(req.post_data)['data']: book[tab(d['range'])] = d['values']
                return await ok({})
        return await route.fulfill(status=404, body='{"error":"not mocked"}')

    def book(self):
        return next(iter(self.sheets.values()))
