#!/usr/bin/env python3
"""
Tredyn Sovereign Persistent State & Redis Hub (VPS01 · 127.0.0.1:8765)
Strictly Prop-Firm Safe-Only (NO shared MT5 Investor Password login).
Supports:
  1. GET  /health (and /tredyn-mt5/health)
  2. POST /live-bridge/push & GET /live-bridge/pull — Outbound TredynLiveBridge.ex5 24/7 store
  3. GET|POST /marketplace/{listings,publish,purchase,delete} — Persistent verified Desk Marketplace
  4. GET|POST /desk-room & POST /desk-room/presence — Shared Desk Room messages & presence
  5. POST /ratelimit/check — Shared Redis-backed rate limit window across Vercel serverless instances
  6. POST /sync — HTTP 410 Permanently disabled (Shared IP safety)
"""
import hashlib
import http.client
import json
import os
import re
import socket
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("PORT", "8765"))
FUNDEDNEXT_HUB_HOST = os.environ.get("FUNDEDNEXT_HUB_HOST", "127.0.0.1")
FUNDEDNEXT_HUB_PORT = int(os.environ.get("FUNDEDNEXT_HUB_PORT", "8766"))
MAX_FUNDEDNEXT_RPC_BYTES = 2 * 1024 * 1024
_TS_RE = re.compile(r"^\d{10,16}$")
_NONCE_RE = re.compile(r"^[a-f0-9]{32}$")
_SIG_RE = re.compile(r"^[a-f0-9]{64}$")
REDIS_HOST = os.environ.get("REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
STORE_DIR = os.path.dirname(os.path.abspath(__file__))
LIVE_BRIDGE_STORE_FILE = os.path.join(STORE_DIR, "live_bridge_store.json")
MARKETPLACE_STORE_FILE = os.path.join(STORE_DIR, "marketplace_store.json")
DESK_ROOM_STORE_FILE = os.path.join(STORE_DIR, "desk_room_store.json")
GATEWAY_TOKEN = os.environ.get("BRIDGE_TOKEN", "").strip()

_store_lock = threading.Lock()
_rate_lock = threading.Lock()
_desk_participants: dict = {}
_fallback_rate_buckets: dict = {}

DEFAULT_DESK_MESSAGES = [
    {
        "id": "room-1",
        "handle": "@alex_quant",
        "text": "XAUUSD · ตรวจสอบ Daily Drawdown Guard และเกณฑ์ 12-Gate Checklist ก่อนวางแผนขนาด Lot (Analytical Review Only)",
        "symbol": "XAUUSD",
        "createdAt": "14:42",
    }
]


def _read_json_file(path: str, default_value):
    with _store_lock:
        if not os.path.isfile(path):
            return default_value
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data
        except Exception:
            return default_value


def _write_json_atomic(path: str, payload) -> None:
    with _store_lock:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp_path = f"{path}.tmp.{os.getpid()}"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
        os.replace(tmp_path, path)


def hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.strip().encode("utf-8")).hexdigest()


def _redis_cmd(*args: str, timeout_sec: float = 0.25):
    encoded = f"*{len(args)}\r\n".encode("utf-8")
    for a in args:
        b = str(a).encode("utf-8")
        encoded += f"${len(b)}\r\n".encode("utf-8") + b + b"\r\n"
    with socket.create_connection((REDIS_HOST, REDIS_PORT), timeout=timeout_sec) as sock:
        sock.settimeout(timeout_sec)
        sock.sendall(encoded)
        chunk = sock.recv(4096).decode("utf-8", errors="replace")
    if chunk.startswith(":"):
        return int(chunk[1:].split("\r\n", 1)[0])
    if chunk.startswith("+"):
        return chunk[1:].split("\r\n", 1)[0]
    if chunk.startswith("$"):
        lines = chunk.split("\r\n")
        return lines[1] if len(lines) > 1 else None
    return None


def redis_ping() -> bool:
    try:
        return _redis_cmd("PING") == "PONG"
    except Exception:
        return False


