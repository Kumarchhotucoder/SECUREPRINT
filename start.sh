#!/bin/bash
# ═══════════════════════════════════════════════════════════
# SecurePrint — One-Click Startup Script
# Starts: Backend + Frontend + Public Tunnel (auto-updates env)
# ═══════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     🔒 SecurePrint — Starting Up         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Kill any existing processes on our ports
echo "🧹 Cleaning up old processes..."
lsof -ti:5173 | xargs kill -9 2>/dev/null
lsof -ti:5001 | xargs kill -9 2>/dev/null
pkill -f "cloudflared" 2>/dev/null
pkill -f "localhost.run" 2>/dev/null
sleep 1

# Start Backend
echo "🚀 Starting backend server (port 5001)..."
cd "$SCRIPT_DIR/server" && node index.js &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"
sleep 2

# Start Frontend
echo "🎨 Starting frontend dev server (port 5173)..."
cd "$SCRIPT_DIR/client" && npm run dev &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"
sleep 3

# Start Cloudflare Tunnel and capture URL
echo "🌐 Starting Cloudflare tunnel..."
TUNNEL_LOG="/tmp/cloudflare_tunnel_$$.log"
"$SCRIPT_DIR/bin/cloudflared" tunnel --url http://localhost:5173 > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!
echo "   Tunnel PID: $TUNNEL_PID"

# Wait for tunnel URL
echo "⏳ Waiting for tunnel URL..."
TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1)
  if [ -n "$TUNNEL_URL" ]; then break; fi
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  echo "⚠️  Cloudflare tunnel failed. Trying localhost.run..."
  kill $TUNNEL_PID 2>/dev/null
  
  LHR_LOG="/tmp/lhr_tunnel_$$.log"
  ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=10 \
      -R 80:localhost:5173 nokey@localhost.run > "$LHR_LOG" 2>&1 &
  TUNNEL_PID=$!
  
  for i in $(seq 1 30); do
    TUNNEL_URL=$(grep -o 'https://[a-z0-9]*\.lhr\.life' "$LHR_LOG" 2>/dev/null | tail -1)
    if [ -n "$TUNNEL_URL" ]; then break; fi
    sleep 1
  done
fi

if [ -n "$TUNNEL_URL" ]; then
  echo ""
  echo "✅ Tunnel URL: $TUNNEL_URL"
  echo ""
  
  # Update client .env
  cat > "$SCRIPT_DIR/client/.env" << EOF
VITE_API_URL=http://localhost:5001/api
VITE_PUBLIC_APP_URL=$TUNNEL_URL
EOF
  
  # Update server .env (sed to replace PUBLIC_APP_URL and APP_BASE_URL)
  sed -i '' "s|PUBLIC_APP_URL=.*|PUBLIC_APP_URL=$TUNNEL_URL|g" "$SCRIPT_DIR/server/.env"
  sed -i '' "s|APP_BASE_URL=.*|APP_BASE_URL=$TUNNEL_URL|g" "$SCRIPT_DIR/server/.env"
  
  echo "📋 Updated .env files with new tunnel URL"
  echo ""
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  🟢 SecurePrint is LIVE!                                 ║"
  echo "╠══════════════════════════════════════════════════════════╣"
  printf "║  📱 Mobile URL (QR)  : %-34s ║\n" "$TUNNEL_URL"
  echo "║  💻 Local Frontend   : http://localhost:5173             ║"
  echo "║  🔧 Local Backend    : http://localhost:5001             ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo ""
  echo "💡 Share this URL with customers or scan the QR in Admin → Shop QR"
  echo ""
  echo "Press Ctrl+C to stop all services."
else
  echo "❌ Could not get a tunnel URL. Check your internet connection."
fi

# Wait for all background processes
wait $BACKEND_PID $FRONTEND_PID $TUNNEL_PID 2>/dev/null
