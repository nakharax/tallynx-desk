"""
ghr_mt5_investor_gateway.py — Multi-Account MT5 Investor Gateway (Production Hardened)
Author: Tredyn Trading Systems (Safe Operator Specification)

Designed for Linux Ubuntu (via isolated Wine worker) or Windows VPS.
Key Safety & Architecture Guarantees:
1. Concurrency Safety: Sequential thread locking (threading.Lock) prevents cross-talk between accounts.
2. Cross-Account Verification: Strictly checks acc.login == requested_login before returning data.
3. Zero Hardcoded Credentials: Never logs passwords or tokens; all secrets passed via headers/payload.
4. Existing MT5 Preservation: Supports MT5_PATH and isolated WINEPREFIX; never mutates default ~/.wine.
5. TLS/Private Network First: Binds to 127.0.0.1 by default. Use SSH Tunneling or HTTPS reverse proxy.
"""

import json
import logging
import os
import platform
import subprocess
import sys
import threading
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [Tredyn-Gateway] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("tredyn_mt5_gateway")

# Configuration via Environment Variables
BIND_HOST = os.environ.get("BIND_HOST", "127.0.0.1").strip()
PORT = int(os.environ.get("PORT", "8765"))
GATEWAY_TOKEN = os.environ.get("GATEWAY_TOKEN", "").strip()
MT5_PATH = os.environ.get("MT5_PATH", "").strip()
ISOLATED_WINEPREFIX = os.environ.get("WINEPREFIX", "/opt/tredyn-mt5/.wine_isolated").strip()
WINE_PYTHON = os.environ.get(
    "WINE_PYTHON",
    os.path.join(ISOLATED_WINEPREFIX, "drive_c", "Python311", "python.exe"),
).strip()
XVFB_DISPLAY = os.environ.get("XVFB_DISPLAY", ":99").strip()

# Global Thread Lock: MT5 Python SDK is single-terminal stateful per process
sync_lock = threading.Lock()

try:
    import MetaTrader5 as mt5
    HAS_NATIVE_MT5 = True
except ImportError:
    mt5 = None
    HAS_NATIVE_MT5 = False


