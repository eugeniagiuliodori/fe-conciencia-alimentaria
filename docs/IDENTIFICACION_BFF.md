# Identificación declarativa por correo

El componente «Identificación por correo» envía JSON con `fetch` a
`POST /api/usuarios/identificacion` del mismo origen.
El Route Handler en `src/app/api/usuarios/identificacion/route.ts` hace el único
salto a Spring Boot, al path fijo del
[contrato v1](../contracts/CONTRATO_API_IDENTIFICACION_V1.yaml).

El formulario está habilitado en la aplicación. Las pruebas lo localizan por su
rol y nombre accesible, y comprueban sus controles sin depender de la sección o
componente que lo contiene.

El repositorio no tiene un `serviceProxy` HTTP existente: las funciones de lectura,
configuración y traducción de respuestas se mantienen dentro de este handler
específico. No se agregan dependencias.

Es una declaración de correo: no verifica la titularidad, no autentica ni crea
sesiones o permisos. El backend busca o crea y convierte **toda** la dirección a minúsculas.
El aviso previo al envío explica la posible incompatibilidad con proveedores que
distinguen mayúsculas en la parte local. La confirmación es neutra y solo se muestra
ante `204`. El formulario guarda el valor únicamente en memoria y lo vacía al
recibir ese estado; no lo escribe en cookies ni almacenamiento del navegador.
Ante un error, conserva el texto para corregirlo o reintentar manualmente. Muestra
mensajes accesibles de validación, límite de solicitudes, servicio no disponible
y timeout, incluido el tiempo de espera agotado en el propio navegador.

## Configuración local

Agregar a `.env.local` el origen real de Spring Boot y el secreto compartido
generado fuera de las aplicaciones. `.env.example` contiene solo el nombre de
la variable y ningún valor de credencial. Ejemplo de estructura sin secreto:

```dotenv
BACKEND_URL=http://localhost:8080
BFF_SERVICE_SECRET=
```

- Si `.env.local` ya existe, preservar todas las demás entradas y su destino configurado.
- `.gitignore` excluye `.env*`, salvo `.env.example` y `.env.integracion.example`.
  Verificarlo con `git check-ignore .env.local`; nunca versionar el archivo local.
- Next.js carga `.env.local` automáticamente con `npm run dev`; no se necesita
  exportar variables en la terminal. Reiniciar el servidor si se cambia el destino.
- `BACKEND_URL` y `BFF_SERVICE_SECRET` se leen exclusivamente en el Route Handler.
  No usar `NEXT_PUBLIC_` ni enviar el secreto desde el navegador.
- Se admite un origen HTTPS con host y puerto, sin path adicional, query,
  fragmento ni credenciales. HTTP solo se admite en desarrollo/pruebas con
  `localhost`, `127.0.0.1` o `::1`. En producción se exige HTTPS.
  Una URL inválida o un secreto ausente o vacío devuelve `503` sin llamar al backend.
- Configurar ambas variables privadas en el hosting de producción. La credencial
  debe coincidir con la aceptada por Spring Boot. Esta iteración no despliega ni
  configura infraestructura.
- Para rotarla manualmente sin corte: primero hacer que el backend acepte la
  credencial anterior y la nueva, luego cambiar la del BFF y finalmente retirar
  la anterior del backend. No hay rotación automática.

## Arranque local para preparar integración

Crear manualmente `.env.integracion.local` a partir de `.env.integracion.example`,
completar `BFF_SERVICE_SECRET` con el valor de prueba acordado para el backend
local y ajustar su puerto en `BACKEND_URL` si corresponde. El archivo real está
ignorado por Git. No copiar el ejemplo encima de `.env.local` ni compartir la
credencial. Iniciar desde este repositorio con:

```bash
npm run dev:integracion
```

Detener con `Ctrl+C`. El lanzador usa Node 24 y `next dev --webpack` en modo development,
escuchando en `127.0.0.1`. Antes del arranque exige un archivo legible, las dos
variables no vacías y un origen HTTP local (`localhost`, `127.0.0.1` o `::1`),
sin path, parámetros ni credenciales. Sus errores no imprimen valores. Copia
el entorno al proceso hijo, elimina los dos valores heredados y aplica los del
archivo de integración. Si falta alguno, termina sin iniciar Next.js, aunque
exista en la terminal o en `.env.local`.

