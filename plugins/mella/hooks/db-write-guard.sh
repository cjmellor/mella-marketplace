#!/bin/bash
#
# Database Write Guard
#
# PreToolUse hook that inspects database CLI commands (mysql, sqlite3, tinker,
# artisan db) and blocks destructive write operations while allowing reads.
#
# Detected as destructive:
#   SQL:      DROP, DELETE FROM, TRUNCATE, UPDATE...SET, INSERT INTO, REPLACE INTO,
#             ALTER TABLE, RENAME TABLE, GRANT, REVOKE, LOAD DATA, SET GLOBAL,
#             FLUSH PRIVILEGES, SOURCE, piped .sql files
#   Eloquent: ->save(), ->create(), ->update(), ->delete(), ->forceDelete(),
#             ::destroy(), ->truncate(), ->insert(), ->upsert(), ->push(),
#             ->updateOrCreate(), ->firstOrCreate(), ->forceCreate(),
#             ->increment(), ->decrement(), DB::statement, DB::unprepared,
#             DB::insert, DB::update, DB::delete, Schema::drop,
#             Schema::dropIfExists, Schema::rename, Cache::flush,
#             Storage::delete, Artisan::call
#
# Allowed through (reads):
#   SQL:      SELECT, SHOW, DESCRIBE, EXPLAIN, USE
#   Eloquent: ->get(), ->first(), ->find(), ->count(), ->pluck(), ->value(),
#             ->exists(), ->toSql(), DB::select, Schema::hasTable, Cache::get,
#             Storage::get, Storage::exists

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')

[ -z "$CMD" ] && exit 0

# --- Detect database CLI commands ---
if ! printf '%s' "$CMD" | grep -qiE \
  '^(mysql|sqlite3)|php artisan (tinker|db([^:a-z]|$))|herd php artisan (tinker|db([^:a-z]|$))|sail (mysql|tinker|artisan tinker|artisan db)'; then
  exit 0
fi

# --- Check for destructive SQL keywords ---
SQL_WRITE=false
printf '%s' "$CMD" | grep -qiE \
  'DROP (TABLE|DATABASE|INDEX|VIEW|USER|COLUMN|IF)|DELETE FROM|TRUNCATE|UPDATE [^ ]+ SET|INSERT INTO|REPLACE INTO|ALTER TABLE|RENAME TABLE|GRANT |REVOKE |LOAD DATA|SET GLOBAL|FLUSH PRIVILEGES|SOURCE ' \
  && SQL_WRITE=true

# --- Check for destructive Eloquent/Laravel operations ---
ELOQUENT_WRITE=false
printf '%s' "$CMD" | grep -qE \
  '->save\(|->create\(|::create\(|->update\(|->delete\(|->forceDelete\(|::destroy\(|->truncate\(|->insert\(|->upsert\(|->updateOrCreate\(|->firstOrCreate\(|->forceCreate\(|->push\(|->increment\(|->decrement\(|DB::statement|DB::unprepared|DB::insert|DB::update|DB::delete|Schema::drop|Schema::dropIfExists|Schema::rename|Cache::flush|Storage::delete|Artisan::call' \
  && ELOQUENT_WRITE=true

# --- Check for piped SQL file execution ---
FILE_EXEC=false
printf '%s' "$CMD" | grep -qE '< *[^ ]+\.sql' && FILE_EXEC=true

# --- Block if any write pattern matched ---
if [ "$SQL_WRITE" = true ] || [ "$ELOQUENT_WRITE" = true ] || [ "$FILE_EXEC" = true ]; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Database write operation detected — review before approving"}}'
fi
