Recuperación documental heurística, automatizada, de buena calidad y sin costes de API obligatorios:


El éxito queda en `CREADO`, bajo `data/fichas/YYYY-MM/` salvo configuración de `FICHAS_DIR`. El procesador no admite `--force`.

Para ejecutar el script:
node --env-file=.env.local scripts/fichas/procesar-ficha.mjs \
  --fecha 2026-09-24 \
  --url "https://openknowledge.fao.org/server/api/core/bitstreams/5eda804a-d21d-4042-a0fd-39088374c9df/content/cd8306en.html#gsc.tab=0"