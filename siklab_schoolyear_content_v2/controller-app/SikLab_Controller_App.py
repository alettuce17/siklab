import asyncio
import io
import json
import mimetypes
import os
import re
import secrets
import hmac
import hashlib
import socket
import subprocess
import sys
import threading
import time
import urllib.parse
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tkinter as tk
from tkinter import messagebox, filedialog

try:
    import qrcode
    from PIL import ImageTk
except Exception:
    qrcode = None
    ImageTk = None

try:
    from websockets.legacy.server import serve
    from websockets.exceptions import ConnectionClosed
except Exception as exc:
    serve = None
    ConnectionClosed = Exception
    WEBSOCKETS_IMPORT_ERROR = exc
else:
    WEBSOCKETS_IMPORT_ERROR = None

HTTP_PORT = 3000
WS_PORT = 8765
DISCOVERY_PORT = 8766

ALLOWED_COMMANDS = {
    'g1correct', 'g1wrong',
    'g1track1', 'g1track2',
    'track1', 'track2'
}


def resource_base_dir() -> Path:
    """Return the folder beside the .exe, or beside this source file."""
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def guess_project_root() -> Path:
    base = resource_base_dir()
    candidates = [base, base.parent, Path.cwd()]
    for candidate in candidates:
        if (candidate / 'index.html').exists() and (candidate / 'js').is_dir():
            return candidate
    return base.parent


def valid_player(value):
    return value in ('player1', 'player2')


def valid_state(value):
    return isinstance(value, str) and re.fullmatch(r'[01]{9}', value) is not None


def private_ipv4(address):
    try:
        parts = [int(x) for x in address.split('.')]
        if len(parts) != 4 or any(x < 0 or x > 255 for x in parts):
            return False
        if parts[0] == 10:
            return True
        if parts[0] == 192 and parts[1] == 168:
            return True
        if parts[0] == 172 and 16 <= parts[1] <= 31:
            return True
    except Exception:
        return False
    return False


def list_windows_ipv4():
    """Prefer physical Wi-Fi/hotspot interfaces, show choices rather than guessing silently."""
    results = []
    try:
        output = subprocess.check_output(
            ['ipconfig'], text=True, encoding='utf-8', errors='ignore',
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)
        )
        adapter = ''
        for line in output.splitlines():
            if line and not line[0].isspace() and line.rstrip().endswith(':'):
                adapter = line.strip().rstrip(':')
            match = re.search(r'IPv4 Address[^:]*:\s*([0-9.]+)', line, flags=re.I)
            if match and private_ipv4(match.group(1)):
                results.append((adapter, match.group(1)))
    except Exception:
        pass
    if not results:
        try:
            for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
                ip = info[4][0]
                if private_ipv4(ip): results.append(('Windows adapter', ip))
        except Exception:
            pass
    def score(item):
        name, ip = item
        n = name.lower()
        if any(word in n for word in ('wsl', 'docker', 'vethernet', 'virtual', 'vpn', 'tailscale', 'bluetooth')):
            return 9
        if 'wi-fi' in n or 'wireless' in n or 'hotspot' in n: return 0
        if 'ethernet' in n: return 1
        return 3
    return sorted(set(results), key=score)


def detect_windows_ipv4():
    options = list_windows_ipv4()
    return options[0][1] if options else ''


def pairing_key_for_project(project_root):
    """Persistent per-Windows-app local pairing key. Never committed to GitHub."""
    app_dir = Path(os.environ.get('LOCALAPPDATA', str(Path.home() / '.local' / 'share'))) / 'SikLabController'
    app_dir.mkdir(parents=True, exist_ok=True)
    # Kept OUTSIDE the website, GitHub and manual Netlify uploads.
    target = app_dir / 'pairing.json'
    try:
        payload = json.loads(target.read_text(encoding='utf-8'))
        code = payload.get('pairing_code', '')
        if isinstance(code, str) and re.fullmatch(r'[0-9a-f]{32}', code):
            return code
    except (OSError, ValueError, TypeError):
        pass
    code = secrets.token_hex(16)
    target.write_text(json.dumps({'pairing_code': code}), encoding='utf-8')
    return code