Next.js sigue cargando automáticamente `.env.development.local`, `.env.local`,
`.env.development` y `.env` para **otras** variables. Para las dos variables del
BFF prevalecen las ya asignadas al proceso hijo; se comprobó con el cargador
`@next/env` de la versión instalada. Este comando no aísla todas las variables
de la aplicación ni convierte el servidor en una prueba de Spring Boot o de
PostgreSQL. El desarrollo ordinario continúa con `npm run dev` y `.env.local`.

## Integración HTTP real opt-in con JAR y PostgreSQL de pruebas

`npm run test:integracion` ejecuta un orquestador separado; no forma parte de
`prebuild`, `build`, `test:ci` ni `test:e2e`. No compila ni busca el backend.

Preparación manual:

1. Preparar manualmente un JAR ejecutable precompilado del backend y copiarlo,
   por ejemplo, a `integration/backend/be-conciencia-alimentaria-0.0.1-SNAPSHOT.jar`
   dentro de este frontend. Este comando no busca ni compila fuentes Java.
2. Copiar `integration/application-test.example.yml` a
   `integration/backend/application-test.yml`, separado del JAR. Conservar las tres
   referencias `${TEST_DB_*}` y `ddl-auto: none`. Se admiten además
   `spring.datasource.hikari.connection-timeout` positivo,
   `spring.jpa.show-sql` booleano, `spring.sql.init.mode: never` y niveles de
   `logging.level.*`; se rechazan otras propiedades y overrides del datasource.
3. En `.env.integracion.local` (privado, ignorado por Git), definir
   `BACKEND_URL` con `localhost` o `127.0.0.1` y el puerto del JAR, un
   `BFF_SERVICE_SECRET` **sintético** aceptado por ese JAR,
   `BACKEND_JAR_PATH=./integration/backend/be-conciencia-alimentaria-0.0.1-SNAPSHOT.jar`
   y `BACKEND_TEST_CONFIG_PATH=./integration/backend/application-test.yml` como
   ejemplo. Las rutas pueden ser absolutas o relativas a la raíz de este
   frontend; los archivos deben estar fuera de `public/`.
   `integration/backend/` está excluida de Git y Vercel.
   `INTEGRATION_FRONTEND_PORT` es opcional (3100).
   `dev:integracion` sigue exigiendo solo URL y secreto.
4. En la terminal, configurar `TEST_DB_URL`, `TEST_DB_USERNAME` y
   `TEST_DB_PASSWORD` para una instancia PostgreSQL local de pruebas.
   `TEST_DB_URL` debe ser JDBC PostgreSQL con host loopback (`localhost`,
   `127.0.0.1` o `::1`), puerto y nombre de base explícitos, sin parámetros.
   Configurar `TEST_DB_EXPECTED_NAME` con el nombre exacto de esa base; el sufijo
   `_test` no es obligatorio.
   Usar un rol dedicado y no privilegiado. Tener `CONNECT` potencial sobre otra
   base no demuestra que este JAR la utilice; el destino efectivo se comprueba
   antes de cada POST. No incluir credenciales en archivos
   versionados ni en argumentos de comandos. Esta suite requiere `psql` y,
   para verificar los listeners y sockets propios, Linux con `ss` y `/proc`.
   El runtime `java` debe ser compatible con la versión declarada por el JAR.
5. Comprobar que el JAR usa la credencial sintética, que PostgreSQL es una
   instancia de pruebas, que el rol puede escribir solo en esa base y que
   los registros sintéticos pueden permanecer allí. Ejecutar
   `npm run test:integracion`; el orquestador verifica la conexión efectiva
   del JAR antes de cada POST y aborta si no puede identificarla.

