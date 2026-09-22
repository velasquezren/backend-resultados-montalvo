#!/bin/bash
set -euo pipefail
umask 027
BASE=/opt/montalvo-resultados
RELEASE=$BASE/releases/20260921-portal-v1
HOSTNAME_RESULTADOS=resultados.107.175.132.15.nip.io
id resultados-web >/dev/null 2>&1 || useradd --system --home-dir /var/cache/resultados-web --create-home --shell /usr/sbin/nologin resultados-web
install -d -m 0755 "$BASE/releases" "$RELEASE"
tar -xzf /tmp/montalvo-resultados-release.tar.gz -C "$RELEASE"
cd "$RELEASE"
npm ci --ignore-scripts --cache /var/cache/resultados-npm > /var/log/resultados-build.log 2>&1
npm run build >> /var/log/resultados-build.log 2>&1
cd "$RELEASE/portal"
npm ci --ignore-scripts --cache /var/cache/resultados-npm >> /var/log/resultados-build.log 2>&1
npm run build >> /var/log/resultados-build.log 2>&1
python3 - <<'PY'
import secrets, subprocess, os
from pathlib import Path
base=Path('/etc/montalvo-resultados');api=base/'api.env'
if api.exists(): raise SystemExit('Configuración existente: no sobrescribir claves ni base')
dbpass=secrets.token_hex(32)
sql=f"CREATE ROLE resultados_app LOGIN PASSWORD '{dbpass}'; CREATE DATABASE resultados_prod OWNER resultados_app;"
subprocess.run(['runuser','-u','postgres','--','psql','-v','ON_ERROR_STOP=1'],input=sql,text=True,check=True,stdout=subprocess.DEVNULL)
values={'NODE_ENV':'production','HOST':'127.0.0.1','PORT':'3010','RESULTADOS_DATABASE_URL':f'postgresql://resultados_app:{dbpass}@127.0.0.1:5432/resultados_prod','SESSION_HMAC_KEY':secrets.token_hex(32),'CORS_ORIGINS':'https://resultados.107.175.132.15.nip.io','PATIENT_PORTAL_URL':'https://resultados.107.175.132.15.nip.io/resultados','STORAGE_DRIVER':'local-encrypted','STORAGE_ENCRYPTION_KEY':secrets.token_hex(32),'PRIVATE_STORAGE_DIR':'/var/lib/montalvo-resultados/files','CLAMAV_HOST':'127.0.0.1','CLAMAV_PORT':'3310','NOTIFICATION_DAILY_LIMIT':'100'}
api.write_text('\n'.join(k+'='+v for k,v in values.items())+'\n');os.chmod(api,0o600)
(base/'portal.env').write_text('NODE_ENV=production\nRESULTADOS_API_URL=http://127.0.0.1:3010\nPORTAL_ORIGIN=https://resultados.107.175.132.15.nip.io\n');os.chmod(base/'portal.env',0o600)
(base/'backup.key').write_text(secrets.token_hex(32)+'\n');os.chmod(base/'backup.key',0o600)
password=secrets.token_urlsafe(24)
Path('/root/resultados-acceso-inicial.txt').write_text('Portal: https://resultados.107.175.132.15.nip.io/\nUsuario: doctor@montalvo.com\nContraseña inicial: '+password+'\nCambiarla desde el portal después de ingresar.\n')
os.chmod('/root/resultados-acceso-inicial.txt',0o600)
Path('/root/resultados-initial-password').write_text(password);os.chmod('/root/resultados-initial-password',0o600)
PY
cd "$RELEASE"
node --env-file=/etc/montalvo-resultados/api.env node_modules/prisma/build/index.js migrate deploy >> /var/log/resultados-build.log 2>&1
node --env-file=/etc/montalvo-resultados/api.env dist/src/provisionar.js doctor@montalvo.com Doctor ADMIN < /root/resultados-initial-password > /var/log/resultados-admin.log 2>&1
# Eliminar solo la entrada temporal; el comprobante de acceso queda protegido.
rm /root/resultados-initial-password
chmod -R a+rX "$RELEASE"
ln -sfn "$RELEASE" "$BASE/current"
chmod 0755 "$BASE"
chown -R resultados-web:resultados-web "$RELEASE/portal/.next/cache" || true
cat > /etc/systemd/system/resultados-api.service <<UNIT
[Unit]
Description=API privada de resultados Montalvo
After=network.target postgresql.service clamav-daemon.service
[Service]
User=resultados
Group=resultados
WorkingDirectory=$BASE/current
EnvironmentFile=/etc/montalvo-resultados/api.env
ExecStart=/usr/bin/node dist/src/main.js
Restart=on-failure
RestartSec=5
MemoryMax=512M
CPUQuota=100%
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/montalvo-resultados/files
UMask=0077
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/resultados-portal.service <<UNIT
[Unit]
Description=Portal de resultados Montalvo
After=network.target resultados-api.service
[Service]
User=resultados-web
Group=resultados-web
WorkingDirectory=$BASE/current/portal
EnvironmentFile=/etc/montalvo-resultados/portal.env
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3011
Restart=on-failure
RestartSec=5
MemoryMax=512M
CPUQuota=100%
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$RELEASE/portal/.next/cache
UMask=0077
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now resultados-api resultados-portal
install -d -m 0755 /var/www/resultados-acme
cat > /etc/apache2/sites-available/resultados.conf <<VHOST
<VirtualHost *:80>
 ServerName $HOSTNAME_RESULTADOS
 DocumentRoot /var/www/resultados-acme
 <Directory /var/www/resultados-acme>
  Require all granted
 </Directory>
