#!/usr/bin/env python3
"""Local stand-ins for the alert channels, used only by ops/test/local-e2e.sh.
  - webhook: HTTP POST on 127.0.0.1:<port>/hook, each JSON body appended to <outdir>/webhook.jsonl
  - smtp:    SMTP with required STARTTLS + AUTH on 127.0.0.1:<port> (aiosmtpd), each message to <outdir>/mail.N.eml
usage: receivers.py <outdir> <webhook_port> <smtp_port> <certfile> <keyfile> <user> <password>
"""
import json, os, ssl, sys, threading
from http.server import BaseHTTPRequestHandler, HTTPServer

out, wport, sport, cert, key, user, pw = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), *sys.argv[4:8]

class Hook(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        json.loads(body)  # must be valid JSON
        with open(os.path.join(out, 'webhook.jsonl'), 'ab') as f:
            f.write(body + b'\n')
        self.send_response(204); self.end_headers()
    def log_message(self, *a): pass

threading.Thread(target=HTTPServer(('127.0.0.1', wport), Hook).serve_forever, daemon=True).start()

from aiosmtpd.controller import Controller
from aiosmtpd.smtp import AuthResult, LoginPassword

class Handler:
    n = 0
    async def handle_DATA(self, server, session, envelope):
        Handler.n += 1
        with open(os.path.join(out, f'mail.{Handler.n}.eml'), 'wb') as f:
            f.write(envelope.content)
        return '250 OK'

def auth(server, session, envelope, mechanism, data):
    ok = isinstance(data, LoginPassword) and data.login.decode() == user and data.password.decode() == pw
    return AuthResult(success=ok)

ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH); ctx.load_cert_chain(cert, key)
c = Controller(Handler(), hostname='127.0.0.1', port=sport, tls_context=ctx, require_starttls=True,
               authenticator=auth, auth_required=True)
c.start()
print('receivers ready', flush=True)
threading.Event().wait()
