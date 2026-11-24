#!/usr/bin/env bash
# ubuntu-setup.sh — Safe Operator Host Provisioner for Tredyn MT5 Gateway
#
# Usage:
#   bash ubuntu-setup.sh --check     # Dry-run audit (does not make any system changes)
#   sudo bash ubuntu-setup.sh        # Install and register the systemd service

set -euo pipefail

TARGET_DIR="/opt/tredyn-mt5"
ENV_FILE="${TARGET_DIR}/.env"
SERVICE_FILE="/etc/systemd/system/tredyn-mt5-gateway.service"

echo "================================================================="
echo "  Tredyn · GHR v3.2 — Ubuntu MT5 Gateway Provisioner"
echo "  Safe Operator & Zero-Disruption Specification"
echo "================================================================="

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    echo "Usage:"
    echo "  bash ubuntu-setup.sh --check    Inspect server & check existing MT5 without changes"
    echo "  sudo bash ubuntu-setup.sh       Deploy gateway to ${TARGET_DIR} with systemd"
    exit 0
fi

if [[ "${1:-}" == "--check" ]]; then
    echo "[AUDIT] Checking server environment without making changes..."
    echo "1. Host Architecture: $(uname -m)"
    echo "2. Kernel Version:     $(uname -r)"
    echo "3. Python3 Version:    $(python3 --version 2>&1 || echo 'Not found')"
    echo "4. Wine Status:        $(which wine64 2>/dev/null || which wine 2>/dev/null || echo 'Not installed')"
    
    # Check for existing MT5 processes
    if pgrep -fa "terminal64.exe" 2>/dev/null; then
        echo "[INFO] Detected actively running MT5 processes:"
        pgrep -fa "terminal64.exe"
    else
        echo "[INFO] No running terminal64.exe process detected."
    fi

    # Scan for existing MT5 directories
    EXISTING_MT5=$(find /root /home /opt -maxdepth 5 -name "terminal64.exe" 2>/dev/null | head -n 3 || true)
    if [[ -n "${EXISTING_MT5}" ]]; then
        echo "[INFO] Found existing MT5 binaries on server:"
        echo "${EXISTING_MT5}"
        echo "--> You can pass this path to MT5_PATH in ${ENV_FILE} to preserve your setup."
    else
        echo "[INFO] No existing MT5 binaries detected in standard paths."
    fi
    exit 0
fi

if [[ $EUID -ne 0 ]]; then
   echo "[ERROR] Installation requires root privileges. Please run: sudo bash ubuntu-setup.sh"
   exit 1
fi

mkdir -p "${TARGET_DIR}"

echo "[Step 1/5] Auditing for existing MT5 installations on server..."
EXISTING_MT5=$(find /root /home /opt -maxdepth 5 -name "terminal64.exe" 2>/dev/null | head -n 1 || true)
EXISTING_PATH_NOTE=""
if [[ -n "${EXISTING_MT5}" ]]; then
    echo "[PRESERVATION] Detected existing MT5 at: ${EXISTING_MT5}"
    echo "              The gateway will NOT overwrite or alter this installation."
    EXISTING_PATH_NOTE="${EXISTING_MT5}"
fi

echo "[Step 2/5] Deploying ghr_mt5_investor_gateway.py to ${TARGET_DIR}..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/ghr_mt5_investor_gateway.py" ]]; then
    cp "${SCRIPT_DIR}/ghr_mt5_investor_gateway.py" "${TARGET_DIR}/ghr_mt5_investor_gateway.py"
elif [[ ! -f "${TARGET_DIR}/ghr_mt5_investor_gateway.py" ]]; then
    echo "[ERROR] Cannot locate ghr_mt5_investor_gateway.py in ${SCRIPT_DIR}."
    exit 1
fi
chmod 644 "${TARGET_DIR}/ghr_mt5_investor_gateway.py"

echo "[Step 3/5] Configuring secure environment & authentication secret..."
if [[ ! -f "${ENV_FILE}" ]]; then
    GENERATED_TOKEN=$(head -c 24 /dev/urandom | xxd -p 2>/dev/null || openssl rand -hex 24 2>/dev/null || tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 48)
    cat << EOF > "${ENV_FILE}"
# Tredyn MT5 Gateway Configuration
# Bound to 127.0.0.1 by default for security (use SSH Port Forwarding or HTTPS)
BIND_HOST=127.0.0.1
PORT=8765

# Pre-Shared Authentication Token (Required for all sync operations)
GATEWAY_TOKEN=${GENERATED_TOKEN}

# Existing MT5 terminal path (leave blank to use default isolated Wine environment)
MT5_PATH=${EXISTING_PATH_NOTE}

# Isolated Wine Prefix (ensures existing ~/.wine is untouched)
WINEPREFIX=/opt/tredyn-mt5/.wine_isolated
WINE_PYTHON=/opt/tredyn-mt5/.wine_isolated/drive_c/Python311/python.exe
XVFB_DISPLAY=:99
EOF
    chmod 600 "${ENV_FILE}"
    echo "Generated new GATEWAY_TOKEN in ${ENV_FILE}"
else
    echo "Existing configuration found in ${ENV_FILE} (preserved)."
fi

TOKEN=$(grep -E "^GATEWAY_TOKEN=" "${ENV_FILE}" | cut -d'=' -f2- || true)

echo "[Step 4/5] Registering systemd daemon service..."
cat << EOF > "${SERVICE_FILE}"
[Unit]
Description=Tredyn · GHR v3.2 MT5 Gateway Daemon
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${TARGET_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/python3 ${TARGET_DIR}/ghr_mt5_investor_gateway.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable tredyn-mt5-gateway
systemctl restart tredyn-mt5-gateway

echo "[Step 5/5] Verifying local service health..."
sleep 2
if curl -s "http://127.0.0.1:8765/health" | grep -q "Tredyn MT5 Gateway"; then
    echo "[SUCCESS] Gateway daemon is active and responding on 127.0.0.1:8765."
else
    echo "[WARN] Gateway started, but health check did not return expected response. Check logs: journalctl -u tredyn-mt5-gateway -n 20"
fi

echo "================================================================="
echo "  [INSTALLATION COMPLETE] — Safe Operator Instructions:"
echo "================================================================="
echo "1. Security Recommendation (Never send Investor Password via unencrypted HTTP):"
echo "   On your local PC, create a secure SSH tunnel:"
echo "   ssh -N -L 8765:127.0.0.1:8765 user@YOUR_VPS_IP"
echo ""
echo "   Then in the web app, connect to:"
echo "   URL:   http://127.0.0.1:8765/sync"
echo "   Token: ${TOKEN}"
echo ""
echo "2. If your server does not yet have Wine/MT5 installed, run the isolated installer:"
echo "   sudo bash ${SCRIPT_DIR}/install_wine_mt5.sh"
echo "================================================================="
