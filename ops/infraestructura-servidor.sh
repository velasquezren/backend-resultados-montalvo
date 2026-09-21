#!/bin/bash
set -euo pipefail
umask 027
export DEBIAN_FRONTEND=noninteractive
apt-get update > /var/log/resultados-instalacion.log 2>&1
apt-get install -y clamav-daemon clamav-freshclam >> /var/log/resultados-instalacion.log 2>&1
id resultados >/dev/null 2>&1 || useradd --system --home-dir /var/lib/montalvo-resultados --create-home --shell /usr/sbin/nologin resultados
install -d -m 0750 -o resultados -g resultados /var/lib/montalvo-resultados /var/lib/montalvo-resultados/files /opt/montalvo-resultados
install -d -m 0750 -o root -g resultados /etc/montalvo-resultados
install -d -m 0700 /root/backups-resultados
cp -n /etc/clamav/clamd.conf /etc/clamav/clamd.conf.antes-resultados || true
python3 - <<'PY'
from pathlib import Path
p=Path('/etc/clamav/clamd.conf')
settings={'TCPAddr':'127.0.0.1','TCPSocket':'3310','StreamMaxLength':'12M','MaxFileSize':'12M','MaxScanSize':'32M','MaxThreads':'2','MaxQueue':'4','AlertExceedsMax':'yes'}
lines=[line for line in p.read_text().splitlines() if not any(line.startswith(key+' ') for key in settings)]
p.write_text('\n'.join(lines)+'\n'+'\n'.join(key+' '+value for key,value in settings.items())+'\n')
PY
install -d /etc/systemd/system/clamav-daemon.service.d
cat > /etc/systemd/system/clamav-daemon.service.d/resultados.conf <<'UNIT'
[Service]
MemoryMax=2G
CPUQuota=75%
Nice=10
UNIT
systemctl daemon-reload
systemctl enable --now clamav-freshclam
systemctl restart clamav-daemon || true
printf 'INFRAESTRUCTURA_PREPARADA\n'
systemctl is-active clamav-freshclam || true
ls -lh /var/lib/clamav/*.c*d 2>/dev/null || true
