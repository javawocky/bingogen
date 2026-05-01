#!/bin/bash
# MotoBingo dev server manager
# Usage: ./dev.sh start | stop | status | restart

DIR="$(cd "$(dirname "$0")" && pwd)"
FE_PID_FILE="$DIR/.fe.pid"
BE_PID_FILE="$DIR/.be.pid"
FE_PORT=4201
BE_PORT=8787

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22 >/dev/null 2>&1

stop_servers() {
  if [ -f "$FE_PID_FILE" ]; then
    kill $(cat "$FE_PID_FILE") 2>/dev/null
    rm -f "$FE_PID_FILE"
  fi
  if [ -f "$BE_PID_FILE" ]; then
    kill $(cat "$BE_PID_FILE") 2>/dev/null
    rm -f "$BE_PID_FILE"
  fi
  # Belt and suspenders
  lsof -ti:$FE_PORT | xargs kill -9 2>/dev/null
  lsof -ti:$BE_PORT | xargs kill -9 2>/dev/null
  sleep 1
  echo "Stopped."
}

start_servers() {
  stop_servers

  # Backend
  cd "$DIR/worker"
  npx wrangler dev --port $BE_PORT --local </dev/null &>/tmp/wrangler.log &
  echo $! > "$BE_PID_FILE"

  # Frontend
  cd "$DIR"
  npx ng serve --port $FE_PORT </dev/null &>/tmp/ng-serve.log &
  echo $! > "$FE_PID_FILE"

  echo "Starting... (BE:$BE_PORT FE:$FE_PORT)"
}

status_servers() {
  BE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:$BE_PORT/api/v1/championships 2>/dev/null)
  FE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:$FE_PORT 2>/dev/null)
  echo "Backend: $BE | Frontend: $FE"
}

case "${1:-status}" in
  start)   start_servers ;;
  stop)    stop_servers ;;
  restart) start_servers ;;
  status)  status_servers ;;
  *)       echo "Usage: $0 {start|stop|status|restart}" ;;
esac
