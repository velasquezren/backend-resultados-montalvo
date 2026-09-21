#!/bin/bash
set -euo pipefail
cat > /usr/local/sbin/montalvo-resultados-backup <<'BACKUP'
#!/bin/bash
set -euo pipefail
umask 077
DEST=/root/backups-resultados/$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$DEST"
runuser -u postgres -- pg_dump -Fc resultados_prod | openssl enc -aes-256-cbc -pbkdf2 -salt -pass file:/etc/montalvo-resultados/backup.key -out "$DEST/base.dump.enc"
tar -C /var/lib/montalvo-resultados -cf - files | openssl enc -aes-256-cbc -pbkdf2 -salt -pass file:/etc/montalvo-resultados/backup.key -out "$DEST/archivos.tar.enc"
sha256sum "$DEST/base.dump.enc" "$DEST/archivos.tar.enc" > "$DEST/SHA256SUMS"
# Validar ambos contenedores sin imprimir contenido clínico.
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:/etc/montalvo-resultados/backup.key -in "$DEST/base.dump.enc" | pg_restore --list > /dev/null
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:/etc/montalvo-resultados/backup.key -in "$DEST/archivos.tar.enc" | tar -tf - > /dev/null
printf 'Copia verificada: %s\n' "$DEST"
BACKUP
chmod 0700 /usr/local/sbin/montalvo-resultados-backup
cat > /etc/systemd/system/resultados-backup.service <<'UNIT'
[Unit]
Description=Copia cifrada de resultados Montalvo
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/montalvo-resultados-backup
Nice=15
CPUQuota=50%
UMask=0077
UNIT
cat > /etc/systemd/system/resultados-backup.timer <<'UNIT'
[Unit]
Description=Copia diaria de resultados Montalvo
[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true
RandomizedDelaySec=600
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now resultados-backup.timer
/usr/local/sbin/montalvo-resultados-backup