class SikLabHTTPRequestHandler(SimpleHTTPRequestHandler):
    server_version = 'SikLabLocal/1.0'

    def __init__(self, *args, directory=None, app=None, **kwargs):
        self.app = app
        super().__init__(*args, directory=directory, **kwargs)

    def log_message(self, fmt, *args):
        # Keep the classroom app quiet unless there is an actual problem.
        return

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == '/__siklab_local_config':
            payload = {
                'enabled': bool(self.app and self.app.running),
                'controller_host': self.app.controller_host if self.app else '192.168.137.1',
                'controller_port': WS_PORT,
                'pairing_code': self.app.pairing_code if self.app else '',
                'browser_ws_url': f'ws://127.0.0.1:{WS_PORT}/browser',
                'site_url': f'http://127.0.0.1:{HTTP_PORT}/'
            }
            body = json.dumps(payload).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path == '/__siklab_qr':
            if qrcode is None:
                body = b'QR support is not installed. Run pip install -r requirements.txt.'
                self.send_response(500)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            params = urllib.parse.parse_qs(parsed.query)
            data = (params.get('data') or [''])[0]
            if not data or len(data) > 2000:
                self.send_error(400, 'Invalid QR data')
                return

            image = qrcode.make(data)
            buffer = io.BytesIO()
            image.save(buffer, format='PNG')
            body = buffer.getvalue()
            self.send_response(200)
            self.send_header('Content-Type', 'image/png')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        super().do_GET()


