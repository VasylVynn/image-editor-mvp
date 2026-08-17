#!/bin/bash
# Double-click launcher for the catalog image tool (macOS).
# Installs deps on first run, builds if needed, starts the production
# server and opens the browser.
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js не знайдено. Встановіть з https://nodejs.org (LTS) і запустіть знову."
  read -r -p "Натисніть Enter, щоб закрити..."
  exit 1
fi

if [ ! -f .env.local ]; then
  echo "❌ Немає файла .env.local з ключами (GEMINI_API_KEY, FAL_KEY)."
  read -r -p "Натисніть Enter, щоб закрити..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Перше встановлення залежностей (кілька хвилин)..."
  npm install || { read -r -p "npm install впав. Enter, щоб закрити..."; exit 1; }
fi

if [ ! -f .next/BUILD_ID ]; then
  echo "Збірка застосунку..."
  npm run build || { read -r -p "Збірка впала. Enter, щоб закрити..."; exit 1; }
fi

echo "Запускаю. Не закривайте це вікно, поки працюєте."
( sleep 3 && open http://localhost:3000 ) &
npm start
