ENV VARS A SETEAR

ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_ROLE=OWNER.



# Reiniciar solo el contenedor admin (Podman)

podman compose -f infra/compose/[dev.no](http://dev.no)-print.yml restart admin

# Alternativa si el alias de compose no está disponible

docker-compose -f infra/compose/[dev.no](http://dev.no)-print.yml restart admin

Y en un caso previo, para forzar recreación:

docker-compose -f infra/compose/[dev.no](http://dev.no)-print.yml up -d --force-recreate admin