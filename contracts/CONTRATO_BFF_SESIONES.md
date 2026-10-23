# Contrato interno — sesiones declarativas entre interfaz y BFF

**Proyecto:** Conciencia Alimentaria  
**Estado:** contrato objetivo definido antes de la implementación; habilitación progresiva por iteraciones  
**Ubicación:** `contracts/CONTRATO_BFF_SESIONES.md`

## 1. Fronteras y precedencia

Este documento define la comunicación **navegador / interfaz React ↔ Route Handlers Next.js (BFF)**. No reemplaza ni modifica `contracts/CONTRATO_API_IDENTIFICACION_V1.yaml`, que define **BFF ↔ Spring Boot** (API `info.version: 1.2.0`, especificación OpenAPI `3.0.3`). Ante incompatibilidades, no inventar comportamientos: informar y solicitar decisión.

La identificación (`POST /api/usuarios/identificacion`) registra o busca un correo y devuelve `204`, sin iniciar sesión. El inicio y cierre declarativos son operaciones diferentes. Ninguna verifica titularidad, autentica personas ni habilita acceso a datos sensibles.

## 2. Operaciones HTTP de la interfaz

### `POST /api/usuarios/sesiones` — inicio

- **Request navegador → BFF:** `Content-Type: application/json`; objeto JSON **exclusivamente** `{ "email": "..." }`. Tamaño máximo efectivo: 2048 bytes; validar tipo, presencia, longitud y formato antes de comunicarse con el backend, con criterios coherentes con identificación.
- **Request BFF → Spring Boot:** `POST /api/usuarios/sesiones`, el mismo dato `email` válido y únicamente las cabeceras necesarias; inyectar `X-Service-Token` **solo desde** `process.env.BFF_SERVICE_SECRET` en servidor. Destino fijo a partir de `BACKEND_URL`, no controlado por el cliente; no reenviar cabeceras entrantes indiscriminadamente.
- **Upstream éxito:** `201` con `{ "sesionId": "identificador-opaco" }`. El BFF debe tratar `sesionId` como sensible, sin retornarlo al navegador, registrarlo ni incluirlo en errores o estado React.
- **Resultado objetivo navegador:** `201 Created` **sin cuerpo sensible**, tras establecer por parte del BFF una cookie de sesión `HttpOnly` de nombre fijo con `SameSite` y `Secure` en HTTPS, sin `Max-Age` ni `Expires`. El nombre concreto y demás opciones operativas se fijarán explícitamente en la iteración de cookies; la cookie contendrá únicamente el identificador opaco, nunca email o `usuarioId`.
- **Errores de entrada del navegador:** `400` solicitud inválida, `413` cuerpo excedido, `415` tipo de contenido no admitido, con JSON seguro `{ "codigo": string, "mensaje": string }`.
- **Correo no registrado:** `404`, código `CORREO_NO_REGISTRADO`, mensaje apto para interfaz y sin exponer datos adicionales. La revelación de existencia es una decisión explícita del producto heredada del contrato del backend.
- **Errores de dependencia:** `401` del backend por secreto técnico inválido **no se interpreta como credencial de la usuaria**; traducirlo a `502` o `503` genérico. Un error de comunicación / respuesta inválida puede producir `502`; timeout `504`; configuración ausente falla de manera segura. No transferir cuerpos de error upstream sin control, ni realizar reintentos automáticos de operaciones mutantes.
- **Política:** `Cache-Control: no-store`, sin `sesionId`, secreto, email ni datos internos en respuestas o logs.

### `DELETE /api/usuarios/sesiones/actual` — cierre

- **Request navegador → BFF:** sin body, sin email, sin `X-Service-Token`, sin `X-Session-Id`. El navegador usa la cookie automáticamente cuando corresponda; JavaScript no lee el identificador.
- **Request BFF → Spring Boot:** `DELETE /api/usuarios/sesiones/actual`, sin body; `X-Service-Token` proviene del entorno del BFF y `X-Session-Id` exclusivamente de la cookie `HttpOnly` recibida. No aceptar un identificador enviado por el navegador en JSON, query string o cabeceras arbitrarias.
- **Resultado objetivo navegador:** `204 No Content` sin cuerpo y eliminación de la cookie en el BFF, con alcance de nombre/ruta/dominio compatible con su creación. El backend devuelve `204` también para un identificador bien formado ya inexistente.
- **Cookie ausente:** el BFF puede devolver `204` sin invocar al backend porque no hay identificador que invalidar; no atribuir ese resultado a una invalidación comprobada en Spring Boot.
- **Fallos:** mantener errores genéricos, sin borrar silenciosamente una cookie con sesión no invalidada cuando la operación con el backend resulte incierta; documentar ese comportamiento en la iteración que implemente cookies. No presentar `401` técnico del backend como falta de autenticación de una usuaria.
- **Política:** sin caché, sin datos sensibles en respuestas o logs.

## 3. Alcance efectivo de la primera iteración de BFF (sin cookies)

