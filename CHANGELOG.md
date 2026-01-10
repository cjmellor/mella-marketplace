# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-01-10

### Changed

- **mella plugin** (v1.1.1)
  - Converted `walkthrough` command to skill-only (removed command, kept skill)
  - Converted `commit` command to skill
  - Added Laravel Pint linter hook to `commit` skill - automatically runs `pint --dirty` before commits if available
  - Removed `commands/` directory - all functionality now uses skills

## [1.1.0] - 2026-01-05

### Added

- **mella plugin** (v1.1.0)
  - `commit` command - Create git commits with intelligent grouping via `/mella:commit --group`
    - Standard mode: Creates single commit like standard commit command
    - Grouped mode: Analyzes changes and creates separate, logical commits (e.g., dependencies vs source code)
    - Auto-generates conventional commit messages
    - Respects existing staged changes

## [1.0.0] - 2026-01-03

### Added

- **mella plugin** (v1.0.0)
  - `walkthrough` command - Generate step-by-step testing guides via `/mella:walkthrough`
  - `walkthrough` skill - Auto-triggers when asking Claude to create testing documentation
