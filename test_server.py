import tempfile, threading, sqlite3, json, urllib.request, urllib.error
from pathlib import Path
import server
original_config=server.config
with tempfile.TemporaryDirectory() as temp:
 server.DB=Path(temp)/'test.sqlite3';server.init_db()
 http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
 threading.Thread(target=http.serve_forever,daemon=True).start()
 base='http://127.0.0.1:'+str(http.server_port)
 def post(data):
  req=urllib.request.Request(base+'/api/reservations',data=json.dumps(data).encode(),headers={'Content-Type':'application/json'})
  try:
   with urllib.request.urlopen(req) as r:return r.status
  except urllib.error.HTTPError as e:return e.code
 data={'name':'Test Person','phone':'0100000000','attending':'yes','guests':'6+','meal':'vegetarian','requestId':'test-request-123'}
 assert post(data)==201
 assert post(data)==201
 assert post({**data,'requestId':'test-request-456','meal':''})==400
 assert post({**data,'requestId':'test-request-789','attending':'no','guests':'','meal':''})==201
 with sqlite3.connect(server.DB) as db:
  assert db.execute('SELECT count(*) FROM reservations').fetchone()[0]==2
  assert db.execute("SELECT guests,meal FROM reservations WHERE attending='no'").fetchone()==(None,None)
 server.config=lambda:{**original_config(),'closesAt':'2020-01-01T00:00:00+08:00'}
 assert post(data)==410
 with urllib.request.urlopen(base+'/api/config') as r:assert json.load(r)['closed']
 http.shutdown()
 print('PASS: attending, decline, required fields, database persistence, retry deduplication, server cutoff')
