#!/bin/bash
set -e

BACKUP_DIR="/opt/prostoai/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="prostoai_${TIMESTAMP}.sql.gz"

# Дамп из Docker-контейнера, сразу сжимаем
docker compose -f /opt/prostoai/docker-compose.yml exec -T postgres \
  pg_dump -U prostoai prostoai | gzip > "${BACKUP_DIR}/${FILENAME}"

# Удаляем бэкапы старше 14 дней
find "${BACKUP_DIR}" -name "prostoai_*.sql.gz" -mtime +14 -delete

echo "[$(date)] Backup created: ${FILENAME}"
