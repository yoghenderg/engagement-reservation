from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from datetime import datetime
import json, sqlite3, re, os
ROOT = Path(__file__).resolve().parent
DB = ROOT / 'data' / 'reservations.sqlite3'
def config():
    return json.loads((ROOT/'config.json').read_text())
def closed(c):
    return datetime.now().astimezone() >= datetime.fromisoformat(c['closesAt'])
def init_db():
    with sqlite3.connect(DB) as db:
        db.execute('CREATE TABLE IF NOT EXISTS reservations (id INTEGER PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, full_name TEXT NOT NULL, phone TEXT NOT NULL, attending TEXT NOT NULL, guests TEXT, meal TEXT, created_at TEXT NOT NULL)')
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT/'dist'),**kwargs)
    def send_json(self,status,data):
        body=json.dumps(data).encode(); self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Cache-Control','no-store'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if self.path == '/api/config':
            c=config(); c['closed']=closed(c); return self.send_json(200,c)
        if self.path.split('?')[0] in ('/reserve','/thank-you'): self.path='/index.html'
        super().do_GET()
    def do_POST(self):
        if self.path != '/api/reservations': return self.send_json(404,{'error':'Not found'})
        if self.headers.get('Origin') and self.headers['Origin'] != 'http://'+self.headers.get('Host',''): return self.send_json(403,{'error':'Invalid origin'})
        if closed(config()): return self.send_json(410,{'error':'Reservations have closed.'})
        try:
            size=int(self.headers.get('Content-Length',0))
            if size<1 or size>8192: raise ValueError()
            d=json.loads(self.rfile.read(size)); name=d.get('name','').strip(); phone=d.get('phone','').strip(); attending=d.get('attending'); request_id=d.get('requestId','')
            if not 2<=len(name)<=120 or not re.fullmatch(r'[+\d ()-]{7,30}',phone) or not 7<=len(re.sub(r'\D','',phone))<=15 or attending not in ('yes','no') or not re.fullmatch(r'[a-zA-Z0-9-]{10,80}',request_id): raise ValueError()
            guests=d.get('guests') if attending=='yes' else None; meal=d.get('meal') if attending=='yes' else None
            if attending=='yes' and (guests not in ['1','2','3','4','5','6+'] or meal not in ['vegetarian','non-vegetarian']): raise ValueError()
        except (ValueError,TypeError,AttributeError): return self.send_json(400,{'error':'Please complete all required details with a valid contact number.'})
        with sqlite3.connect(DB) as db:
            db.execute('INSERT OR IGNORE INTO reservations (request_id,full_name,phone,attending,guests,meal,created_at) VALUES (?,?,?,?,?,?,?)',(request_id,name,phone,attending,guests,meal,datetime.now().astimezone().isoformat()))
        self.send_json(201,{'ok':True})
if __name__=='__main__':
    init_db(); port=int(os.environ.get('PORT','8080')); print(f'Local invitation: http://localhost:{port}',flush=True); ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
