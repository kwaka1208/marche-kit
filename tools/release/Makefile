# marche-kit（配置済み）の操作用の入口
#
#     make help     できることの一覧
#
# site/ は公開ディレクトリと同じ形にすでに組み立ててあります。
# ここでは、設定を注入し、検証して、サーバーへ送るところだけを扱います。
#
#     make env            .env を作る
#     （.env と site/ の設定ファイルを書く）
#     make setup          秘密情報を注入して検証する
#     make deploy-init    初回。サーバーへ送る
#     make deploy         2回目以降。出店者が書き込んだ内容は上書きしない
#
# 確認を省いて走らせたいときは YES=1 を付けてください。

SHELL := /bin/bash
.DEFAULT_GOAL := help

# 公開ディレクトリと同じ形のディレクトリ
SITE ?= site

PY ?= python3

.PHONY: help env inject validate setup \
        deploy-dry deploy-init deploy deploy-prune permissions

help: ## できることの一覧
	@echo
	@echo "  marche-kit（配置済み）"
	@echo
	@echo "  準備"
	@grep -E '^(env|inject|validate|setup):.*##' $(MAKEFILE_LIST) \
	  | awk -F':.*## ' '{ printf "    make %-14s %s\n", $$1, $$2 }'
	@echo
	@echo "  サーバーへ送る"
	@grep -E '^(deploy-dry|deploy-init|deploy|deploy-prune|permissions):.*##' $(MAKEFILE_LIST) \
	  | awk -F':.*## ' '{ printf "    make %-14s %s\n", $$1, $$2 }'
	@echo
	@echo "  はじめてなら"
	@echo "    1. make env                .env ができます"
	@echo "    2. .env を開いて書く       管理キー・通知先メール・サーバーの接続先"
	@echo "    3. site/ の設定を書く      marche.config.json（イベント）"
	@echo "                               data/shops.json（出店者）"
	@echo "    4. make setup              注入して検証する"
	@echo "    5. make deploy-init        サーバーへ送る"
	@echo
	@echo "  何をどこに書くかは START-HERE.md にまとまっています。"
	@echo

env: ## .env.example から .env を作る（既にあれば何もしない）
	@if [ -f .env ]; then \
	    echo "  .env はすでにあります（上書きしません）"; \
	else \
	    cp .env.example .env; \
	    echo "  .env を作りました。開いて値を書いてください"; \
	    echo "    管理キー・通知先メール → MARCHE_*"; \
	    echo "    サーバーの接続先       → DEPLOY_*"; \
	fi

inject: ## .env の秘密情報を site/ へ流し込む
	@$(PY) tools/inject-env.py "$(SITE)"

validate: ## site/ の中身が仕様どおりか確かめる
	@$(PY) tools/validate.py "$(SITE)"

setup: inject validate ## 注入 → 検証 をまとめて
	@echo
	@echo "  通りました。make deploy-init でサーバーへ送れます。"

deploy-dry: validate ## 送らずに、何が変わるかだけ見る
	@bash tools/deploy.sh "$(SITE)" dry

deploy-init: validate ## 初回。中身をすべて送る
	@bash tools/deploy.sh "$(SITE)" init
	@$(MAKE) --no-print-directory permissions

deploy: validate ## 2回目以降。出店者が書き込んだ内容は上書きしない
	@bash tools/deploy.sh "$(SITE)" update

deploy-prune: validate ## deploy に加えて、サーバー側の余計なファイルを消す
	@bash tools/deploy.sh "$(SITE)" prune

permissions: ## サーバー側のパーミッションを整える
	@bash tools/deploy.sh "$(SITE)" permissions
