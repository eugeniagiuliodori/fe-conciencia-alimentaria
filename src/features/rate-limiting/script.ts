import "server-only";

// Una única ejecución EVAL: Redis no intercala operaciones de otras instancias.
// SET con PX crea contador y TTL juntos; INCR conserva el vencimiento original.
export const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local raw = redis.call("GET", key)

if not raw then
  redis.call("SET", key, "1", "PX", windowMs)
  return {1, 1, windowMs}
end

local count = tonumber(raw)
local remaining = redis.call("PTTL", key)
if not string.match(raw, "^[1-9][0-9]*$") or not count
  or count > limit or remaining < 0 or remaining > windowMs then
  return redis.error_reply("Invalid rate limit state")
end

if count == limit then
  return {0, count, remaining}
end

return {1, redis.call("INCR", key), remaining}
`;