def fetch_mt5_history_isolated(login_id, inv_pass, server_name, days):
    """
    Safely connects to MT5 with Investor Password, validates the active account,
    retrieves closed trade deals, and formats them for the GHR Trade Journal.
    """
    try:
        clean_login = int(str(login_id).strip().lstrip("#"))
    except ValueError:
        return None, f"Invalid login ID format: {login_id}"

    # If running on Linux Host Python, delegate to the Wine-isolated Python worker
    if not HAS_NATIVE_MT5:
        if not os.path.exists(WINE_PYTHON):
            return None, (
                f"Wine Python not found at '{WINE_PYTHON}'. "
                "If using Ubuntu, install the isolated Wine environment via install_wine_mt5.sh "
                "or specify WINE_PYTHON in environment variables."
            )

        cmd = [
            "xvfb-run", "-a", "--server-args", f"-screen 0 1024x768x16",
            "wine", WINE_PYTHON,
            os.path.abspath(__file__),
            "--wine-worker",
            str(clean_login),
            str(inv_pass).strip(),
            str(server_name).strip(),
            str(days),
        ]
        worker_env = os.environ.copy()
        worker_env["WINEPREFIX"] = ISOLATED_WINEPREFIX
        worker_env["DISPLAY"] = XVFB_DISPLAY
        if MT5_PATH:
            worker_env["MT5_PATH"] = MT5_PATH

        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=45,
                env=worker_env,
            )
        except subprocess.TimeoutExpired:
            return None, "Wine MT5 execution timed out (45s). Check broker connectivity."

        # Parse worker JSON output
        for line in reversed(proc.stdout.splitlines()):
            line = line.strip()
            if line.startswith("{") and line.endswith("}"):
                try:
                    data = json.loads(line)
                    if data.get("error"):
                        return None, data["error"]
                    return data, None
                except json.JSONDecodeError:
                    continue

        err_snippet = (proc.stderr or proc.stdout or "No output from Wine worker")[-400:]
        return None, f"Wine worker failed: {err_snippet}"

    # Native Execution (Windows or inside Wine)
    init_kwargs = {
        "login": clean_login,
        "password": str(inv_pass).strip(),
        "server": str(server_name).strip(),
        "timeout": 20000,
    }
    if MT5_PATH and os.path.exists(MT5_PATH):
        init_kwargs["path"] = MT5_PATH

    logger.info(f"Connecting MT5 terminal for account #{clean_login} on server '{server_name}'...")
    if not mt5.initialize(**init_kwargs):
        err_code, err_msg = mt5.last_error()
        return None, f"MT5 initialize failed for #{clean_login}: [{err_code}] {err_msg}"

    try:
        acc = mt5.account_info()
        if not acc:
            err_code, err_msg = mt5.last_error()
            return None, f"Unable to retrieve account_info for #{clean_login}: [{err_code}] {err_msg}"

        # CRITICAL SAFETY CHECK: Cross-account leak protection
        if int(acc.login) != clean_login:
            return None, (
                f"Security mismatch: Terminal logged into #{acc.login}, "
                f"which does not match requested account #{clean_login}. Aborting."
            )

        lookback = max(1, min(365, int(days)))
        to_dt = datetime.now() + timedelta(days=2)  # Broker server timezone buffer
        from_dt = datetime.now() - timedelta(days=lookback + 1)

        deals = mt5.history_deals_get(from_dt, to_dt) or []

        # Map and pair open/close entries by position_id
        by_pos = {}
        for d in deals:
            # Exclude balance, credit, and bonus adjustments (types >= 2)
            if getattr(d, "type", -1) not in (0, 1):
                continue
            pos_id = str(getattr(d, "position_id", None) or getattr(d, "ticket", ""))
            if not pos_id:
                continue
            rec = by_pos.setdefault(pos_id, {})
            entry = getattr(d, "entry", None)
            if entry == 0:  # DEAL_ENTRY_IN
                rec["in"] = d
            elif entry in (1, 2, 3):  # DEAL_ENTRY_OUT / OUT_BY / INOUT
                rec["out"] = d

        positions = []
        for pid, pair in by_pos.items():
            out_d = pair.get("out")
            in_d = pair.get("in")
            if not out_d:
                continue
            ref_d = in_d or out_d
            dir_str = "BUY" if getattr(ref_d, "type", 0) == 0 else "SELL"

            in_comm = float(getattr(in_d, "commission", 0) or 0) if in_d else 0.0
            out_comm = float(getattr(out_d, "commission", 0) or 0)

            positions.append({
                "ticket": pid,
                "symbol": getattr(out_d, "symbol", "XAUUSD"),
                "dir": dir_str,
                "openTime": getattr(ref_d, "time", 0),
                "closeTime": getattr(out_d, "time", 0),
                "volume": float(getattr(out_d, "volume", 0) or 0),
                "openPrice": float(getattr(ref_d, "price", 0) or 0),
                "closePrice": float(getattr(out_d, "price", 0) or 0),
                "commission": round(in_comm + out_comm, 2),
                "swap": round(float(getattr(out_d, "swap", 0) or 0), 2),
                "rawProfit": round(float(getattr(out_d, "profit", 0) or 0), 2),
                "comment": str(getattr(out_d, "comment", "") or ""),
            })

        payload = {
            "meta": {
                "holderName": str(getattr(acc, "name", "") or "MT5 Trader"),
                "login": str(clean_login),
                "broker": str(getattr(acc, "company", "") or server_name),
                "server": str(server_name),
                "currency": str(getattr(acc, "currency", "USD")),
                "initialDeposit": float(getattr(acc, "balance", 0) or 0),
            },
            "positions": positions,
        }
        logger.info(f"Sync successful for #{clean_login}: retrieved {len(positions)} positions.")
        return payload, None
    finally:
        mt5.shutdown()