def check_shared_rate_limit(key: str, window_sec: int, max_requests: int) -> dict:
    clean_key = f"tallynx:rl:{hash_key(key)[:24]}:{int(time.time() // window_sec)}"
    try:
        count = _redis_cmd("INCR", clean_key)
        if isinstance(count, int):
            if count == 1:
                _redis_cmd("EXPIRE", clean_key, str(window_sec + 5))
            allowed = count <= max_requests
            retry_after = max(1, window_sec - int(time.time() % window_sec)) if not allowed else 0
            return {
                "allowed": allowed,
                "count": count,
                "retryAfterSec": retry_after,
                "backend": "redis",
            }
    except Exception:
        pass

    now = time.time()
    cutoff = now - window_sec
    with _rate_lock:
        timestamps = [ts for ts in _fallback_rate_buckets.get(key, []) if ts > cutoff]
        if len(timestamps) >= max_requests:
            oldest = timestamps[0]
            _fallback_rate_buckets[key] = timestamps
            return {
                "allowed": False,
                "count": len(timestamps),
                "retryAfterSec": max(1, int(oldest + window_sec - now)),
                "backend": "memory",
            }
        timestamps.append(now)
        _fallback_rate_buckets[key] = timestamps
        return {
            "allowed": True,
            "count": len(timestamps),
            "retryAfterSec": 0,
            "backend": "memory",
        }


def get_active_desk_participants() -> list:
    cutoff = time.time() - 600
    expired = [k for k, v in _desk_participants.items() if v.get("_ts", 0) < cutoff]
    for k in expired:
        _desk_participants.pop(k, None)
    return [{kk: vv for kk, vv in rec.items() if kk != "_ts"} for rec in _desk_participants.values()]


class GatewayHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _send_json(self, status: int, data: dict):
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 8_000_000:
            return {}
        body_raw = self.rfile.read(length).decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body_raw)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    def _check_auth(self) -> bool:
        if not GATEWAY_TOKEN:
            return True
        auth = self.headers.get("Authorization", "")
        return auth == f"Bearer {GATEWAY_TOKEN}"

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path.endswith("/health"):
            self._send_json(
                200,
                {
                    "ok": True,
                    "service": "TallyNX Sovereign Persistent Hub (VPS01)",
                    "mode": "SAFE_PERSISTENT_HUB",
                    "sharedVpsMt5Disabled": True,
                    "mt5Ready": True,
                    "redisConnected": redis_ping(),
                    "port": PORT,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )
            return

        if path.endswith("/live-bridge/pull"):
            qs = parse_qs(parsed.query)
            api_key = (
                self.headers.get("X-Tredyn-Api-Key", "")
                or self.headers.get("X-TallyNX-Api-Key", "")
                or (qs.get("apiKey", [""])[0])
            ).strip()
            if not api_key:
                self._send_json(400, {"ok": False, "error": "Missing apiKey"})
                return
            store = _read_json_file(LIVE_BRIDGE_STORE_FILE, {})
            if not isinstance(store, dict):
                store = {}
            entry = store.get(hash_key(api_key))
            if not entry:
                self._send_json(404, {"ok": False, "code": "LIVE_BRIDGE_WAITING"})
                return
            self._send_json(200, {"ok": True, "entry": entry})
            return

        if path.endswith("/marketplace/listings"):
            raw_list = _read_json_file(MARKETPLACE_STORE_FILE, [])
            listings = raw_list if isinstance(raw_list, list) else []
            self._send_json(200, {"ok": True, "listings": listings})
            return

        if path.endswith("/desk-room"):
            raw_msgs = _read_json_file(DESK_ROOM_STORE_FILE, DEFAULT_DESK_MESSAGES)
            messages = raw_msgs[-30:] if isinstance(raw_msgs, list) else DEFAULT_DESK_MESSAGES
            self._send_json(
                200,
                {
                    "ok": True,
                    "room": "global-xauusd",
                    "messages": messages,
                    "participants": get_active_desk_participants(),
                },
            )
            return

        self._send_json(404, {"ok": False, "error": "Not found"})

    def _proxy_fundednext_rpc(self, path: str):
        ts = self.headers.get("X-Tredyn-Ts", "").strip()
        nonce = self.headers.get("X-Tredyn-Nonce", "").strip()
        uid = self.headers.get("X-Tredyn-Uid", "").strip()
        sig = self.headers.get("X-Tredyn-Sig", "").strip()
        if not (_TS_RE.match(ts) and _NONCE_RE.match(nonce) and uid and len(uid) <= 256 and _SIG_RE.match(sig)):
            self._send_json(401, {"error": "Unauthorized FundedNext RPC request"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(400, {"error": "Invalid Content-Length"})
            return
        if length < 0 or length > MAX_FUNDEDNEXT_RPC_BYTES:
            self._send_json(400, {"error": "RPC payload too large"})
            return
        raw_body = self.rfile.read(length) if length > 0 else b""
        conn = None
        try:
            conn = http.client.HTTPConnection(FUNDEDNEXT_HUB_HOST, FUNDEDNEXT_HUB_PORT, timeout=12)
            conn.request(
                "POST",
                path,
                body=raw_body,
                headers={
                    "Content-Type": self.headers.get("Content-Type", "application/json"),
                    "Content-Length": str(len(raw_body)),
                    "X-Tredyn-Ts": ts,
                    "X-Tredyn-Nonce": nonce,
                    "X-Tredyn-Uid": uid,
                    "X-Tredyn-Sig": sig,
                },
            )
            upstream = conn.getresponse()
            resp_bytes = upstream.read()
            self.send_response(upstream.status)
            self.send_header("Content-Type", upstream.getheader("Content-Type") or "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(resp_bytes)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(resp_bytes)
        except Exception:
            self._send_json(503, {"error": "FundedNext VPS hub unavailable"})
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if path.startswith("/fundednext-rpc/"):
            self._proxy_fundednext_rpc(path)
            return
        body = self._read_json_body()

        if path.endswith("/live-bridge/push"):
            api_key = (
                self.headers.get("X-Tredyn-Api-Key", "")
                or self.headers.get("X-TallyNX-Api-Key", "")
                or str(body.get("tredynApiKey", "") or body.get("tallynxApiKey", ""))
            ).strip()
            if not api_key or len(api_key) < 10:
                self._send_json(401, {"ok": False, "error": "Invalid tredyn-api-key"})
                return
            store = _read_json_file(LIVE_BRIDGE_STORE_FILE, {})
            if not isinstance(store, dict):
                store = {}
            store[hash_key(api_key)] = {
                "syncedAt": datetime.now(timezone.utc).isoformat(),
                "meta": body.get("meta", {}),
                "positions": body.get("positions", []),
            }
            _write_json_atomic(LIVE_BRIDGE_STORE_FILE, store)
            self._send_json(200, {"ok": True, "saved": True})
            return

        if path.endswith("/marketplace/publish"):
            listing = body.get("listing")
            if not isinstance(listing, dict) or not listing.get("id"):
                self._send_json(400, {"ok": False, "error": "Invalid listing payload"})
                return
            raw_list = _read_json_file(MARKETPLACE_STORE_FILE, [])
            listings = [x for x in raw_list if isinstance(x, dict) and x.get("id") != listing.get("id")] if isinstance(raw_list, list) else []
            listings.insert(0, listing)
            _write_json_atomic(MARKETPLACE_STORE_FILE, listings[:500])
            self._send_json(200, {"ok": True, "listing": listing})
            return

        if path.endswith("/marketplace/purchase"):
            setup_id = str(body.get("setupId", "")).strip()
            raw_list = _read_json_file(MARKETPLACE_STORE_FILE, [])
            listings = raw_list if isinstance(raw_list, list) else []
            updated_count = 1
            for item in listings:
                if isinstance(item, dict) and item.get("id") == setup_id:
                    item["buyerCount"] = int(item.get("buyerCount") or 0) + 1
                    updated_count = item["buyerCount"]
            _write_json_atomic(MARKETPLACE_STORE_FILE, listings)
            self._send_json(200, {"ok": True, "setupId": setup_id, "buyerCount": updated_count})
            return

        if path.endswith("/marketplace/delete"):
            setup_id = str(body.get("id", "")).strip()
            raw_list = _read_json_file(MARKETPLACE_STORE_FILE, [])
            listings = [x for x in raw_list if isinstance(x, dict) and x.get("id") != setup_id] if isinstance(raw_list, list) else []
            _write_json_atomic(MARKETPLACE_STORE_FILE, listings)
            self._send_json(200, {"ok": True, "id": setup_id})
            return

        if path.endswith("/desk-room/presence"):
            raw_handle = str(body.get("handle", "@trader_you")).strip()[:40]
            handle = raw_handle if raw_handle.startswith("@") else f"@{raw_handle}"
            status = body.get("status") if body.get("status") in ("HOLDING_ORDER", "CLOSED_FOR_DAY") else "WAITING_SETUP"
            labels = {
                "HOLDING_ORDER": "กำลังถือออเดอร์",
                "WAITING_SETUP": "รอจังหวะเข้า",
                "CLOSED_FOR_DAY": "ปิดจบวันแล้ว",
            }
            _desk_participants[handle.lower()] = {
                "id": handle.lower(),
                "handle": handle,
                "role": str(body.get("role", "Trader"))[:32],
                "symbol": str(body.get("symbol", "XAUUSD"))[:16],
                "status": status,
                "statusLabelTh": labels[status],
                "rMultipleToday": float(body.get("rMultipleToday") or 0),
                "updatedAt": "ออนไลน์ล่าสุด",
                "_ts": time.time(),
            }
            self._send_json(200, {"ok": True, "participants": get_active_desk_participants()})
            return

        if path.endswith("/desk-room"):
            item = body.get("item")
            if not isinstance(item, dict) or not item.get("text"):
                text = str(body.get("text", "")).strip()[:500]
                if not text:
                    self._send_json(400, {"ok": False, "error": "Message text required"})
                    return
                raw_handle = str(body.get("handle", "@trader_you")).strip()[:40]
                item = {
                    "id": f"room-{int(time.time() * 1000)}",
                    "handle": raw_handle if raw_handle.startswith("@") else f"@{raw_handle}",
                    "text": text,
                    "symbol": str(body.get("symbol", "XAUUSD"))[:16],
                    "createdAt": datetime.now(timezone.utc).strftime("%H:%M"),
                    "isTradeIdea": bool(body.get("isTradeIdea", False)),
                }
            raw_msgs = _read_json_file(DESK_ROOM_STORE_FILE, DEFAULT_DESK_MESSAGES)
            messages = list(raw_msgs) if isinstance(raw_msgs, list) else list(DEFAULT_DESK_MESSAGES)
            messages.append(item)
            messages = messages[-60:]
            _write_json_atomic(DESK_ROOM_STORE_FILE, messages)
            self._send_json(200, {"ok": True, "item": item})
            return

        if path.endswith("/ratelimit/check"):
            key = str(body.get("key", "")).strip()
            if not key:
                self._send_json(400, {"ok": False, "error": "Missing key"})
                return
            window_sec = max(10, min(86400, int(body.get("windowSec") or 900)))
            max_req = max(1, min(5000, int(body.get("maxRequests") or 25)))
            res = check_shared_rate_limit(key, window_sec, max_req)
            self._send_json(200, {"ok": True, **res})
            return

        if path.endswith("/sync"):
            self._send_json(
                410,
                {
                    "ok": False,
                    "error": "Shared VPS MT5 Investor Password sync has been permanently disabled for Prop Firm compliance. Use TredynLiveBridge.ex5 Push instead.",
                },
            )
            return

        if not self._check_auth():
            self._send_json(401, {"ok": False, "error": "Unauthorized gateway token"})
            return

        self._send_json(404, {"ok": False, "error": "Not found"})


if __name__ == "__main__":
    print(f"[TallyNX Sovereign Persistent Hub] Listening on 127.0.0.1:{PORT}...")
    ThreadingHTTPServer(("127.0.0.1", PORT), GatewayHandler).serve_forever()
