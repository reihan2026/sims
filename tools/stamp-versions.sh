#!/bin/sh
# Pasang penanda versi (?v=<hash isi file>) di referensi js/ & css/ di index.html,
# supaya browser langsung mengambil file yang berubah setelah deploy (refresh
# biasa cukup, tanpa Cmd+Shift+R). Dijalankan otomatis oleh .git/hooks/pre-commit;
# pasang hook-nya dengan: sh tools/stamp-versions.sh --install
cd "$(git rev-parse --show-toplevel)" || exit 1
if [ "$1" = "--install" ]; then
  printf '#!/bin/sh\nsh tools/stamp-versions.sh && git add index.html\n' > .git/hooks/pre-commit
  chmod +x .git/hooks/pre-commit && echo "hook pre-commit terpasang"
  exit 0
fi
for f in js/*.js css/*.css; do
  [ -f "$f" ] || continue
  h=$(shasum "$f" | cut -c1-8)
  # Ganti src="js/x.js" atau src="js/x.js?v=lama" → src="js/x.js?v=<hash>"
  sed -i '' -E "s#\"$f(\\?v=[0-9a-f]+)?\"#\"$f?v=$h\"#g" index.html
done
