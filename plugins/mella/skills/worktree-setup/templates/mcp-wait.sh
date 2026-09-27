#!/usr/bin/env bash
marker=vendor/autoload.php
lock="$(git rev-parse --path-format=absolute --git-dir)/deps.lock"
for _ in $(seq 240); do
  [ -e "$marker" ] && [ ! -d "$lock" ] && break
  sleep 0.5
done
exec php artisan boost:mcp
