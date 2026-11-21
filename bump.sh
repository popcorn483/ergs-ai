#!/bin/sh
# Bump the app version: renames the offline cache and re-stamps CSS/JS links so phones never mix old and new files.
python3 "$(dirname "$0")/tools/darkgen.py" >/dev/null
n=$(grep -o "ergsai-v[0-9]*" sw.js | grep -o "[0-9]*$"); n=$((n+1))
sed -i "s/ergsai-v[0-9]*/ergsai-v$n/" sw.js
sed -i -E "s/\.(css|js)\?v=[0-9]+\"/.\1?v=$n\"/g" index.html
echo "Now version $n"
