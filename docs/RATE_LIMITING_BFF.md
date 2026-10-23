# Rate limiting del BFF

Control exclusivamente servidor para identificación y sesiones declarativas.
Cada combinación de endpoint e IP observada dispone de 30 admisiones durante
60 segundos desde la primera. Se comprueba antes de leer el cuerpo o gestionar
cookies: también consumen cuota las peticiones admitidas que posteriormente
fallen la validación o el backend. Un cierre sin cookie devuelve el `204`
histórico después de superar el control; si no lo supera, devuelve `429/503`.

## Redis existente e inspección

La conexión efectiva está en `src/features/visit-tracking/redis/redis.ts`:
`@upstash/redis` recibe `UPSTASH_REDIS_REST_URL` y
`UPSTASH_REDIS_REST_TOKEN`. Esos mismos valores y ese mismo SDK se reutilizan;
no hay otra base, proveedor, URL de conexión ni nombre de variable Redis.
No se leyeron valores de archivos privados ni se contactó el servicio.

El recorrido del conteo existente comprende:

- `src/app/layout.tsx`: monta el tracker.
- `src/components/VisitTracker.tsx`: actividad y registro de una visita nueva.
- `src/features/visit-tracking/ visit-session.ts` (nombre con espacio inicial),
  `src/features/visit-tracking/state/channel.ts`,
  `src/features/visit-tracking/state/ storage.ts` (espacio inicial) y
  `public/visit-worker.js`: coordinación de pestañas, estado local y journal.
- `src/features/visit-tracking/register-visit.ts`: solicitud a `/api/visits`.
- `src/app/api/visits/route.ts`: validación y exclusión de la Owner mediante
  `src/lib/owner-token.ts`, seguida de procesamiento Redis.
- `src/features/visit-tracking/redis/redis.ts`: cliente compartido de visitas.
- `src/features/visit-tracking/redis/process-visit.ts` y
  `process-visit-script.ts`: EVAL, idempotencia y conteo.
- `src/features/visit-tracking/redis/visit-state.ts`: claves de visitas.
- `src/app/api/visits/recovery/route.ts`,
  `src/features/visit-tracking/redis/recover-visit.ts`,
  `recover-visit-script.ts` y `recovery-sweep-guard.ts`: recuperación y barrido
  firmado mediante QStash.
- `scripts/generate-visit-report.mjs`: cliente del informe manual con las mismas
  variables Redis; no se ejecutó.

El limitador solo toca claves `rate-limiting:frontend:`. No lee ni modifica `visits:count`,
`visit:`, `visitretry:` o las claves de recuperación.

### Política del cliente

El cliente de visitas conserva exactamente su construcción y comportamiento.
Se agregó en el mismo módulo un getter con **una instancia reutilizada** del
mismo SDK y los mismos `url`/`token`, con `retry: { retries: 0 }`, timeout de
1500 ms por solicitud y sin autopipeline. No se crea una instancia por petición.

La instancia adicional es necesaria: el SDK instalado fija los reintentos por
cliente, no por EVAL, y visitas utiliza los valores por defecto. Además, en el
código instalado `retry: false` deja dos intentos; `retries: 0` deja uno. Cambiar
las opciones de la instancia compartida habría alterado visitas. Las pruebas
verifican la reutilización y un solo `fetch` ante error/timeout del SDK real.

## Operación atómica e identidades

| Método y ruta | ID privado fijo |
| --- | --- |
| `POST /api/usuarios/identificacion` | `post-usuarios-identificacion` |
| `POST /api/usuarios/sesiones` | `post-usuarios-sesiones` |
| `DELETE /api/usuarios/sesiones/actual` | `delete-usuarios-sesiones-actual` |

Clave: `rate-limiting:frontend:{idEndpoint}:{idIP}`, sin llaves literales.
`frontend` es un segmento literal fijo. Al desplegar este cambio se abre un
espacio de contadores nuevo, sin continuidad de las ventanas anteriores. Las
claves anteriores expiran naturalmente conforme a su TTL; no se migran ni se
modifican mediante esta implementación.

`idIP` es HMAC-SHA-256 hexadecimal con `RATE_LIMIT_IP_HASH_SECRET` y entrada
UTF-8 `conciencia-alimentaria:rate-limiting:ip:v1\n` seguida de la IP canónica.
IPv6 se normaliza y las direcciones IPv4 mapeadas se convierten a IPv4. Se
rechazan listas de direcciones, puertos, zonas IPv6 y valores inválidos.
Ni la IP, ni el HMAC, ni las claves se envían al navegador o se registran.

