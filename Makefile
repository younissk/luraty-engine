# @luraty/engine
#
# `make` on its own lists everything. Every target is a thin wrapper over an npm script, so nothing
# here is a second source of truth — the scripts stay authoritative and this is the map.

HERMES_VERSION := v0.13.0
HERMES_DIR     := .hermes

.DEFAULT_GOAL := help

# ── Getting started ────────────────────────────────────────────────────────────────────────────

.PHONY: setup
setup: ## Install dependencies and git hooks. Run this first.
	npm install
	@echo ""
	@echo "Ready. Try 'make check'."

.PHONY: check
check: ## The gate: format, typecheck, lint, test. ~3s. Run before every commit.
	npm run check

.PHONY: test
test: ## Run the test suite once.
	npm test

.PHONY: demo
demo: ## Run a simulated learner for 30 days and print what the engine decides. Try 'make demo'.
	@# Not a test. The suite proves the engine is correct; this shows what correct looks like.
	npm run demo

.PHONY: watch
watch: ## Run tests continuously while you edit.
	npm run test:watch

# ── Individual lanes ───────────────────────────────────────────────────────────────────────────

.PHONY: typecheck
typecheck: ## Typecheck without emitting.
	npm run typecheck

.PHONY: lint
lint: ## Lint, including the determinism and Hermes/ICU rules.
	npm run lint

.PHONY: format
format: ## Rewrite every file with prettier. Formatting is not a review topic.
	npm run format

# ── The deeper checks ──────────────────────────────────────────────────────────────────────────

.PHONY: hermes
hermes: ## Verify the engine behaves IDENTICALLY on Hermes and Node. Needs 'make hermes-install'.
	npm run test:hermes

.PHONY: hermes-install
hermes-install: ## Download the Hermes VM (v0.13.0, ~10MB) into .hermes/. Gitignored.
	@# The engine's headline claim is that it runs unchanged on Hermes, which ships without full
	@# ICU. Until this binary exists that claim is untested — every other lane runs on Node, where
	@# the ICU-backed APIs all work perfectly and hide the bug.
	@mkdir -p $(HERMES_DIR)
	@echo "Downloading Hermes $(HERMES_VERSION) from facebook/hermes…"
	@gh release download $(HERMES_VERSION) --repo facebook/hermes \
		--pattern 'hermes-cli-darwin.tar.gz' --dir $(HERMES_DIR) --clobber
	@tar -xzf $(HERMES_DIR)/hermes-cli-darwin.tar.gz -C $(HERMES_DIR)
	@rm -f $(HERMES_DIR)/hermes-cli-darwin.tar.gz
	@echo "Installed. Run 'make hermes'."

.PHONY: bench
bench: ## How fast is it, on the runtime that ships? Node + Hermes, projected onto a phone.
	@# NOT a gate — a wall-clock assertion fails on a busy laptop. This produces numbers; you read
	@# them. Pass --pack, or every pack number is measured against a 200-word fixture and flatters.
	npm run bench -- --pack ../packs/de

.PHONY: bench-quick
bench-quick: ## The same, in seconds rather than minutes. Two profile sizes, three samples.
	npm run bench -- --pack ../packs/de --quick

.PHONY: stress
stress: ## What it CANNOT take: 250k-unit profiles, 1MB texts, adversarial input, each isolated.
	@# Every scenario runs in its own process, so an out-of-memory names one limit instead of
	@# killing the sweep. Minutes.
	npm run bench -- --pack ../packs/de --stress

.PHONY: mutate
mutate: ## Mutation audit — does the suite actually pin anything? Minutes, not seconds.
	@# Deliberately NOT part of 'check', and with no score threshold: a hard number is one that
	@# eventually gets lowered so a commit can land. Read the survivors, fix what matters.
	npm run mutate

.PHONY: coverage
coverage: ## Test coverage report.
	npm run coverage

.PHONY: verify
verify: check hermes ## Everything that can run locally: the gate plus the cross-runtime lane.
	@echo ""
	@echo "All local checks passed. 'make mutate' is the deeper audit."

# ── Release ────────────────────────────────────────────────────────────────────────────────────

.PHONY: build
build: ## Build dist/. NOT part of the daily loop — the engine is consumed as TypeScript source.
	npm run build

.PHONY: publish-check
publish-check: ## Build and validate the package as npm would see it.
	npm run check:publish

.PHONY: changeset
changeset: ## Describe a change for the changelog. Only for changes a consumer can rely on.
	npm run changeset

# ── Housekeeping ───────────────────────────────────────────────────────────────────────────────

.PHONY: clean
clean: ## Remove build output and reports. Leaves node_modules and the Hermes binary.
	rm -rf dist reports coverage .stryker-tmp

.PHONY: help
help: ## Show this help.
	@echo "@luraty/engine — the runtime-agnostic learning core"
	@echo ""
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  New here?  make setup && make check"
	@echo "  Read next: CLAUDE.md (the rules), docs/concepts/ (why they exist)"
