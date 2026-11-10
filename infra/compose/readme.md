ENV VARS A SETEAR

ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_ROLE=OWNER.



DB_PASSWORD=... DB_NAME=apolonia DB_USER=laverdu \\

     podman compose -f infra/compose/prod.yml up -d --build

podman exec la-verdu-prod-api-1 node apps/api/dist/src/db/migrate.js

podman exec la-verdu-prod-api-1 sh -c "BUSINESS_NAME='Apolonia' node apps/api/dist/src/db/seed.js"

podman exec la-verdu-prod-api-1 wget -qO- [http://127.0.0.1:3000/health/ready](http://127.0.0.1:3000/health/ready)

podman exec la-verdu-prod-api-1 wget -qO- [http://127.0.0.1:3000/admin/business](http://127.0.0.1:3000/admin/business)



&nbsp;

\`\`\`bash

# Sin exponer API por Tailscale

sudo /opt/la-verdu/scripts/[configure-firewall.sh](http://configure-firewall.sh)

# Exponiendo API solo en Tailscale

sudo EXPOSE_API_TAILSCALE=true /opt/la-verdu/scripts/[configure-firewall.sh](http://configure-firewall.sh)

# Forzar SSH público (sin Tailscale)

sudo ALLOW_SSH_PUBLIC=true /opt/la-verdu/scripts/[configure-firewall.sh](http://configure-firewall.sh)

\`\`\`

# Reiniciar solo el contenedor admin (Podman)

podman compose -f infra/compose/[dev.no](http://dev.no)-print.yml restart admin

# Alternativa si el alias de compose no está disponible

docker-compose -f infra/compose/[dev.no](http://dev.no)-print.yml restart admin

Y en un caso previo, para forzar recreación:

docker-compose -f infra/compose/[dev.no](http://dev.no)-print.yml up -d --force-recreate admin