Antes de iniciar servicios, el comando valida el archivo de integración, el
JAR y el YAML externo a él, variables y destinos locales, y puertos
libres. Usa `spring.config.location` con el archivo externo (reemplaza las
ubicaciones predeterminadas de configuración de Spring Boot), perfil `test`,
`ddl-auto=none`, puerto y dirección de escucha explícitos. Comprueba que no haya
una variante `application-test-test.*` capaz de sobrescribir el YAML cuando se
activa ese perfil. Las opciones de línea de comandos tienen mayor precedencia
que el archivo; el entorno aislado no hereda overrides del datasource. No depende de que
`src/test/resources` esté dentro del JAR. El entorno del proceso Java contiene
solo las variables `TEST_DB_*` necesarias, el secreto sintético y variables
básicas de ejecución; se excluyen `DB_*`, `SPRING_DATASOURCE_*`,
`SPRING_APPLICATION_JSON`, opciones Java heredadas y credenciales ajenas.
Se ejecuta una consulta PostgreSQL **solo lectura** con `psql`, el mismo
destino y credenciales: confirma base y rol esperados, sin privilegios elevados.
La consulta verifica que la transacción esté efectivamente en modo solo lectura.
El permiso `CONNECT` sobre otras bases no es un veto automático: por sí mismo
no identifica el destino usado por la aplicación.

Tras readiness por GET con timeout, se confirma que cada puerto pertenece al
proceso propio o a uno de sus descendientes. Antes de iniciar Next.js y antes
de cada POST, `ss` identifica los sockets TCP del proceso Java propio. Una consulta
solo lectura a `pg_stat_activity` vincula la dirección y el puerto de origen de
cada conexión saliente con una sesión de la base y el rol esperados. Se usa
`host(client_addr)` para comparar direcciones sin sufijos de máscara. Se exige
al menos una conexión observada y ninguna conexión saliente a otro destino;
si faltan datos, permisos o coincidencias inequívocas, el comando aborta sin POST.
Esta observación comprueba conexiones activas en ese momento; no certifica que
el JAR carezca de otros datasources que solo se abran más tarde.

El cliente de pruebas hace dos POST del
mismo correo aleatorio `example.com` al BFF real y exige `204` sin cuerpo.
Después reinicia solo el BFF con una credencial sintética incorrecta para
verificar que el rechazo del backend real se convierte en `502` genérico sin
filtrar datos. El segundo arranque usa las mismas reglas de aislamiento de
`dev:integracion` con la única sustitución controlada del secreto para este
escenario. Se detienen los grupos de procesos creados por el orquestador.
Nunca se reutilizan puertos ocupados ni se terminan procesos ajenos.

La respuesta `204` comprueba el contrato HTTP, **no** prueba la persistencia.
Esta suite no consulta tablas de usuarios ni elimina registros: desconoce su
esquema y no dispone de una operación de limpieza segura. Los correos
sintéticos pueden quedar en la base de pruebas. El preflight de `psql` por sí solo
no prueba el datasource del JAR; la correlación posterior con su socket aporta
evidencia de la conexión efectiva observada antes del POST. Tampoco se prueba
la normalización ni los límites de frecuencia del backend.

## Comportamiento HTTP

El handler acepta únicamente `application/json` (también con parámetros como
`charset=utf-8`) con una única propiedad `email` de tipo string. Comprueba formato
básico y un máximo de 254 caracteres tras quitar espacios externos; la validación
y normalización final sigue perteneciendo al backend. Rechaza también caracteres
de control dentro del correo, aunque no sean espacios. No añade equivalencias
entre direcciones ni convierte a minúsculas en el frontend.

La lectura del stream está limitada a **2048 bytes reales**, incluso si falta
`Content-Length` o declara menos bytes. Un cuerpo mayor devuelve `413`; un cuerpo
vacío, malformado, de tipo incorrecto o con propiedades extra devuelve `400`.
Un medio distinto de JSON devuelve `415`.

| Respuesta o situación | Respuesta del BFF |
| --- | --- |
| Spring Boot devuelve `204` | `204` sin cuerpo |
| Spring Boot devuelve `400`, `413`, `415`, `429` | Mismo estado y `{ codigo, mensaje }` propios |
| `429` con `Retry-After` | Solo se copia si son segundos enteros positivos representables con precisión |
| Spring Boot rechaza el token técnico con `401` o `403` | `502` genérico, sin tratarlo como error de email |
| Error de red, `5xx`, redirección u otro estado fuera del contrato | `502` genérico, sin afirmar que la operación no se procesó |
| Timeout del upstream, a los 5 segundos | `504` sin afirmar éxito ni fracaso definitivo de la operación en Spring Boot |
| `BACKEND_URL` inválida o `BFF_SERVICE_SECRET` ausente o vacío | `503` genérico, sin POST al backend |

