#!/bin/bash
# backup.sh — SQLite backup script for LastWar Alliance Manager
# Usage: ./backup.sh [backup_dir] [retention_days]
#
# Defaults:
#   backup_dir:     ./backups
#   retention_days: 30
#
# Can be run via cron:
#   0 3 * * * /opt/lastwar/backup.sh /opt/lastwar/backups 30

set -euo pipefail

DATABASE_PATH="${DATABASE_PATH:-/data/alliance.db}"
BACKUP_DIR="${1:-./backups}"
RETENTION_DAYS="${2:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/alliance_${TIMESTAMP}.db"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Verify source database exists
if [ ! -f "$DATABASE_PATH" ]; then
    echo "ERROR: Database not found at $DATABASE_PATH"
    exit 1
fi

# Perform backup using SQLite .backup command (safe for concurrent reads)
if command -v sqlite3 &> /dev/null; then
    sqlite3 "$DATABASE_PATH" ".backup '${BACKUP_FILE}'"
else
    # Fallback: copy with WAL checkpoint
    cp "$DATABASE_PATH" "$BACKUP_FILE"
    if [ -f "${DATABASE_PATH}-wal" ]; then
        cp "${DATABASE_PATH}-wal" "${BACKUP_FILE}-wal"
    fi
    if [ -f "${DATABASE_PATH}-shm" ]; then
        cp "${DATABASE_PATH}-shm" "${BACKUP_FILE}-shm"
    fi
fi

# Verify backup
if [ ! -s "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file is empty"
    exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# Clean up old backups
DELETED=$(find "$BACKUP_DIR" -name "alliance_*.db" -mtime +"$RETENTION_DAYS" -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
    echo "Cleaned up $DELETED backup(s) older than $RETENTION_DAYS days"
fi

echo "Backup complete"