Esta iteración **sí implementa el Route Handler público de inicio y su comunicación real mediante código servidor**. Se mantienen la validación y la distinción de contratos, pero aún no se crean, leen ni eliminan cookies y no se modifica la interfaz React ni se implementa estado global.

### Inicio público operativo, con limitación conocida

- `POST /api/usuarios/sesiones` procesa la solicitud y realiza el POST a Spring Boot cuando los datos son válidos y el entorno está correctamente configurado.
- El backend devuelve `201` con `{ "sesionId": "..." }` conforme a su OpenAPI **sin alterar ese formato**. El BFF comprueba que se trata de una respuesta válida y **descarta inmediatamente el identificador**: no lo devuelve en JSON, cabeceras ni `Set-Cookie`; no lo almacena en variables persistentes, caché, sesión, logs, trazas o estado React; no lo utiliza para otra operación. Solo se mantiene transitoriamente en memoria durante el procesamiento de la respuesta HTTP.
- El BFF devuelve al navegador **`201 Created` sin cuerpo** y con `Cache-Control: no-store`. Es la constancia de creación de una sesión declarativa en Spring Boot, **no** significa que haya quedado iniciada o conservada una sesión utilizable por el navegador. No enviar `Set-Cookie` todavía.
- **Limitación aceptada conscientemente:** cada `201` real crea una sesión persistida en PostgreSQL cuyo ID descartado no podrá recuperarse ni invalidarse desde este flujo. Dado que no existe caducidad ni limpieza automática, estos registros permanecen. Esta iteración no introduce mecanismos nuevos para recuperarlos o limpiarlos. Por esta razón, esta primera iteración no ejecuta pruebas ni POST reales sobre PostgreSQL; la simulación de upstream se realizará en una futura iteración de testing; no enlazar todavía el nuevo inicio a los formularios de la UI. Informar esta consecuencia en el reporte final.
- `404 CORREO_NO_REGISTRADO` se comunica según el contrato, sin revelar email ni otros datos internos. `401` de autenticación técnica se traduce a error seguro del BFF, nunca a `401` de usuaria. Respetar el resto de los códigos y controles descritos en la sección 2.

### Cierre: ruta pública sin identificador todavía; comunicación interna implementada

- `DELETE /api/usuarios/sesiones/actual` **existe**, pero en esta iteración el BFF aún no dispone de cookie para identificar qué sesión invalidar. React **no envía** `sesionId` ni `X-Session-Id` por body, query o cabeceras; el BFF tampoco acepta esos valores arbitrarios como fuente del identificador.
- Si se llama la ruta pública antes de incorporar la cookie, responder de manera controlada `503` con `{ "codigo": "SESION_NO_DISPONIBLE", "mensaje": "El cierre de sesión todavía no está disponible." }`, sin llamar a Spring Boot y sin fingir un cierre exitoso. **Esta limitación se aplica solo al cierre, no al inicio.**
- Implementar la operación interna **servidor-servidor de cierre plenamente funcional**: acepta un `sesionId` como argumento privado del lado servidor, envía exactamente una cabecera `X-Session-Id` y `X-Service-Token` al backend y comprueba `204` sin cuerpo; usa el contrato externo para los demás códigos. En una futura iteración de pruebas se verificará esta función con un identificador sintético proporcionado exclusivamente por el código de pruebas y un backend HTTP simulado. No ejecutar esa comprobación ahora. No inventar una cookie de prueba ni exponer rutas auxiliares para inyectar un ID.
- La siguiente iteración hará que el Route Handler público obtenga el identificador de la cookie `HttpOnly`, invoque esa función interna y gestione la eliminación de la cookie. **React solo solicita el cierre; nunca lee la cookie `HttpOnly`.**

No modificar los contratos desde Codex. Ante una diferencia material entre la implementación y estos contratos, detener la parte afectada e informar.

## 4. Futuras iteraciones (no implementarlas ahora)

1. Cookie de sesión `HttpOnly`, `SameSite`, `Secure` en HTTPS y sin expiración temporal explícita; activación de ambas rutas conforme al contrato objetivo.
2. Estado global `anonymous | identified` sin email, rehidratado con ayuda del servidor Next.js al actualizar con F5. Presencia de cookie no equivale a validez verificada por Spring Boot.
3. Integración de formularios React y mensajes accesibles.
4. Pruebas unitarias y de integración de las rutas nuevas, con identificadores sintéticos y upstream simulado donde corresponda, en una iteración posterior; E2E con Playwright en su propia iteración.

## 5. Comportamiento esperado y verificación pendiente

La primera iteración es exclusivamente de implementación. No se deben crear, modificar ni ejecutar pruebas en ella. Los puntos siguientes especifican el comportamiento esperado y las comprobaciones de una futura iteración; no constituyen autorización para probarlo ahora.

