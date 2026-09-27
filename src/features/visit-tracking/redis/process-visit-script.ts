import "server-only";

export const PROCESS_VISIT_SCRIPT = `
local visitKey = KEYS[1]
local retryKey = KEYS[2]
local countKey = KEYS[3]

local now = ARGV[1]
local processedTtlSeconds = tonumber(ARGV[2])
local maxAttempts = tonumber(ARGV[3])

-- Si visit:{UUID} existe, esta visita ya fue contabilizada.
-- No importa qué ejecución realizó originalmente el incremento.
if redis.call("EXISTS", visitKey) == 1 then
  -- Cualquier estado de retry residual ya no es necesario.
  redis.call("DEL", retryKey)

  return { "PROCESSED" }
end

-- Redis recibió un nuevo intento para este UUID.
local attempts = redis.call("HINCRBY", retryKey, "attempts", 1)

redis.call("HSETNX", retryKey, "firstAttemptAt", now)

redis.call(
  "HSET",
  retryKey,
  "lastAttemptAt", now
)

-- Intentamos incrementar el contador global.
local countResult = redis.pcall("INCR", countKey)

if type(countResult) == "table" and countResult.err then
  -- El incremento falló explícitamente.
  -- visitretry:{UUID} permanece para permitir recuperación.

  if attempts >= maxAttempts then
    redis.call("DEL", retryKey)

    return {
      "ABANDONED",
      tostring(attempts)
    }
  end

  return {
    "FAILED",
    tostring(attempts)
  }
end

-- El incremento fue exitoso.
-- Recién ahora existe visit:{UUID}, cuya existencia significa:
-- "esta visita ya fue contabilizada".
redis.call(
  "HSET",
  visitKey,
  "count", tostring(countResult),
  "attempts", tostring(attempts)
)

redis.call("EXPIRE", visitKey, processedTtlSeconds)

-- Ya no existe una operación pendiente.
redis.call("DEL", retryKey)

return { "PROCESSED" }
`;