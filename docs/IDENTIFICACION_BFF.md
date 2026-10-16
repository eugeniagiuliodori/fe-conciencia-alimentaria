# Identificación declarativa por correo

El formulario «Identificación por correo» de la página principal (`/#identificacion`)
envía JSON con `fetch` a `POST /api/usuarios/identificacion` del mismo origen.
El Route Handler en `src/app/api/usuarios/identificacion/route.ts` hace el único
salto a Spring Boot, al path fijo del
[contrato v1](../contracts/CONTRATO_API_IDENTIFICACION_V1.yaml).

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

Agregar a `.env.local` el origen real de Spring Boot. Ejemplo ilustrativo:

```dotenv
BACKEND_URL=http://localhost:8080
```

- Si `.env.local` ya existe, preservar todas las demás entradas y su destino configurado.
- `.gitignore` excluye `.env*`, con la única excepción de `.env.example`.
  Verificarlo con `git check-ignore .env.local`; nunca versionar el archivo local.
- Next.js carga `.env.local` automáticamente con `npm run dev`; no se necesita
  exportar variables en la terminal. Reiniciar el servidor si se cambia el destino.
- `BACKEND_URL` se lee exclusivamente en el Route Handler. No usar `NEXT_PUBLIC_`.
- Se admite un origen HTTP(S) con host y puerto, sin path adicional, query,
  fragmento ni credenciales. Sin configuración válida se devuelve `503` y no se
  intenta conectar a un destino predeterminado.
- Para producción, configurar la misma variable en el entorno del hosting y HTTPS
  correctamente configurado. Esta iteración no despliega ni configura infraestructura.

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
| Error de red, `5xx`, redirección u otro estado fuera del contrato | `502` genérico, sin afirmar que la operación no se procesó |
| Timeout del upstream, a los 5 segundos | `504` sin afirmar éxito ni fracaso definitivo de la operación en Spring Boot |
| `BACKEND_URL` ausente o inválida | `503` genérico |

No se leen ni reproducen cuerpos del upstream. No se reenvían cookies,
`Authorization`, `X-Forwarded-For`, destinos, paths ni encabezados elegidos por el
cliente. Tampoco se siguen redirecciones del upstream. Todas las respuestas del
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
Comprueban que un envío inicial y su repetición reciben el mismo `204` vacío, sin
inferir si el backend creó un registro. Incluyen caracteres de control, `charset`
UTF-8 con y sin comillas, límites con `Content-Length` correcto o no fiable y una
sola llamada upstream por solicitud, incluso ante errores.
No requieren Spring Boot, base de datos ni credenciales. Las solicitudes y
respuestas son sintéticas y no consumen servicios reales.

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

Prueba de navegador con Chrome instalado, después del build:

```bash
node scripts/playwright/identificacion.mjs
```

Inicia Next.js y un upstream simulado en puertos locales temporales, sin modificar
`.env.local`, y cierra ambos al terminar. Recorre el formulario y el BFF real con
éxito, carga, errores y los timeouts nativos de 5 y 10 segundos; comprueba
preservación del correo tras cada error y ausencia de reintentos en ambas
fronteras, además de teclado y anchos entre 320 y 1536 px,
incluidos límites de breakpoints. Guarda capturas en una carpeta temporal e
informa su ruta. Bloquea solicitudes externas del navegador y simula el tracking
existente para no escribir en Redis. Esto sigue siendo una integración controlada,
no una prueba de Spring Boot ni PostgreSQL.

## Límite pendiente para despliegue

Spring Boot parte de **10 solicitudes por minuto por IP**. Con el BFF puede ver la
IP de salida compartida de Next.js y **agrupar a múltiples usuarias en un mismo
límite**. No se falsifica `X-Forwarded-For` ni se cambia la confianza en proxies.
La adecuación del límite y la protección de infraestructura requieren una futura
iteración o configuración de despliegue acordada. CORS no es necesario para este
salto servidor-servidor y no autentica servicios.
