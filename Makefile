# La Verdu developer commands (PRD 19.2). Containers run with podman rootless.
#
# The compose CLI talks to the podman API socket. Override DOCKER_HOST if your socket differs.

SHELL := /bin/bash
export PATH := /home/linuxbrew/.linuxbrew/bin:$(PATH)

PODMAN_SOCKET ?= $(XDG_RUNTIME_DIR)/podman/podman.sock
export DOCKER_HOST ?= unix://$(PODMAN_SOCKET)
COMPOSE := docker-compose -f infra/compose/dev.yml
TEST_DATABASE_URL ?= postgres://laverdu:laverdu_dev_only@127.0.0.1:5433/laverdu_test

.PHONY: help dev-up dev-down dev-logs dev-seed dev-sim-msg dev-printouts \
	dev-up-local dev-down-local dev-local-check \
	test test-integration evals load-test typecheck lint format

help:
	@echo "dev-up          start the local stack (db, api, simulators)"
	@echo "dev-down        stop the local stack"
	@echo "dev-logs        follow the stack logs"
	@echo "dev-seed        load sucursales, personal, catalogo y metodos de pago"
	@echo "dev-sim-msg     send a simulated inbound message: make dev-sim-msg FROM=+5491100000201 TEXT=hola"
	@echo "dev-printouts   list simulated printouts"
	@echo "dev-up-local    start stack pointing at local LLM/STT (perfil A)"
	@echo "dev-down-local  stop the local-profile stack"
	@echo "dev-local-check probe local LLM and STT endpoints"
	@echo "test            unit, contract and domain tests (no database)"
	@echo "test-integration schema and seed tests against laverdu_test"
	@echo "evals           assistant eval suite (PRD 21.2) against stubs; requires dev-up"
	@echo "evals-hosted    eval suite against the real CHAT_*/STT_* providers"
	@echo "typecheck       TypeScript strict check across workspaces"
	@echo "lint            Biome check"

dev-up:
	@test -f .env || cp .env.example .env
	@test -S "$(PODMAN_SOCKET)" || (mkdir -p "$(dir $(PODMAN_SOCKET))" && nohup podman system service --time=0 unix://$(PODMAN_SOCKET) >/dev/null 2>&1 &) ; sleep 1
	$(COMPOSE) up -d

dev-up-no-print:
	@test -f .env || cp .env.example .env
	@test -S "$(PODMAN_SOCKET)" || (mkdir -p "$(dir $(PODMAN_SOCKET))" && nohup podman system service --time=0 unix://$(PODMAN_SOCKET) >/dev/null 2>&1 &) ; sleep 1
	docker-compose -f infra/compose/dev.no-print.yml up -d

dev-down:
	$(COMPOSE) down

dev-logs:
	$(COMPOSE) logs -f --tail=100

dev-seed:
	$(COMPOSE) exec api sh -c 'DATABASE_URL=$$DATABASE_URL npm run db:seed -w @la-verdu/api'

dev-sim-msg:
	@test -n "$(FROM)" || (echo "FROM is required, e.g. make dev-sim-msg FROM=+5491100000201 TEXT=hola" && exit 1)
	@test -n "$(TEXT)" || (echo "TEXT is required" && exit 1)
	curl -sf -X POST http://127.0.0.1:8081/inbound \
		-H 'content-type: application/json' \
		-d '{"from":"$(FROM)","text":"$(TEXT)"}'
	@echo

dev-printouts:
	@ls -1t .dev/printouts/*.txt 2>/dev/null | head -20; true

# ---- Modo local (perfil A): LLM/STT en el host, sin API key ----
# Requiere Ollama/llama.cpp/vLLM y (opcional) faster-whisper/whisper.cpp
# corriendo en el host. Override de variables via infra/compose/dev.local.yml.
dev-up-local:
	@test -f .env || cp .env.example .env
	@test -f infra/compose/dev.local.yml || (echo "Falta infra/compose/dev.local.yml. Copiá el ejemplo de docs/local-mode-testing.md" && exit 1)
	@test -S "$(PODMAN_SOCKET)" || (mkdir -p "$(dir $(PODMAN_SOCKET))" && nohup podman system service --time=0 unix://$(PODMAN_SOCKET) >/dev/null 2>&1 &) ; sleep 1
	$(COMPOSE) -f infra/compose/dev.yml -f infra/compose/dev.local.yml up -d

dev-down-local:
	$(COMPOSE) -f infra/compose/dev.yml -f infra/compose/dev.local.yml down

dev-local-check:
	@echo ">> LLM local"
	@curl -sf -X POST "$${CHAT_BASE_URL:-http://localhost:11434/v1}/chat/completions" \
		-H 'content-type: application/json' \
		-d '{"model":"'"$${CHAT_MODEL:-llama3.1:8b}"'","messages":[{"role":"user","content":"OK"}],"temperature":0}' \
		| head -c 200; echo
	@echo ">> STT local"
	@curl -sf "$${STT_BASE_URL:-http://localhost:8083}/health" || echo "(sin health endpoint, probá /v1/audio/transcriptions)"
test:
	npm test

test-integration:
	TEST_DATABASE_URL=$(TEST_DATABASE_URL) npm run test:integration -w @la-verdu/api

# Eval suite (PRD 21.1-21.2, T6.7). Stubs replay evals/fixtures/; requires
# `make dev-up` (db + llm-stub + stt-stub) and the laverdu_test database.
# Flow evals reset and reseed TEST_DATABASE_URL per case: never point it at
# a database you care about.
evals:
	TEST_DATABASE_URL=$(TEST_DATABASE_URL) \
	CHAT_BASE_URL=$${CHAT_BASE_URL:-http://127.0.0.1:8082/v1} \
	STT_BASE_URL=$${STT_BASE_URL:-http://127.0.0.1:8083/v1} \
	npx tsx evals/run-evals.ts

evals-hosted:
	@test -n "$(CHAT_API_KEY)$$CHAT_API_KEY" || (echo "CHAT_API_KEY is required for hosted evals" && exit 1)
	TEST_DATABASE_URL=$(TEST_DATABASE_URL) npx tsx evals/run-evals.ts --provider=hosted

# Load test (PRD T6.5, RNF-05): 20 concurrent customer flows per branch.
load-test:
	TEST_DATABASE_URL=$(TEST_DATABASE_URL) npx tsx scripts/load-test.ts

typecheck:
	npm run typecheck

lint:
	npm run lint

format:
	npm run format
