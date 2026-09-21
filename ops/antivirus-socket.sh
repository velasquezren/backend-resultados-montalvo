set -euo pipefail
install -d /etc/systemd/system/clamav-daemon.socket.d
cat > /etc/systemd/system/clamav-daemon.socket.d/resultados.conf <<'SOCKET'
[Socket]
ListenStream=127.0.0.1:3310
SOCKET
systemctl stop clamav-daemon.service clamav-daemon.socket
systemctl daemon-reload
systemctl start clamav-daemon.socket clamav-daemon.service
systemctl is-active clamav-daemon.service clamav-daemon.socket
