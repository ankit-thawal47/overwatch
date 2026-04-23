.PHONY: install dev backend frontend

install:
	uv pip install -e .
	cd frontend && npm install

dev:
	make -j2 backend frontend

backend:
	uv run uvicorn sessions.main:app --host 0.0.0.0 --port 8080 --reload

frontend:
	cd frontend && npm run dev -- --host
