"""Run: py -m unittest discover -s tests -v  (from this update's root)"""
import asyncio
import importlib.util
import json
import pathlib
import tempfile
import threading
import unittest
import urllib.parse
import os
import socket

from websockets.legacy.server import serve
from websockets.legacy.client import connect
from websockets.exceptions import ConnectionClosed

APP = pathlib.Path(__file__).parents[1] / 'controller-app' / 'SikLab_Controller_App.py'
spec = importlib.util.spec_from_file_location('siklab_controller_app', APP)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class DummyTk:
    def after(self, _ms, callback):
        callback()

class DummyVar:
    def __init__(self): self.value = ''
    def set(self, value): self.value = value


def fake_app():
    app = object.__new__(mod.SikLabControllerApp)
    app.pairing_code = 'a' * 32
    app.root = DummyTk()
    app.message_var = DummyVar()
    app.controllers = {}
    app.controller_lock = threading.Lock()
    app.browser_sockets = set()
    app.status_events = []
    app._post_controller_status = lambda *args: app.status_events.append(args)
    return app


class SikLabProtocolTests(unittest.IsolatedAsyncioTestCase):
    async def test_pairing_and_controller_to_browser(self):
        app = fake_app()
        async with serve(app._ws_handler, '127.0.0.1', 0) as ws_server:
            port = ws_server.sockets[0].getsockname()[1]
            async with connect(f'ws://127.0.0.1:{port}/browser') as browser:
                async with connect(f'ws://127.0.0.1:{port}/controller') as esp:
                    await esp.send(json.dumps({'type':'controller_state', 'player':'player1', 'device_id':'E9BFB4', 'state':'000010000'}))
                    await asyncio.sleep(.04)
                    self.assertNotIn('player1', app.controllers, 'Unpaired controller must be ignored')
                    await esp.send(json.dumps({'type':'controller_hello', 'player':'player1', 'device_id':'E9BFB4', 'pairing_code':'a'*32}))
                    ready = json.loads(await asyncio.wait_for(esp.recv(), 2))
                    self.assertEqual(ready['type'], 'controller_ready')
                    online = json.loads(await asyncio.wait_for(browser.recv(), 2))
                    self.assertEqual(online['type'], 'controller_online')
                    self.assertEqual(online['device_id'], 'E9BFB4')
                    await esp.send(json.dumps({'type':'controller_state','player':'player1','device_id':'E9BFB4','state':'000010000'}))
                    state = json.loads(await asyncio.wait_for(browser.recv(), 2))
                    self.assertEqual(state['state'], '000010000')
                    await esp.send(json.dumps({'type':'controller_state','player':'player2','device_id':'E9BFB4','state':'100000000'}))
                    await asyncio.sleep(.04)
                    self.assertNotIn('player2', app.controllers, 'Paired socket cannot impersonate other player')
                offline = json.loads(await asyncio.wait_for(browser.recv(), 2))
                self.assertEqual(offline['type'], 'controller_offline')

    async def test_bad_pair_rejected(self):
        app = fake_app()
        async with serve(app._ws_handler, '127.0.0.1', 0) as ws_server:
            port=ws_server.sockets[0].getsockname()[1]
            async with connect(f'ws://127.0.0.1:{port}/controller') as esp:
                await esp.send(json.dumps({'type':'controller_hello','player':'player1','device_id':'E9BFB4','pairing_code':'WRONG'}))
                with self.assertRaises(ConnectionClosed):
                    await asyncio.wait_for(esp.recv(), 2)
            self.assertFalse(app.controllers)

    async def test_udp_discovery_uses_correct_interface(self):
        app = fake_app()
        app.running = True
        app.discovery_socket = None
        app.discovery_thread = None
        app.controller_host = '10.143.84.176'  # potentially stale laptop address
        app.ip_var = DummyVar()
        app._discovered_host_ui = lambda host: app.ip_var.set(host)
        app._start_discovery()
        if app.discovery_socket is None:
            self.skipTest('UDP port 8766 unavailable in this environment')
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(('8.8.8.8', 9))  # only route selection, no Internet packets sent
        own_lan_ip = probe.getsockname()[0]
        probe.close()
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.bind((own_lan_ip, 0))
        sock.settimeout(2)
        try:
            sock.sendto(b'SIKLAB_DISCOVER|E9BFB4', (own_lan_ip, mod.DISCOVERY_PORT))
            raw, _ = await asyncio.to_thread(sock.recvfrom, 128)
            self.assertEqual(raw.decode(), f'SIKLAB_SERVER|{own_lan_ip}|8765')
            self.assertEqual(app.controller_host, own_lan_ip)
        finally:
            app.running = False
            app._stop_discovery()
            sock.close()

    async def test_qr_and_persistent_pair(self):
        with tempfile.TemporaryDirectory() as directory:
            old = os.environ.get('LOCALAPPDATA')
            os.environ['LOCALAPPDATA'] = directory
            try:
                key = mod.pairing_key_for_project(directory)
                self.assertEqual(len(key), 32)
                self.assertEqual(key, mod.pairing_key_for_project(directory))
                self.assertFalse((pathlib.Path(directory) / 'pairing.json').exists())
                self.assertTrue((pathlib.Path(directory)/'SikLabController'/'pairing.json').exists())
            finally:
                if old is None: os.environ.pop('LOCALAPPDATA', None)
                else: os.environ['LOCALAPPDATA'] = old
        app = fake_app()
        app.ip_var = DummyVar()
        app.ip_var.value = '10.143.84.176'
        app.ip_var.get = lambda: app.ip_var.value
        url = app.setup_url('player1')
        params = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
        self.assertEqual(params['player'], ['player1'])
        self.assertEqual(params['mode'], ['local'])
        self.assertEqual(params['server'], ['10.143.84.176'])
        self.assertEqual(params['pair'], ['a'*32])

if __name__ == '__main__': unittest.main()