No se leen ni reproducen cuerpos del upstream. El BFF agrega exactamente una
cabecera `X-Service-Token` al POST hacia el destino fijo con el valor opaco original
del entorno servidor. Ignora cualquier cabecera homónima enviada por el cliente;
no reenvía cookies, `Authorization`, `X-Forwarded-For`, destinos, paths ni otros
encabezados elegidos por este. Tampoco se siguen redirecciones del upstream:
el token no se envía a un segundo destino. Todas las respuestas del
handler llevan `Cache-Control: no-store`, y ambos `fetch` desactivan caché y omiten
credenciales. No hay logs de correo, configuración o errores internos. El navegador
deja de esperar a los 10 segundos; no hay reintentos automáticos.
Si se pierde la conexión o vence el plazo, el backend podría haber persistido la
operación. Un error de comunicación no confirma éxito ni ausencia de registro.

## Verificación

Pruebas deterministas del Route Handler con `node:test` y `tsx`, ambos ya disponibles:

```bash
node --import tsx --test scripts/identificacion/*.test.mjs
```

Cubren validación, límites de bytes y lectura interrumpida, `204`, errores
contractuales, `429` y `Retry-After`, redirecciones, fallo de red, timeout,
configuración ausente, destino fijo y ausencia de IDs, cookies, secretos y logs.
Comprueban además la cabecera técnica única, el rechazo controlado ante secreto
ausente o vacío, los `401`/`403` técnicos y la redirección real entre dos servidores
locales sin reenvío del token.
Comprueban que un envío inicial y su repetición reciben el mismo `204` vacío, sin
inferir si el backend creó un registro. Incluyen caracteres de control, `charset`
UTF-8 con y sin comillas, límites con `Content-Length` correcto o no fiable y una
sola llamada upstream por solicitud, incluso ante errores.
También comprueban que un cuerpo upstream incompleto se descarta sin consumirlo
ni esperar una cancelación que no termina. Los errores públicos deben tener
`Content-Type: application/json`, solo `codigo` y `mensaje`, y no divulgar SQL,
trazas, configuración ni diagnósticos sintéticos en el cuerpo o los encabezados.
No requieren Spring Boot, base de datos ni credenciales reales. Las solicitudes y
respuestas son sintéticas y no consumen servicios reales. No cargan `.env.local`;
cada test restaura el entorno y los mocks al terminar.

Comprobaciones del repositorio:

```bash
npm run lint
./node_modules/.bin/tsc --noEmit --incremental false
npm run test:fichas
npm run build
```

No hay scripts `typecheck` ni `test` general en `package.json`; el typecheck usa el
compilador instalado. La prueba real con Spring Boot exige que el servicio
configurado **y su base de datos** estén disponibles. Los mocks no verifican la
normalización, persistencia, concurrencia ni rate limiting del backend real.

## Suite E2E con Playwright Test

El paquete `playwright` instalado ya incluye el runner `playwright/test`; no se
añade otro framework ni una dependencia nueva. El comando independiente es:

```bash
npm run test:e2e
```

No requiere un build previo ni servicios levantados. Copia el código y la
configuración de Next.js a un directorio temporal, reutiliza las dependencias
instaladas y los recursos públicos e inicia `next dev --webpack`. Webpack permite
resolver las dependencias enlazadas desde ese directorio. Se comprueba el código
actual, independientemente de la antigüedad de `.next`.

El servidor de prueba recibe únicamente el entorno mínimo, una `BACKEND_URL`
generada para el servidor HTTP simulado y un token sintético coincidente entre
BFF y simulador. El simulador comprueba una sola cabecera correcta sin conservar
el valor ni el correo recibidos en sus resultados. No hereda credenciales ni
busca, lee o copia los `.env*` del repositorio. Ambos servidores escuchan en loopback con
puertos asignados dinámicamente; las fixtures cierran procesos, conexiones
retenidas y directorios temporales incluso cuando falla un test.

Cada caso tiene contexto de navegador y estado del upstream independientes. No
hay reintentos del runner. Las respuestas demoradas se liberan mediante una
condición observable; los timeouts nativos de 5 y 10 segundos se verifican sin
reemplazarlos ni introducir pausas arbitrarias.

