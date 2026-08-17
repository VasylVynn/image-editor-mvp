#!/bin/bash
# Double-click updater: pulls the latest version and rebuilds.
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "Оновлюю код..."
git pull || { read -r -p "git pull впав. Enter, щоб закрити..."; exit 1; }
npm install || { read -r -p "npm install впав. Enter, щоб закрити..."; exit 1; }
npm run build || { read -r -p "Збірка впала. Enter, щоб закрити..."; exit 1; }
echo "✅ Готово. Запустіть start.command."
read -r -p "Натисніть Enter, щоб закрити..."
