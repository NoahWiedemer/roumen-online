#!/bin/bash
# Usage: scripts/shot.sh "<url path+query>" out.png [width] [height] [waitMs]
# Takes a headless Chrome screenshot of the running dev server (http://localhost:5173)
URL="http://localhost:5173$1"
OUT="$2"; W="${3:-1280}"; H="${4:-720}"; WAIT="${5:-6000}"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu-sandbox --use-angle=metal --enable-webgl --ignore-gpu-blocklist \
  --hide-scrollbars --window-size="$W,$H" --virtual-time-budget="$WAIT" --screenshot="$OUT" "$URL" 2>/dev/null
ls -la "$OUT" 2>/dev/null | awk '{print $5, $9}'
