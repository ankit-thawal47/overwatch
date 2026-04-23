# Repository Guidelines

## Project Structure & Module Organization
`sessions/` contains the FastAPI backend, session parsers, port scanning, tmux helpers, and API routers under `sessions/routers/`. `frontend/` contains the React + Vite UI; use `frontend/src/pages/` for route-level screens, `frontend/src/components/` for reusable UI, and `frontend/src/lib/` for API/WebSocket clients. Root files: `Makefile` for local workflows, `pyproject.toml` for Python packaging, `uv.lock` for backend deps, and `PRODUCT2.md` for product context.

## Build, Test, and Development Commands
- `make install` — install editable backend dependencies and frontend packages.
- `make dev` — run backend and frontend together.
- `make backend` — start FastAPI on `127.0.0.1:8080` with reload.
- `make frontend` — start Vite dev server.
- `uv run overwatch` — run the packaged app entrypoint.
- `cd frontend && npm run build` — build the frontend bundle.
- `cd frontend && ./node_modules/.bin/tsc --noEmit` — strict TypeScript check.
- `cd frontend && npm run lint` — run ESLint on the frontend.

## Coding Style & Naming Conventions
Use 4-space indentation in Python and 2-space indentation in TypeScript/CSS. Keep Python modules lowercase (`sessions/codex.py`), React components PascalCase (`SessionCard.tsx`), and utility files lowercase (`api.ts`, `ws.ts`). Prefer explicit types in frontend code; `frontend/tsconfig.json` runs with `strict: true`. Reuse the shared visual primitives in `frontend/src/index.css` (`dune-*` classes) instead of introducing one-off theme styles.

## Testing Guidelines
There is no committed automated backend test suite yet. For backend changes, at minimum run `python3 -m compileall sessions` and exercise the affected API route manually. For frontend changes, run `./node_modules/.bin/tsc --noEmit`, `npm run lint`, and a local smoke test through `make dev`. When adding tests later, place them outside generated folders and keep names explicit, for example `test_sessions_router.py` or `SessionCard.test.tsx`.

## Commit & Pull Request Guidelines
Git history is not available in this workspace, so no repository-specific commit convention could be inferred. Use short, imperative commit subjects such as `Rename app branding to Overwatch` or `Restyle dashboard header`. Pull requests should include: a concise summary, affected areas (`sessions/` or `frontend/`), manual verification steps, and screenshots for UI changes.

## Security & Configuration Tips
This app reads local Claude/Codex state and tmux/process metadata. Do not commit machine-specific secrets, home-directory dumps, or generated `node_modules/` content. Keep absolute paths out of permanent docs unless they are clearly examples.
