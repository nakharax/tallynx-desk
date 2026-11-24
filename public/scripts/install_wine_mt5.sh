#!/usr/bin/env bash
# install_wine_mt5.sh — Isolated Wine & MT5 Terminal Setup for Linux Ubuntu
# Safe Operator Specification:
# - Does NOT touch existing ~/.wine prefixes.
# - Confines all runtime files to /opt/tredyn-mt5/.wine_isolated.
# - Uses isolated Xvfb display (:99).

set -euo pipefail

TARGET_DIR="/opt/tredyn-mt5"
ISOLATED_PREFIX="${TARGET_DIR}/.wine_isolated"
XVFB_DISPLAY=":99"

echo "================================================================="
echo "  Tredyn · GHR v3.2 — Isolated Wine + MT5 Setup (Ubuntu)"
echo "  Target Wine Prefix: ${ISOLATED_PREFIX}"
echo "================================================================="

if [[ $EUID -ne 0 ]]; then
   echo "[ERROR] This installer requires root privileges (sudo bash install_wine_mt5.sh)."
   exit 1
fi

if [[ "${1:-}" == "--check" ]]; then
    echo "[CHECK] Performing dry-run environment inspection..."
    which wine64 || echo "[INFO] wine64 not found (will be installed)"
    which xvfb-run || echo "[INFO] xvfb-run not found (will be installed)"
    if [[ -d "${ISOLATED_PREFIX}" ]]; then
        echo "[INFO] Isolated prefix exists at ${ISOLATED_PREFIX}"
    else
        echo "[INFO] Isolated prefix will be created cleanly."
    fi
    exit 0
fi

mkdir -p "${TARGET_DIR}"
mkdir -p "${ISOLATED_PREFIX}"

echo "[Step 1/4] Checking system dependencies (Wine64 & Xvfb)..."
dpkg --add-architecture i386 || true
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    wine64 wine32 xvfb wget curl ca-certificates

echo "[Step 2/4] Initializing isolated 64-bit Wine prefix (this takes ~30-60s)..."
export WINEPREFIX="${ISOLATED_PREFIX}"
export WINEARCH=win64
export WINEDEBUG=-all
export DISPLAY="${XVFB_DISPLAY}"

# Start Xvfb virtual framebuffer for headless Wine execution
if ! pgrep -f "Xvfb ${XVFB_DISPLAY}" >/dev/null; then
    Xvfb "${XVFB_DISPLAY}" -screen 0 1024x768x16 &
    XVFB_PID=$!
    sleep 2
else
    XVFB_PID=""
fi

trap 'if [[ -n "${XVFB_PID:-}" ]]; then kill -9 "${XVFB_PID}" 2>/dev/null || true; fi' EXIT

wineboot --init || true
sleep 5

echo "[Step 3/4] Installing official Windows Python 3.11 inside isolated Wine prefix..."
cd "${TARGET_DIR}"
if [[ ! -f "python-3.11.9-amd64.exe" ]]; then
    echo "Downloading Windows Python 3.11 64-bit installer (~25MB)..."
    wget -q --show-progress -O python-3.11.9-amd64.exe https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe
fi

wine python-3.11.9-amd64.exe /quiet InstallAllUsers=1 PrependPath=1 Include_test=0 || true
sleep 5

WINE_PY="${ISOLATED_PREFIX}/drive_c/Program Files/Python311/python.exe"
if [[ -f "${WINE_PY}" ]]; then
    mkdir -p "${ISOLATED_PREFIX}/drive_c/Python311"
    cp -r "${ISOLATED_PREFIX}/drive_c/Program Files/Python311/"* "${ISOLATED_PREFIX}/drive_c/Python311/" || true
fi

ALT_WINE_PY="${ISOLATED_PREFIX}/drive_c/Python311/python.exe"
ACTIVE_PY="${WINE_PY}"
if [[ -f "${ALT_WINE_PY}" ]]; then
    ACTIVE_PY="${ALT_WINE_PY}"
fi

if [[ ! -f "${ACTIVE_PY}" ]]; then
    echo "[ERROR] Python was not found in Wine prefix at ${ACTIVE_PY}. Please review logs."
    exit 1
fi

echo "[Step 4/4] Installing MetaTrader5 library and Terminal inside isolated prefix..."
wine "${ACTIVE_PY}" -m pip install --upgrade pip
wine "${ACTIVE_PY}" -m pip install --upgrade MetaTrader5

if [[ ! -f "mt5setup.exe" ]]; then
    echo "Downloading official MetaTrader 5 setup (~15MB)..."
    wget -q --show-progress -O mt5setup.exe https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe
fi

# Run MT5 installer in headless mode
wine mt5setup.exe /auto || true
sleep 5

echo "Verifying MetaTrader5 import inside Wine..."
if wine "${ACTIVE_PY}" -c "import MetaTrader5 as mt5; print('MetaTrader5 version:', mt5.__version__)" 2>/dev/null; then
    echo "================================================================="
    echo "  [SUCCESS] Isolated Wine + MT5 Environment Configured!"
    echo "  Python executable: ${ACTIVE_PY}"
    echo "  Wine Prefix:       ${ISOLATED_PREFIX}"
    echo "================================================================="
else
    echo "[WARN] MT5 installed but test import failed. Please verify with: wine \"${ACTIVE_PY}\" -c 'import MetaTrader5'"
fi

# Restart gateway service if it exists
if systemctl is-active --quiet tredyn-mt5-gateway 2>/dev/null; then
    systemctl restart tredyn-mt5-gateway
    echo "Restarted tredyn-mt5-gateway service."
fi