# Wine Subprocess Worker Mode
if "--wine-worker" in sys.argv:
    try:
        idx = sys.argv.index("--wine-worker")
        w_login = sys.argv[idx + 1]
        w_pass = sys.argv[idx + 2]
        w_srv = sys.argv[idx + 3]
        w_days = sys.argv[idx + 4]
        res_payload, res_err = fetch_mt5_history_isolated(w_login, w_pass, w_srv, w_days)
        print(json.dumps({"error": res_err} if res_err else res_payload))
    except Exception as e:
        print(json.dumps({"error": f"Internal worker exception: {str(e)}"}))
    sys.exit(0)


class ThreadSafeGatewayHandler(BaseHTTPRequestHandler):
    """HTTP Request Handler with Token Authentication and Thread Synchronization"""

    def _send_json(self, status_code, data):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def _check_auth(self):
        if not GATEWAY_TOKEN:
            # If no token configured, only allow requests originating from 127.0.0.1 (local tunnel)
            client_ip = self.client_address[0]
            if client_ip in ("127.0.0.1", "::1", "localhost"):
                return True
            logger.warning(f"Rejected unauthenticated remote request from {client_ip}")
            return False

        auth_header = self.headers.get("Authorization", "").strip()
        custom_header = self.headers.get("X-Gateway-Token", "").strip()
        expected_bearer = f"Bearer {GATEWAY_TOKEN}"

        if auth_header == expected_bearer or custom_header == GATEWAY_TOKEN or auth_header == GATEWAY_TOKEN:
            return True

        logger.warning(f"Unauthorized access attempt from {self.client_address[0]}")
        return False

    def do_GET(self):
        if self.path.startswith("/health"):
            wine_py_exists = os.path.exists(WINE_PYTHON)
            mt5_ready = HAS_NATIVE_MT5 or wine_py_exists
            self._send_json(200, {
                "ok": True,
                "service": "Tredyn MT5 Gateway",
                "os": platform.system(),
                "bind": f"{BIND_HOST}:{PORT}",
                "mt5Ready": mt5_ready,
                "driver": "Native Windows MetaTrader5" if HAS_NATIVE_MT5 else "Wine Subprocess Worker",
                "authRequired": bool(GATEWAY_TOKEN),
            })
            return

        if not self._check_auth():
            self._send_json(401, {"error": "Unauthorized: Invalid or missing GATEWAY_TOKEN"})
            return

        self._send_json(400, {"error": "GET /sync deprecated. Use POST /sync with JSON payload."})

    def do_POST(self):
        if not self._check_auth():
            self._send_json(401, {"error": "Unauthorized: Invalid or missing GATEWAY_TOKEN"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", 0))
            raw_body = self.rfile.read(content_length).decode("utf-8")
            body = json.loads(raw_body or "{}")
        except Exception as e:
            self._send_json(400, {"error": f"Invalid JSON payload: {str(e)}"})
            return

        login = body.get("login")
        investor_password = body.get("investorPassword")
        server = body.get("server")
        lookback_days = body.get("lookbackDays", 30)

        if not login or not investor_password or not server:
            self._send_json(400, {
                "error": "Missing required fields: login, investorPassword, and server must be provided"
            })
            return

        # Acquire lock to ensure only one account syncs at a time (preventing MT5 state conflicts)
        with sync_lock:
            payload, err = fetch_mt5_history_isolated(login, investor_password, server, lookback_days)

        if err:
            self._send_json(502, {"error": err})
        else:
            self._send_json(200, payload)

    def log_message(self, format, *args):
        # Override default BaseHTTPRequestHandler logger to silence plain access logs
        pass


def main():
    if not GATEWAY_TOKEN and BIND_HOST == "0.0.0.0":
        logger.warning(
            "CRITICAL SECURITY WARNING: Gateway is bound to 0.0.0.0 with NO GATEWAY_TOKEN! "
            "Please set GATEWAY_TOKEN in your environment or bind to 127.0.0.1 with SSH tunneling."
        )

    server_address = (BIND_HOST, PORT)
    httpd = HTTPServer(server_address, ThreadSafeGatewayHandler)
    logger.info(f"Tredyn MT5 Gateway listening on {BIND_HOST}:{PORT}")
    logger.info(f"Security: Token auth {'ENABLED' if GATEWAY_TOKEN else 'LOCAL_ONLY (no token)'}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("Gateway stopped by user.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