La suite conserva los escenarios del script de navegador anterior, ahora como
16 casos independientes. Las 21 pruebas del BFF se mantienen aparte.

| Clasificación | Casos |
| --- | --- |
| HTTP local: Next.js/BFF real + upstream simulado | Endpoint fijo, JSON contractual y `204` vacío |
| UI real, con BFF real cuando se envía | Acceso y teclado dentro del formulario, aviso declarativo, disposición responsive, validación nativa, carga/doble envío, confirmación neutra y privacidad; errores upstream `400`, `413`, `415`, `429`, `500`, `200` inesperado, desconexión y timeout |
| UI con BFF interceptado | Conexión navegador–BFF interrumpida, timeout del navegador y `503` simulado |

El formulario y el handler son los de la aplicación. El único servicio externo
de identificación simulado es Spring Boot. Además se intercepta el tracking
preexistente para no escribir en Redis y se bloquean solicitudes externas del
navegador. Las pruebas de privacidad comprueban solo el correo y las cookies
observables en ese contexto de navegador; no auditan la persistencia interna del
servidor ni toda la aplicación.

`playwright.config.ts` desactiva trazas, capturas y videos. No se genera reporte
HTML; el reporter de consola oculta correos en diagnósticos y omite adjuntos y
código fuente. Se desactiva el snapshot ARIA automático de fallos y
`preserveOutput: "never"` elimina los diagnósticos temporales. `reports/e2e`, ya
ignorado por Git, solo puede conservar metadatos de ejecución sin direcciones.

Se usa Chromium en modo headless. Si no está descargado, la configuración intenta
usar Chrome instalado. Para instalar el navegador de Playwright manualmente:

```bash
npx --no-install playwright install chromium
```

También puede seleccionarse Chrome explícitamente:

```bash
E2E_BROWSER_CHANNEL=chrome npm run test:e2e
```

Si faltan bibliotecas del sistema, el error de lanzamiento lo indicará; el comando
E2E no instala paquetes del sistema ni solicita privilegios. La ejecución habitual
no requiere internet una vez instaladas las dependencias y el navegador.

Para seleccionar casos:

```bash
npm run test:e2e -- --list
npm run test:e2e -- --grep 'HTTP local'
npm run test:e2e -- --grep 'BFF interceptado'
```

`node scripts/playwright/identificacion.mjs` se conserva como entrada compatible
y delega al mismo runner. No hay una segunda implementación del servidor de pruebas.

El helper `openForm` de `scripts/playwright/e2e/identificacion.spec.ts` concentra
el acceso inicial y la reapertura: actualmente navega al inicio. Si el formulario
pasa a un modal, solo habrá que adaptar ese acceso al disparador real del modal.
Las comprobaciones se limitan al formulario con nombre «Identificación por correo»
y sus etiquetas y roles; no buscan su sección, menú ni contenedor padre. El test
de teclado comprueba el recorrido entre sus controles, y el responsive mide el
formulario y el campo. No se implementa ni se afirma haber probado un modal futuro.
El caso HTTP local es independiente de la UI.

`prebuild` llama a `test:ci`, que ejecuta con el runner nativo de Node.js las
suites `test:fichas` y `test:identificacion` antes de compilar Next.js. `test:e2e`
permanece independiente: no se ejecuta en ese hook ni en el despliegue de Vercel.

No se ejecutan POST contra Spring Boot real, producción o PostgreSQL. Esa
integración requiere una autorización posterior y un entorno aislado; esta suite
no comprueba persistencia, normalización ni rate limiting del backend real.

## Límite pendiente para despliegue

El contrato vigente indica **100 solicitudes por minuto por IP observada** como
límite inicial de Spring Boot, local por instancia. Con el BFF puede ver la IP de
salida compartida de Next.js y **agrupar a múltiples usuarias en un mismo límite**.
El token autentica al BFF como cliente del backend, pero el endpoint público del
BFF sigue expuesto a solicitudes. Quedan pendientes el rate limiting por
IP/cliente en el BFF y la cuota global del backend de **125 solicitudes por minuto
compartida entre instancias**. No se falsifica `X-Forwarded-For` ni se cambia la
confianza en proxies. CORS no autentica servicios.
