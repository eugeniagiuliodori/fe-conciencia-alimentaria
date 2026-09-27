import "server-only";

export const RECOVER_VISIT_SCRIPT = `
local retryKey = KEYS[1]

local now = tonumber(ARGV[1])
local staleAfterMs = tonumber(ARGV[2])
local maxAttempts = tonumber(ARGV[3])

local attempts = redis.call(
  "HGET",
  retryKey,
  "attempts"
)

local lastAttemptAt = redis.call(
  "HGET",
  retryKey,
  "lastAttemptAt"
)

-- La key pudo desaparecer entre el SCAN y esta ejecución.
if not attempts or not lastAttemptAt then
  return { "NOT_FOUND" }
end

attempts = tonumber(attempts)
lastAttemptAt = tonumber(lastAttemptAt)

-- Estado inesperado/corrupto.
-- No intentamos procesarlo automáticamente.
if not attempts or not lastAttemptAt then
  return { "INVALID" }
end

-- Política de abandono:
-- 10 intentos recibidos por Redis
-- o 7 días desde el último intento.
if attempts >= maxAttempts
  or now - lastAttemptAt >= staleAfterMs
then
  redis.call("DEL", retryKey)

  return {
    "DELETED",
    tostring(attempts)
  }
end

-- La operación todavía está dentro
-- de nuestra ventana de recuperación.
return {
  "RETRY",
  tostring(attempts)
}
`;