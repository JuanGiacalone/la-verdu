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
	test test-integration typecheck lint format

help:
	@echo "dev-up          start the local stack (db, api, simulators)"
	@echo "dev-down        stop the local stack"
	@echo "dev-logs        follow the stack logs"
	@echo "dev-seed        load sucursales, personal, catalogo y metodos de pago"
	@echo "dev-sim-msg     send a simulated inbound message: make dev-sim-msg FROM=+5491100000201 TEXT=hola"
	@echo "dev-printouts   list simulated printouts"
	@echo "test            unit, contract and domain tests (no database)"
	@echo "test-integration schema and seed tests against laverdu_test"
	@echo "typecheck       TypeScript strict check across workspaces"
	@echo "lint            Biome check"

dev-up:
	@test -S "$(PODMAN_SOCKET)" || (mkdir -p "$(dir $(PODMAN_SOCKET))" && nohup podman system service --time=0 unix://$(PODMAN_SOCKET) >/dev/null 2>&1 &) ; sleep 1
	$(COMPOSE) up -d

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

test:
	npm test

test-integration:
	TEST_DATABASE_URL=$(TEST_DATABASE_URL) npm run test:integration -w @la-verdu/api

typecheck:
	npm run typecheck

lint:
	npm run lint

format:
	npm run format