class SikLabControllerApp:
    def __init__(self, root):
        self.root = root
        self.root.title('SikLab Controller')
        self.root.geometry('675x720')
        self.root.minsize(580, 640)

        self.web_root = guess_project_root()
        self.controller_host = detect_windows_ipv4()
        self.pairing_code = pairing_key_for_project(self.web_root)
        self.running = False
        self.discovery_socket = None
        self.discovery_thread = None
        self.ws_ready = threading.Event()
        self.ws_start_error = None

        self.http_server = None
        self.http_thread = None

        self.ws_thread = None
        self.ws_loop = None
        self.ws_stop_event = None
        self.ws_server = None
        self.browser_sockets = set()
        self.controllers = {}
        self.controller_lock = threading.Lock()

        self._build_ui()
        self._update_buttons()
        self.root.protocol('WM_DELETE_WINDOW', self.on_close)

    def _build_ui(self):
        self.root.configure(bg='#111827')

        top = tk.Frame(self.root, bg='#ea580c', padx=18, pady=10)
        top.pack(fill='x')
        tk.Label(top, text='SIKLAB CONTROLLER', bg='#ea580c', fg='white', font=('Segoe UI', 19, 'bold')).pack(anchor='w')
        tk.Label(top, text='Fast local controller launcher', bg='#ea580c', fg='#ffedd5', font=('Segoe UI', 10)).pack(anchor='w')

        body = tk.Frame(self.root, bg='#111827', padx=15, pady=9)
        body.pack(fill='both', expand=True)

        card = tk.Frame(body, bg='white', padx=14, pady=9)
        card.pack(fill='x')

        self.server_status = tk.StringVar(value='STOPPED')
        self.ip_var = tk.StringVar(value=self.controller_host)
        self.root_var = tk.StringVar(value=str(self.web_root))

        row = tk.Frame(card, bg='white')
        row.pack(fill='x')
        tk.Label(row, text='Local Service', bg='white', fg='#475569', font=('Segoe UI', 10, 'bold')).pack(side='left')
        self.status_label = tk.Label(row, textvariable=self.server_status, bg='#fee2e2', fg='#b91c1c', padx=10, pady=4, font=('Segoe UI', 9, 'bold'))
        self.status_label.pack(side='right')

        tk.Label(card, text='Laptop / Hotspot IPv4', bg='white', fg='#64748b', font=('Segoe UI', 9, 'bold')).pack(anchor='w', pady=(8, 3))
        iprow = tk.Frame(card, bg='white')
        iprow.pack(fill='x')
        tk.Entry(iprow, textvariable=self.ip_var, font=('Consolas', 11), relief='solid', bd=1).pack(side='left', fill='x', expand=True, ipady=5)
        tk.Button(iprow, text='Choose IP', command=self.choose_ip, bg='#e2e8f0', fg='#334155', relief='flat', padx=14, pady=7).pack(side='left', padx=(8, 0))
        tk.Label(card, text='Auto-discovery will update this IP if an ESP32 joins a different Wi-Fi/hotspot.', bg='white', fg='#64748b', font=('Segoe UI', 8)).pack(anchor='w', pady=(3, 0))

        tk.Label(card, text='SikLab project folder (must contain index.html)', bg='white', fg='#64748b', font=('Segoe UI', 9, 'bold')).pack(anchor='w', pady=(8, 3))
        rootrow = tk.Frame(card, bg='white')
        rootrow.pack(fill='x')
        tk.Entry(rootrow, textvariable=self.root_var, font=('Segoe UI', 9), relief='solid', bd=1).pack(side='left', fill='x', expand=True, ipady=5)
        tk.Button(rootrow, text='Browse', command=self.browse_root, bg='#e2e8f0', fg='#334155', relief='flat', padx=14, pady=7).pack(side='left', padx=(8, 0))

        controller_card = tk.Frame(body, bg='#1f2937', padx=14, pady=9)
        controller_card.pack(fill='x', pady=(8, 0))
        tk.Label(controller_card, text='PHYSICAL CONTROLLERS', bg='#1f2937', fg='#fbbf24', font=('Segoe UI', 9, 'bold')).pack(anchor='w')

        status_grid = tk.Frame(controller_card, bg='#1f2937')
        status_grid.pack(fill='x', pady=(5, 0))
        status_grid.columnconfigure(0, weight=1)
        status_grid.columnconfigure(1, weight=1)

        self.p1_label = self._controller_panel(status_grid, 'PLAYER 1', 0)
        self.p2_label = self._controller_panel(status_grid, 'PLAYER 2', 1)

        # Prominent controller setup QR section.
        qr_card = tk.Frame(body, bg='white', padx=14, pady=9)
        qr_card.pack(fill='x', pady=(8, 0))
        tk.Label(
            qr_card, text='CONTROLLER SETUP QR', bg='white', fg='#111827',
            font=('Segoe UI', 10, 'bold')
        ).pack(anchor='w')
        tk.Label(
            qr_card,
            text='Connect your phone to the ESP32 setup Wi-Fi first, then scan the matching QR.',
            bg='white', fg='#64748b', font=('Segoe UI', 9), wraplength=560, justify='left'
        ).pack(anchor='w', pady=(2, 10))
        qrrow = tk.Frame(qr_card, bg='white')
        qrrow.pack(fill='x')
        tk.Button(
            qrrow, text='▣  PLAYER 1 SETUP QR',
            command=lambda: self.open_setup_qr('player1'),
            bg='#2563eb', fg='white', activebackground='#1d4ed8', activeforeground='white',
            relief='flat', pady=10, font=('Segoe UI', 9, 'bold')
        ).pack(side='left', fill='x', expand=True)
        tk.Button(
            qrrow, text='▣  PLAYER 2 SETUP QR',
            command=lambda: self.open_setup_qr('player2'),
            bg='#7c3aed', fg='white', activebackground='#6d28d9', activeforeground='white',
            relief='flat', pady=10, font=('Segoe UI', 9, 'bold')
        ).pack(side='left', fill='x', expand=True, padx=(8, 0))

        controls = tk.Frame(body, bg='#111827')
        controls.pack(fill='x', pady=(9, 0))

        self.start_button = tk.Button(
            controls, text='▶  START CONTROLLERS', command=self.start_services,
            bg='#16a34a', fg='white', activebackground='#15803d', activeforeground='white',
            relief='flat', pady=8, font=('Segoe UI', 10, 'bold')
        )
        self.start_button.pack(fill='x')

        self.stop_button = tk.Button(
            controls, text='■  STOP CONTROLLERS', command=self.stop_services,
            bg='#dc2626', fg='white', activebackground='#b91c1c', activeforeground='white',
            relief='flat', pady=8, font=('Segoe UI', 10, 'bold')
        )
        self.stop_button.pack(fill='x', pady=(5, 0))

        openrow = tk.Frame(controls, bg='#111827')
        openrow.pack(fill='x', pady=(5, 0))
        tk.Button(
            openrow, text='OPEN SIKLAB', command=self.open_siklab,
            bg='#f97316', fg='white', relief='flat', pady=10, font=('Segoe UI', 9, 'bold')
        ).pack(side='left', fill='x', expand=True)

        self.message_var = tk.StringVar(value='Start, scan each player QR once, then use PLAY WITH SAVED SETTINGS on later boots.')
        tk.Label(body, textvariable=self.message_var, wraplength=550, justify='left', bg='#111827', fg='#94a3b8', font=('Segoe UI', 9)).pack(anchor='w', pady=(7, 0))

    def _controller_panel(self, parent, title, column):
        frame = tk.Frame(parent, bg='#0f172a', padx=10, pady=8)
        frame.grid(row=0, column=column, sticky='ew', padx=(0, 6) if column == 0 else (6, 0))
        tk.Label(frame, text=title, bg='#0f172a', fg='white', font=('Segoe UI', 10, 'bold')).pack(anchor='w')
        var = tk.StringVar(value='● OFFLINE')
        label = tk.Label(frame, textvariable=var, bg='#0f172a', fg='#94a3b8', font=('Segoe UI', 10, 'bold'))
        label.pack(anchor='w', pady=(6, 0))
        setattr(label, '_status_var', var)
        return label

    def _set_controller_status(self, player, online, device_id=''):
        label = self.p1_label if player == 'player1' else self.p2_label
        var = getattr(label, '_status_var')
        if online:
            var.set(f'● ONLINE  {device_id}'.rstrip())
            label.configure(fg='#22c55e')
        else:
            var.set('● OFFLINE')
            label.configure(fg='#94a3b8')

    def _post_controller_status(self, player, online, device_id=''):
        self.root.after(0, lambda: self._set_controller_status(player, online, device_id))

    def detect_ip(self):
        self.controller_host = detect_windows_ipv4()
        self.ip_var.set(self.controller_host)
        self.message_var.set(f'Detected local IPv4: {self.controller_host}')

    def choose_ip(self):
        options = list_windows_ipv4()
        if not options:
            messagebox.showwarning('No laptop IP', 'Connect to classroom Wi-Fi or start your hotspot first, then retry.')
            return
        win = tk.Toplevel(self.root)
        win.title('Choose classroom network')
        win.configure(bg='white')
        tk.Label(win, text='Which network do the ESP32s use?', bg='white', fg='#111827', font=('Segoe UI', 13, 'bold')).pack(padx=18, pady=14)
        for name, ip in options:
            def pick(address=ip):
                self.ip_var.set(address)
                self.controller_host = address
                self.message_var.set(f'Classroom IP selected: {address}. New QR codes use this address.')
                win.destroy()
            tk.Button(win, text=f'{name} — {ip}', command=pick, bg='#e2e8f0', anchor='w', padx=15, pady=9, relief='flat').pack(fill='x', padx=16, pady=4)

    def browse_root(self):
        selected = filedialog.askdirectory(initialdir=str(self.web_root), title='Select SikLab project folder')
        if selected:
            self.root_var.set(selected)

    def _validate_settings(self):
        root = Path(self.root_var.get().strip()).resolve()
        if not (root / 'index.html').exists():
            raise ValueError('The selected SikLab folder does not contain index.html.')

        host = self.ip_var.get().strip()
        if not private_ipv4(host):
            if not messagebox.askyesno('Check IPv4', f'{host} does not look like a private LAN IPv4 address. Continue anyway?'):
                raise ValueError('Choose the laptop/hotspot IPv4 address used by the ESP32 controllers.')

        self.web_root = root
        self.pairing_code = pairing_key_for_project(root)
        self.controller_host = host

    def _update_buttons(self):
        if self.running:
            self.start_button.configure(state='disabled')
            self.stop_button.configure(state='normal')
            self.server_status.set('RUNNING')
            self.status_label.configure(bg='#dcfce7', fg='#166534')
        else:
            self.start_button.configure(state='normal')
            self.stop_button.configure(state='disabled')
            self.server_status.set('STOPPED')
            self.status_label.configure(bg='#fee2e2', fg='#b91c1c')
            self._set_controller_status('player1', False)
            self._set_controller_status('player2', False)

    def start_services(self):
        if self.running:
            return
        if serve is None:
            messagebox.showerror('Missing dependency', f'Python websockets is not installed.\n\n{WEBSOCKETS_IMPORT_ERROR}\n\nRun RUN_APP.bat or install requirements.txt.')
            return

        try:
            self._validate_settings()
            self._start_http_server()
            self._start_ws_server()
            self.running = True
            self._start_discovery()
        except Exception as exc:
            self._stop_http_server()
            messagebox.showerror('Could not start SikLab Controller', str(exc))
            return

        self._update_buttons()
        self.message_var.set(
            f'Local controller service is running. ESP32 target: {self.controller_host}:{WS_PORT}. '
            f'SikLab: http://127.0.0.1:{HTTP_PORT}'
        )

    def stop_services(self):
        if not self.running:
            return
        self.running = False
        self._stop_discovery()
        self._stop_ws_server()
        self._stop_http_server()
        self._update_buttons()
        self.message_var.set('Local controller service stopped. The ESP32 units may remain powered; they will reconnect after START is pressed again.')

    def _start_http_server(self):
        app = self
        root = str(self.web_root)

        def factory(*args, **kwargs):
            return SikLabHTTPRequestHandler(*args, directory=root, app=app, **kwargs)

        try:
            self.http_server = ThreadingHTTPServer(('127.0.0.1', HTTP_PORT), factory)
        except OSError as exc:
            raise RuntimeError(f'HTTP port {HTTP_PORT} is already in use. Close the other local SikLab server first. ({exc})')

        self.http_thread = threading.Thread(target=self.http_server.serve_forever, name='SikLabHTTP', daemon=True)
        self.http_thread.start()

    def _stop_http_server(self):
        server = self.http_server
        self.http_server = None
        if server:
            try:
                server.shutdown()
                server.server_close()
            except Exception:
                pass

    async def _ws_handler(self, websocket, path):
        parsed = urllib.parse.urlparse(path or '/')

        if parsed.path == '/browser':
            remote_ip = websocket.remote_address[0] if websocket.remote_address else ''
            if remote_ip not in ('127.0.0.1', '::1', '::ffff:127.0.0.1'):
                await websocket.close(code=1008, reason='Browser must run on the laptop')
                return
            self.browser_sockets.add(websocket)
            # Tell the newly-connected browser about any controllers already online.
            with self.controller_lock:
                snapshot = [(player, info.copy()) for player, info in self.controllers.items()]
            for player, info in snapshot:
                await self._safe_ws_send(websocket, {
                    'type': 'controller_online',
                    'player': player,
                    'device_id': info.get('device_id', ''),
                    'at': info.get('at') or self._now_iso()
                })

            try:
                async for raw in websocket:
                    try:
                        data = json.loads(raw)
                    except Exception:
                        continue

                    if data.get('type') != 'controller_command':
                        continue
                    player = data.get('player')
                    command = str(data.get('command') or '').strip().lower()
                    if not valid_player(player) or command not in ALLOWED_COMMANDS:
                        continue

                    with self.controller_lock:
                        target = self.controllers.get(player)
                    if target:
                        await self._safe_ws_send(target.get('socket'), {
                            'type': 'controller_command',
                            'player': player,
                            'command': command
                        })
            except ConnectionClosed:
                pass
            finally:
                self.browser_sockets.discard(websocket)
            return

        if parsed.path != '/controller':
            await websocket.close(code=1008, reason='Unknown SikLab WebSocket path')
            return

        assigned_player = None
        device_id = ''
        registered = False

        try:
            async for raw in websocket:
                try:
                    data = json.loads(raw)
                except Exception:
                    continue

                msg_type = data.get('type')

                if msg_type == 'controller_hello':
                    player = data.get('player')
                    candidate_id = str(data.get('device_id') or '').strip().upper()
                    candidate_pair = str(data.get('pairing_code') or '')
                    if not valid_player(player) or not re.fullmatch(r'[A-F0-9]{6,12}', candidate_id):
                        await websocket.close(code=1008, reason='Bad player or device id')
                        return
                    if not hmac.compare_digest(candidate_pair, self.pairing_code):
                        self.root.after(0, lambda: self.message_var.set('ESP32 pairing mismatch. Re-scan this Windows app QR and Save & Connect.'))
                        await websocket.close(code=1008, reason='Incorrect local pairing code')
                        return
                    assigned_player = player
                    device_id = candidate_id
                    registered = True
                    info = {
                        'socket': websocket,
                        'device_id': device_id,
                        'last_seen': time.time(),
                        'at': self._now_iso()
                    }
                    with self.controller_lock:
                        old = self.controllers.get(player)
                        self.controllers[player] = info
                    if old and old.get('socket') is not websocket:
                        try:
                            await old['socket'].close(code=1000, reason='Replaced by new controller connection')
                        except Exception:
                            pass

                    self._post_controller_status(player, True, device_id)
                    await self._safe_ws_send(websocket, {
                        'type': 'controller_ready',
                        'player': player,
                        'device_id': device_id,
                    })
                    await self._broadcast_to_browsers({
                        'type': 'controller_online',
                        'player': player,
                        'device_id': device_id,
                        'at': info['at']
                    })
                    continue

                if msg_type != 'controller_state' or not registered:
                    continue

                player = data.get('player')
                state = data.get('state')
                if player != assigned_player or not valid_state(state):
                    continue
                if str(data.get('device_id') or '').strip().upper() != device_id:
                    continue
                at = self._now_iso()
                with self.controller_lock:
                    self.controllers[player] = {
                        'socket': websocket,
                        'device_id': device_id,
                        'last_seen': time.time(),
                        'at': at
                    }
                self._post_controller_status(player, True, device_id)

                await self._broadcast_to_browsers({
                    'type': 'controller_state',
                    'player': player,
                    'state': state,
                    'device_id': device_id,
                    'at': at
                })
        except ConnectionClosed:
            pass
        finally:
            if assigned_player:
                with self.controller_lock:
                    current = self.controllers.get(assigned_player)
                    if current and current.get('socket') is websocket:
                        self.controllers.pop(assigned_player, None)
                        removed = True
                    else:
                        removed = False
                if removed:
                    self._post_controller_status(assigned_player, False)
                    await self._broadcast_to_browsers({
                        'type': 'controller_offline',
                        'player': assigned_player,
                        'device_id': device_id,
                        'at': self._now_iso()
                    })

    async def _safe_ws_send(self, websocket, payload):
        if websocket is None:
            return
        try:
            await websocket.send(json.dumps(payload))
        except Exception:
            pass

    async def _broadcast_to_browsers(self, payload):
        sockets = list(self.browser_sockets)
        for ws in sockets:
            try:
                await ws.send(json.dumps(payload))
            except Exception:
                self.browser_sockets.discard(ws)

    @staticmethod
    def _now_iso():
        return time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime()) + 'Z'

    async def _ws_main(self):
        self.ws_stop_event = asyncio.Event()
        try:
            self.ws_server = await serve(
                self._ws_handler,
                '0.0.0.0',
                WS_PORT,
                ping_interval=5,
                ping_timeout=3,
                max_size=64 * 1024
            )
        except OSError as exc:
            self.ws_start_error = str(exc)
            self.ws_ready.set()
            return

        self.ws_ready.set()
        await self.ws_stop_event.wait()

        # Close clients first so ESP32 units immediately know the server stopped.
        with self.controller_lock:
            controller_sockets = [info.get('socket') for info in self.controllers.values()]
            self.controllers.clear()
        all_clients = controller_sockets + list(self.browser_sockets)
        self.browser_sockets.clear()
        for ws in all_clients:
            if ws:
                try:
                    await ws.close(code=1001, reason='SikLab Controller stopped')
                except Exception:
                    pass

        self.ws_server.close()
        await self.ws_server.wait_closed()

    def _ws_thread_target(self):
        loop = asyncio.new_event_loop()
        self.ws_loop = loop
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self._ws_main())
        finally:
            self.ws_loop = None
            try:
                loop.close()
            except Exception:
                pass

    def _start_ws_server(self):
        self.ws_ready.clear()
        self.ws_start_error = None
        self.ws_thread = threading.Thread(target=self._ws_thread_target, name='SikLabWS', daemon=True)
        self.ws_thread.start()
        if not self.ws_ready.wait(timeout=3):
            raise RuntimeError('Windows WebSocket server did not start within 3 seconds.')
        if self.ws_start_error:
            raise RuntimeError(f'Cannot bind WebSocket TCP {WS_PORT}: {self.ws_start_error}')

    def _start_discovery(self):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(('0.0.0.0', DISCOVERY_PORT))
            sock.settimeout(0.4)
        except OSError as exc:
            self.message_var.set(f'Local TCP {WS_PORT} works; UDP discovery unavailable ({exc}). Use the QR laptop IP fallback.')
            return
        self.discovery_socket = sock
        self.discovery_thread = threading.Thread(target=self._discovery_loop, name='SikLabDiscover', daemon=True)
        self.discovery_thread.start()

    def _stop_discovery(self):
        sock = self.discovery_socket
        self.discovery_socket = None
        if sock:
            try: sock.close()
            except OSError: pass

    def _discovery_loop(self):
        while self.running and self.discovery_socket:
            sock = self.discovery_socket
            try:
                raw, address = sock.recvfrom(128)
            except socket.timeout:
                continue
            except OSError:
                break
            data = raw.decode('ascii', 'ignore')
            if not re.fullmatch(r'SIKLAB_DISCOVER\|[A-F0-9]{6,12}', data):
                continue
            if not private_ipv4(address[0]):
                continue
            # Route lookup: find the exact Windows interface used to reach THIS ESP32.
            try:
                probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                probe.connect((address[0], 9))
                host = probe.getsockname()[0]
                probe.close()
            except OSError:
                continue
            if not private_ipv4(host):
                continue
            reply = f'SIKLAB_SERVER|{host}|{WS_PORT}'.encode('ascii')
            try:
                sock.sendto(reply, address)
            except OSError:
                continue
            if self.controller_host != host:
                self.controller_host = host
                self.root.after(0, lambda addr=host: self._discovered_host_ui(addr))

    def _discovered_host_ui(self, host):
        self.ip_var.set(host)
        self.message_var.set(f'ESP32 discovery found the correct classroom interface: {host}. QR fallback IP updated automatically.')

    def _stop_ws_server(self):
        loop = self.ws_loop
        event = self.ws_stop_event
        if loop and event:
            try:
                loop.call_soon_threadsafe(event.set)
            except Exception:
                pass
        self.ws_stop_event = None
        self._set_controller_status('player1', False)
        self._set_controller_status('player2', False)

    def open_siklab(self):
        if not self.running:
            if messagebox.askyesno('Start controllers?', 'The local controller service is stopped. Start it now?'):
                self.start_services()
            else:
                return
        webbrowser.open(f'http://127.0.0.1:{HTTP_PORT}/')

    def setup_url(self, player):
        query = urllib.parse.urlencode({
            'player': player,
            'mode': 'local',
            'server': self.ip_var.get().strip(),
            'port': WS_PORT,
            'pair': self.pairing_code
        })
        return f'http://192.168.4.1/?{query}'

    def open_setup_qr(self, player):
        # QR generation does not require the controller service to be running.
        # It only encodes player + local mode + laptop IP + port.
        host = self.ip_var.get().strip()
        if not private_ipv4(host):
            messagebox.showwarning(
                'Check laptop IP',
                'Set the Laptop / Hotspot IPv4 first (for example 192.168.110.25), then generate the QR.'
            )
            return
        url = self.setup_url(player)
        qr_url = f'http://127.0.0.1:{HTTP_PORT}/__siklab_qr?data={urllib.parse.quote(url, safe="")}'
        title = 'Player 1 Setup QR' if player == 'player1' else 'Player 2 Setup QR'
        win = tk.Toplevel(self.root)
        win.title(title)
        win.configure(bg='white')
        win.geometry('410x480')
        tk.Label(win, text=title, bg='white', fg='#111827', font=('Segoe UI', 15, 'bold')).pack(pady=(18, 5))
        tk.Label(win, text='1) Connect phone to SikLab-Setup-XXXXXX\n2) Scan QR, enter classroom Wi-Fi/password, Save & Connect\n3) Laptop IP is also auto-discovered if the network changes', bg='white', fg='#64748b', justify='center', font=('Segoe UI', 9)).pack()

        # Tkinter cannot load remote PNG directly, so use the QR package locally.
        if qrcode is None:
            tk.Label(win, text='QR library missing. Run RUN_APP.bat.', bg='white', fg='#dc2626').pack(pady=30)
        else:
            image = qrcode.make(url).resize((300, 300))
            photo = ImageTk.PhotoImage(image)
            label = tk.Label(win, image=photo, bg='white')
            label.image = photo
            label.pack(pady=12)

        tk.Entry(win, justify='center', font=('Consolas', 8)).pack(fill='x', padx=16, pady=(5, 0))
        entry = win.winfo_children()[-1]
        entry.insert(0, url.split('&pair=')[0] + '&pair=*** (pairing code is inside QR)')
        entry.configure(state='readonly')
        tk.Button(win, text='COPY FULL SETUP LINK', command=lambda: (win.clipboard_clear(), win.clipboard_append(url)), bg='#334155', fg='white', relief='flat', pady=8).pack(fill='x', padx=18, pady=8)

    def on_close(self):
        try:
            self.stop_services()
        finally:
            self.root.after(150, self.root.destroy)


def main():
    root = tk.Tk()
    app = SikLabControllerApp(root)
    root.mainloop()


if __name__ == '__main__':
    main()
