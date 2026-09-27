# Stack recipes

Each section fills in the stack-specific parts of the worktree-setup steps: the config paths for `.worktreeinclude`, the `deps=(…)` and `install()` lines for the provisioning hook, the MCP marker, and a smoke command for verification. Mixed projects combine sections. For a stack with no section, derive the same parts from its lockfile and ignore file, then add a section here.

## Laravel — verified (Kandu)

- **Config**: `.env`, `auth.json` (private Composer repo credentials such as Flux Pro; without it `composer install` fails with 401), `.mcp.json`, `boost.json`, `.ai/guidelines/`, any gitignored docs the agent reads, `.claude/settings.local.json`, `public/build/`.
- **Hook**:

  ```bash
  deps=(vendor node_modules)
  install() { composer install --no-interaction && bun install --frozen-lockfile; }
  ```

  Swap `bun install --frozen-lockfile` for the project's JS package manager (see Node).
- **MCP**: Laravel Boost. `marker=vendor/autoload.php`, `exec php artisan boost:mcp`. The Boost docs endorse gitignoring `.mcp.json`, `boost.json` and the generated guideline files, since `boost:install` regenerates them; older projects often committed them before ignoring them, so check step 1's tracked-but-ignored list.
- **Smoke**: `php artisan --version`, then one feature test that renders a page (it proves `public/build/manifest.json` arrived).
- **Build output**: copy `public/build/` so tests that render `@vite` layouts pass without a build. Leave `public/hot` behind; it points at the main checkout's dev server.
- **Serving**: Chris uses Laravel Valet. A worktree needs its own `valet link` only when it must be opened in a browser (**untested**).

## Node / JavaScript — inferred from the Laravel JS half

- **Config**: `.env*`, `.npmrc` when it holds registry tokens.
- **Hook**: `deps=(node_modules)`, and `install()` runs the lockfile's package manager in frozen mode: `bun install --frozen-lockfile`, `pnpm install --frozen-lockfile`, `yarn install --immutable`. For npm use `npm install`: `npm ci` deletes `node_modules` first and throws the clone away.
- **Smoke**: the project's test or typecheck script.

## Swift — iOS / macOS apps — untested sketch

- **Config**: gitignored secrets (`*.xcconfig` holding keys, `GoogleService-Info.plist`, `.env`), `.claude/settings.local.json`.
- **Dependencies**:
  - Xcode keeps DerivedData, including Swift Package checkouts, under `~/Library/Developer/Xcode/DerivedData`, keyed by project path, so each worktree gets its own and there is nothing in the repo to clone. The first build in a worktree is cold.
  - SwiftPM command-line builds keep `.build/` in the repo: `deps=(.build)`, `install() { swift package resolve; }`.
  - CocoaPods with `Pods/` gitignored: `deps=(Pods)`, `install() { pod install; }`.
  - Generated projects (XcodeGen, Tuist) with the `.xcodeproj` gitignored: generation is the install step (`xcodegen generate`, `tuist generate`), and `deps` names the generated project.
- **MCP**: build-tool servers that ship as standalone binaries need no wait wrapper; only servers launched through project dependencies do.
- **Smoke**: `swift build`, or `xcodebuild -list` for an Xcode project.