</VirtualHost>
VHOST
a2ensite resultados >/dev/null
apache2ctl configtest
systemctl reload apache2
certbot certonly --webroot -w /var/www/resultados-acme -d "$HOSTNAME_RESULTADOS" --non-interactive --agree-tos --register-unsafely-without-email > /var/log/resultados-certificado.log 2>&1
cat > /etc/apache2/sites-available/resultados-ssl.conf <<VHOST
<IfModule mod_ssl.c>
<VirtualHost *:443>
 ServerName $HOSTNAME_RESULTADOS
 Protocols h2 http/1.1
 SSLCertificateFile /etc/letsencrypt/live/$HOSTNAME_RESULTADOS/fullchain.pem
 SSLCertificateKeyFile /etc/letsencrypt/live/$HOSTNAME_RESULTADOS/privkey.pem
 Include /etc/letsencrypt/options-ssl-apache.conf
 ProxyPreserveHost On
 RequestHeader unset X-Real-IP
 RequestHeader set X-Real-IP expr=%{REMOTE_ADDR}
 ProxyPass / http://127.0.0.1:3011/
 ProxyPassReverse / http://127.0.0.1:3011/
 ProxyTimeout 100
 LimitRequestBody 11534336
 Header always set Strict-Transport-Security "max-age=31536000"
 ErrorLog \${APACHE_LOG_DIR}/resultados_error.log
 # No registrar URLs de acceso, códigos, cookies ni cuerpos clínicos.
 CustomLog \${APACHE_LOG_DIR}/resultados_access.log "%t %m %>s %b %D"
</VirtualHost>
</IfModule>
VHOST
cat > /etc/apache2/sites-available/resultados.conf <<VHOST
<VirtualHost *:80>
 ServerName $HOSTNAME_RESULTADOS
 DocumentRoot /var/www/resultados-acme
 <Directory /var/www/resultados-acme>
  Require all granted
 </Directory>
 RewriteEngine On
 RewriteCond %{REQUEST_URI} !^/.well-known/acme-challenge/
 RewriteRule ^ https://$HOSTNAME_RESULTADOS%{REQUEST_URI} [R=301,L]
</VirtualHost>
VHOST
a2enmod headers >/dev/null
a2ensite resultados-ssl >/dev/null
apache2ctl configtest
systemctl reload apache2
printf 'DESPLIEGUE_COMPLETO\n'
systemctl is-active resultados-api resultados-portal crm_backend
curl -fsS http://127.0.0.1:3010/health/ready