Una única llamada `EVAL` ejecuta `GET`, validación, decisión e incremento:
primera admisión mediante `SET ... PX 60000`; posteriores con `INCR`, que
conserva el TTL. Al llegar a 30, devuelve rechazo y `PTTL` sin escribir.
Estados inesperados (contador inválido o TTL ausente/fuera de rango) fallan
cerrado. No hay limpieza con temporizadores ni registros por solicitud.

La atomicidad procede de la ejecución del script en Redis, que impide
intercalar comandos de otras instancias. No depende de exclusión mutua en Node
ni de una secuencia de peticiones HTTP. Véanse
[EVAL del SDK Upstash](https://upstash.com/docs/redis/sdks/ts/commands/scripts/eval),
[scripts atómicos por HTTP en Upstash](https://upstash.com/blog/lua-scripting-on-upstash-redis-atomic-operations-over-http)
y [garantía de ejecución Lua de Redis](https://redis.io/docs/latest/develop/programmability/eval-intro/).

## IP observada y hosting

`trusted-ip.ts` es el adaptador reemplazable. Exige `VERCEL=1`,
`NODE_ENV=production` y `VERCEL_ENV=production` o `preview` (variables del
hosting, no nuevas credenciales). Lee exclusivamente `x-vercel-forwarded-for`.
La [documentación de Vercel](https://vercel.com/docs/headers/request-headers)
lo describe como equivalente al `x-forwarded-for` generado por la plataforma,
conservado ante sobreescrituras de este último; Vercel sobrescribe el header
externo para prevenir suplantación. El navegador no elige la identidad.

Esto requiere que las peticiones alcancen el handler a través del ingreso de
Vercel. Si se antepone otro proxy, la IP observada puede ser la de ese proxy:
no se afirma que sea la IP original del visitante ni se toma arbitrariamente
el primer elemento de una lista. Un proxy adicional exige revisar la cadena
de confianza y, si corresponde, una integración de proxy confiable del hosting.
No se inspeccionó ni cambió la configuración remota.

En `next dev`, `vercel dev` o fuera de ese entorno, el adaptador devuelve ausencia
de IP y el handler responde `503`, incluso si recibe headers con esos nombres.
Configurar el secreto local **no habilita por sí solo** estas operaciones.
No falsificar variables de plataforma para eludir este control.

Las pruebas locales usan reemplazos de módulos exclusivos del runner o una
simulación explícita de Vercel con `fetch` interceptado. Para habilitar uso local
manual haría falta un adaptador que obtenga la dirección real del socket en un
ingreso controlado y quite/sobrescriba los headers entrantes; un Route Handler
genérico no dispone de ese socket. Esa adaptación no se implementó. Al migrar
de hosting se reemplaza `trusted-ip.ts` y se prueba la nueva cadena de confianza;
no se cambia la política de cuota ni la derivación del HMAC.

## Respuestas y compatibilidad

- `429 BFF_LIMITE_SOLICITUDES`: cuota agotada; `Retry-After` es el techo de
  `PTTL / 1000` medido por Redis (mínimo un segundo).
- `503 BFF_CONTROL_SOLICITUDES_NO_DISPONIBLE`: falta IP/configuración, Redis
  falla/expira o el resultado es inválido o incierto. No lleva `Retry-After`.
- Ambas respuestas son `{codigo,mensaje}`, llevan `Cache-Control: no-store`,
  no llaman Spring Boot y no alteran cookies. Nunca hay reintento automático.
  Un timeout puede haber consumido cuota: no se afirma el resultado de Redis.
- El `429 DEMASIADAS_SOLICITUDES` histórico de identificación en Spring Boot
  conserva su código y su propio `Retry-After` validado.
- Tras admisión se conservan validaciones, errores, `201/204` sin cuerpo y
  cookies. El único cambio de presentación explica el `429` BFF en el cierre;
  registro/inicio ya reconocían `429`. Todos los errores conservan `ok: false`.

Los contratos se consultaron sin modificarlos. La descripción de límites de
Spring Boot en OpenAPI corresponde al canal BFF→backend y no prohíbe este
control anterior autorizado por el prompt. El contrato interno permite fallos
seguros de dependencias; no define una lista cerrada de códigos de error BFF.
La comprobación de cuota es la nueva precondición explícita de esta iteración.

## Configuración manual de la Owner

Variables privadas reutilizadas: `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN`. Única nueva: `RATE_LIMIT_IP_HASH_SECRET`.
`BACKEND_URL` y `BFF_SERVICE_SECRET` siguen siendo las del flujo existente.
No agregar prefijos `NEXT_PUBLIC_`. Usar el mismo secreto estable en todas las
instancias que comparten Redis; cambiarlo crea nuevas identidades y cuotas.

Ejemplo **para ejecutar manualmente**, no ejecutado por Codex: genera 32 bytes
aleatorios en hexadecimal en un archivo privado, fuera del repositorio, sin
imprimir el valor ni sobrescribir un archivo previo:

```bash
(
  umask 077
  set -C
  openssl rand -hex 32 > "$HOME/.ca-rate-limit-secret"
)
```

Abrir ese archivo en un editor local privado y copiar su contenido como valor
de `RATE_LIMIT_IP_HASH_SECRET` en `.env.local` y en las variables privadas de
Vercel del entorno correspondiente. Eliminar manualmente el archivo temporal
cuando ya no se necesite. No pegar el valor en comandos, chat, logs o commits.
La validación exige al menos 32 bytes de texto no vacío, pero esa longitud no
prueba entropía: usar el generador criptográfico. Codex no creó secretos ni
modificó `.env.local` o configuración remota.

## Verificación aislada ejecutada

Node `v24.15.0`. Comando con lista explícita y exclusión del caso histórico que
abre servidores HTTP locales:

```bash
env -u NODE_OPTIONS node --test --test-skip-pattern='una redirección local' \
  scripts/identificacion/rate-limit.test.mjs \
  scripts/identificacion/rate-limit-routes.test.mjs \
  scripts/identificacion/rate-limit-config.test.mjs \
  scripts/identificacion/route.test.mjs \
  scripts/identificacion/sesiones.test.mjs \
  scripts/identificacion/solicitudes.test.mjs
```

Resultado: **56 pruebas aprobadas**. Cubren cuota 30/31, ventanas, TTL sin
renovación, rechazo sin incremento, concurrencia de 200 solicitudes con cuatro
clientes simulados, independencia de IP/endpoint, equivalencia de IP, HMAC,
IP ausente/inválida, configuración ausente, fallos HTTP/red/timeout, resultados
inválidos, ausencia de backend/cambios de cookie en fallos y regresiones de
éxitos/errores históricos. Las suites históricas simulan admisión; la suite
nueva importa handlers y SDK reales e intercepta completamente el transporte.

También pasaron `node node_modules/typescript/bin/tsc --noEmit --incremental false`,
ESLint focalizado en todos los archivos de código modificados/creados y
`git diff --check`. Node avisó sobre detección de ESM en archivos `.ts` de un
paquete sin `type`; no fue un error y no se cambió la configuración del paquete.

El modelo Redis de las pruebas **no ejecuta Lua**: verifica la política y las
llamadas, no acredita el servidor remoto. Quedan sin verificar la ejecución de
Lua y concurrencia en Redis real, las cabeceras en un despliegue real, UI visual
y E2E. No se ejecutaron Spring Boot, JAR, PostgreSQL, Redis remoto ni Playwright.
No se ejecutó `npm run build`: su `prebuild` incluye suites ajenas a este alcance
y la compilación ordinaria carga archivos privados del proyecto. Se ejecutaron
las comprobaciones estáticas focalizadas indicadas.

## Archivos de esta implementación

Modificados:

- `.env.example`.
- `src/features/visit-tracking/redis/redis.ts`.
- `src/app/api/usuarios/identificacion/route.ts`.
- `src/app/api/usuarios/sesiones/route.ts`.
- `src/app/api/usuarios/sesiones/actual/route.ts`.
- `src/components/identificacion/solicitudes.ts`.
- `scripts/identificacion/route.test.mjs`.
- `scripts/identificacion/sesiones.test.mjs`.
- `scripts/identificacion/solicitudes.test.mjs`.

Creados:

- `src/features/rate-limiting/ip.ts`.
- `src/features/rate-limiting/trusted-ip.ts`.
- `src/features/rate-limiting/script.ts`.
- `src/features/rate-limiting/limit.ts`.
- `src/features/rate-limiting/guard.ts`.
- `scripts/identificacion/rate-limit-test-modules.mjs`.
- `scripts/identificacion/rate-limit-admitted-stub.mjs`.
- `scripts/identificacion/rate-limit.test.mjs`.
- `scripts/identificacion/rate-limit-routes.test.mjs`.
- `scripts/identificacion/rate-limit-config.test.mjs`.
- `docs/RATE_LIMITING_BFF.md`.

Sin archivos eliminados. El cambio preexistente de `AGENTS.md` pertenece a la
Owner y se preservó. Contratos y scripts científicos intactos; sin Git mutante,
nuevas dependencias o despliegue.

## Límites

Personas, pestañas y navegadores detrás de una misma IP (NAT/VPN/proxy)
comparten cuota. IPs cambiantes permiten abrir otras cuotas; esto no identifica
ni autentica personas. Redis recibe cada comprobación, incluso los rechazos.
El control por IP **no garantiza la capacidad global** del backend. La cuota
global compartida entre instancias de Spring Boot queda pendiente de otra tarea.