- Los Route Handlers nunca exponen `BFF_SERVICE_SECRET` ni `sesionId` al navegador; el inicio devuelve `201` sin body ni `Set-Cookie`.
- No se implementan cookies ni lógica de estado global en la primera iteración.
- El inicio público procesa la comunicación con Spring Boot, pero en esta primera iteración no se ejecutan pruebas ni llamadas reales que creen sesiones abandonadas; el cierre público responde `503` sin ejecutar el backend hasta contar con cookie.
- **Criterios pendientes de la futura iteración de pruebas:** verificar mediante backend simulado y `sesionId` sintético, aportado solo por las pruebas, las solicitudes y respuestas `201`, `204`, `400`, `401`, `404`, `413`, `415`, `500`, fallos de red, timeouts y redirecciones, sin secretos reales. Estos escenarios no se implementan ni ejecutan como pruebas ahora.
- Los contratos externos permanecen intactos, y la identificación existente sigue funcionando sin regresiones.


## 6. Iteración 2 — cookie `HttpOnly` y activación completa de inicio/cierre (vigente)

**Este apartado actualiza el estado de implementación**: las secciones 3, 4 y 5 anteriores describen la primera iteración, que ya terminó. Sus indicaciones temporales «sin Set-Cookie» en inicio y «503» en cierre **dejan de regir**. Las secciones 1 y 2 describen el contrato objetivo y se mantienen. La segunda iteración sigue siendo **solo implementación, sin ejecutar ni escribir pruebas**.

### Cookie de sesión

- Nombre único y fijo: `ca_sesion`.
- Valor: exactamente el `sesionId` opaco recibido de Spring Boot; no email ni `usuarioId`.
- Al crear: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` para HTTPS (obligatorio en producción; local HTTP controlado puede prescindir de él), sin `Max-Age` ni `Expires`.
- Solo Next.js del lado servidor puede leer el valor. El navegador lo almacena y adjunta automáticamente cuando coincide el alcance de cookie; JavaScript/React **no** lee ni envía explícitamente `sesionId`.
- El cierre la elimina solo después de éxito de invalidación, utilizando la API de cookies de Next.js y el mismo nombre, ruta y alcance. En **la instrucción de borrado** sí se permite `Max-Age=0` o expiración en el pasado. La cookie de sesión del navegador puede conservarse o restaurarse según comportamiento del navegador; no confundir presencia de cookie con validez en PostgreSQL.

### `POST /api/usuarios/sesiones` — comportamiento vigente

- React envía únicamente el JSON `{ "email": "..." }`; el BFF valida y contacta Spring Boot según el contrato externo, con su propio `X-Service-Token`.
- Ante `201` upstream con `{ "sesionId": string }` válido: configurar `Set-Cookie` seguro y devolver **`201 Created` sin cuerpo**, `Cache-Control: no-store`, sin exponer `sesionId` en JSON/cabeceras adicionales. La cookie es el único transporte autorizado del identificador hacia el navegador.
- Si Spring Boot responde error, no se conecta, expira el tiempo o el `201` es inválido: responder error seguro y **no crear, borrar ni reemplazar cookie alguna**. Si ya había una sesión en el navegador, conservar su cookie sin cambios. Nunca informar éxito sin haber podido configurar correctamente la cookie.
- Códigos de Spring Boot relevantes: `201`, `400`, `401` técnico, `404 CORREO_NO_REGISTRADO`, `413`, `415`, `500`. El BFF preserva `404` funcional, no expone el `401` técnico como autenticación de persona y usa errores propios `502/503/504` cuando corresponda según la sección 2. Sin reintentos automáticos ni reenvío indiscriminado de errores/headers.

### `DELETE /api/usuarios/sesiones/actual` — comportamiento vigente

- React solicita cierre **sin body, email, `X-Session-Id` ni `X-Service-Token`**. La cookie es enviada automáticamente por el navegador.
- El BFF lee en servidor `ca_sesion`. Si falta, devuelve `204 No Content`, sin cuerpo (no afirma invalidación remota); no llama Spring Boot. Si el valor está malformado, no reenviarlo: error genérico seguro y cookie conservada, sujeto a la validación existente; no declarar invalidación exitosa.
- Con identificador presente y válido, el BFF reutiliza el servicio interno de cierre y transmite `X-Session-Id` junto con el secreto técnico a Spring Boot. **Solo si Spring Boot devuelve `204`**, elimina `ca_sesion` y responde `204` sin cuerpo.
- Ante error `400/401/500` upstream, respuesta inválida, redirección, timeout o fallo de comunicación: no eliminar ni modificar cookie, devolver error seguro según contrato interno; un `401` indica fallo técnico BFF↔Spring Boot, no credenciales de usuaria. Si la respuesta se perdió, la invalidación es incierta: un nuevo intento es válido porque el backend responde `204` para IDs bien formados ya invalidados.
- Todas las respuestas de estas rutas llevan `Cache-Control: no-store`, no filtran email, `sesionId`, cookies, secretos, trazas ni datos internos.

### Fuera de alcance y validación

No implementar aquí estado global `anonymous | identified`, restauración visual tras F5, cambios de formularios, nuevas rutas de consulta, cookies adicionales, expiración temporal, autenticación real o autorización. No crear, modificar ni ejecutar pruebas en esta iteración; compilar sin disparar suites. Los comportamientos permanecen pendientes de pruebas específicas posteriores.
