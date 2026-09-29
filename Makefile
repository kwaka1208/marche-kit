# marche-kit の操作用の入口
#
#     make help     できることの一覧
#
# リポジトリ（素材一式）から、公開ディレクトリと同じ形を組み立て、
# 設定を注入し、検証して、サーバーへ送るまでをまとめてあります。
# 中身は docs/setup.md の手順そのままで、tools/ のスクリプトを呼んでいるだけです。
#
# 変数で挙動を変えられます。
#
#     make build THEME=night-market       テーマを変える
#     make build SITE=../my-event-site    配置用ディレクトリの場所を変える
#     make deploy YES=1                   確認を省く（CI向け）

SHELL := /bin/bash
.DEFAULT_GOAL := help

# 使うテーマ（themes/ の下の名前）
THEME ?= default

# 配置用ディレクトリ。**ここが公開ディレクトリと同じ形になります**
SITE ?= build/site

PY ?= python3

.PHONY: help env site config inject validate build \
        deploy-dry deploy-init deploy deploy-prune permissions clean

# ---------------------------------------------------------------- 案内

help: ## できることの一覧
	@echo
	@echo "  marche-kit"
	@echo
	@echo "  準備"
	@grep -E '^(env|site|config|inject|validate|build):.*##' $(MAKEFILE_LIST) \
	  | awk -F':.*## ' '{ printf "    make %-14s %s\n", $$1, $$2 }'
	@echo
	@echo "  サーバーへ送る"
	@grep -E '^(deploy-dry|deploy-init|deploy|deploy-prune|permissions):.*##' $(MAKEFILE_LIST) \
	  | awk -F':.*## ' '{ printf "    make %-14s %s\n", $$1, $$2 }'
	@echo
	@echo "  その他"
	@grep -E '^(clean|help):.*##' $(MAKEFILE_LIST) \
	  | awk -F':.*## ' '{ printf "    make %-14s %s\n", $$1, $$2 }'
	@echo
	@echo "  いまの設定    THEME=$(THEME)  SITE=$(SITE)"
	@echo
	@echo "  はじめてなら  make env → .env を書く → make build → make deploy-init"
	@echo

# ---------------------------------------------------------------- 準備

env: ## .env.example から .env を作る（既にあれば何もしない）
	@if [ -f .env ]; then \
	    echo "  .env はすでにあります（上書きしません）"; \
	else \
	    cp .env.example .env; \
	    echo "  .env を作りました。開いて値を書いてください"; \
	    echo "    管理キー・通知先メール → MARCHE_*"; \
	    echo "    サーバーの接続先       → DEPLOY_*"; \
	fi

site: ## 配置用ディレクトリを組み立てる（自分で書いたファイルは残す）
	@mkdir -p "$(SITE)"/{css,js,i18n,editor,forms,data/shop-data}
	@echo "▸ コアを入れます（毎回入れ替えます。編集しない前提のファイルです）"
	@rsync -aL --delete core/js/     "$(SITE)/js/"
	@rsync -aL --delete core/i18n/   "$(SITE)/i18n/"
	@rsync -aL --delete core/editor/ "$(SITE)/editor/"
	@cp core/php/config.php core/php/shop-upload.php \
	    core/php/put-json.php core/php/send.php "$(SITE)/data/"
	@echo "▸ テーマを入れます（$(THEME)。**すでにあるものは残します**）"
	@if [ -f "$(SITE)/index.html" ]; then \
	    echo "    index.html   そのまま（スロットを足した分を消さないため）"; \
	else \
	    cp "themes/$(THEME)/index.html" "$(SITE)/"; echo "    index.html   入れました"; fi
	@if [ -n "$$(ls -A "$(SITE)/css" 2>/dev/null)" ]; then \
	    echo "    css/         そのまま"; \
	else \
	    cp themes/$(THEME)/*.css "$(SITE)/css/"; echo "    css/         入れました"; fi
	@if [ -d "$(SITE)/images" ]; then \
	    echo "    images/      そのまま"; \
	else \
	    rsync -aL "themes/$(THEME)/images/" "$(SITE)/images/"; echo "    images/      入れました"; fi
	@if [ -f "$(SITE)/forms/contact.json" ]; then \
	    echo "    forms/       そのまま"; \
	else \
	    cp examples/demo/forms/contact.json "$(SITE)/forms/"; echo "    forms/       見本を入れました"; fi
	@if [ -f "$(SITE)/data/news.json" ]; then \
	    echo "    news.json    そのまま"; \
	else \
	    echo '[]' > "$(SITE)/data/news.json"; echo "    news.json    空で作りました"; fi
	@$(MAKE) --no-print-directory config

config: ## marche.config.json と shops.json の雛形を作る（既にあれば触らない）
	@if [ -f "$(SITE)/marche.config.json" ] || [ -f "$(SITE)/data/shops.json" ]; then \
	    echo "    設定ファイル そのまま（上書きすると書いた内容が消えるため）"; \
	else \
	    $(PY) tools/make-templates.py "$(THEME)" "$(SITE)"; \
	fi

inject: ## .env の秘密情報を配置用ディレクトリへ流し込む
	@$(PY) tools/inject-env.py "$(SITE)"

validate: ## 配置用ディレクトリの中身が仕様どおりか確かめる
	@$(PY) tools/validate.py "$(SITE)"

build: site inject validate ## 組み立て → 注入 → 検証 をまとめて
	@echo
	@echo "  $(SITE)/ ができました。中身を見て、イベントの内容を書いてください。"
	@echo "    $(SITE)/marche.config.json   イベント名・会場・開催日"
	@echo "    $(SITE)/data/shops.json      出店者ロスター"
	@echo "    $(SITE)/index.html           区分を増やすときのスロット"
	@echo
	@echo "  書き換えたら make validate、通ったら make deploy-init です。"

# ---------------------------------------------------------------- サーバーへ送る

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

# ---------------------------------------------------------------- その他

clean: ## 配置用ディレクトリを消す（**書いた設定も消えます**）
	@if [ ! -d "$(SITE)" ]; then echo "  $(SITE) はありません"; exit 0; fi; \
	read -r -p "$(SITE)/ を消します。よろしいですか？ [y/N] " a; \
	case "$$a" in y|Y|yes|YES) rm -rf "$(SITE)"; echo "  消しました" ;; \
	              *) echo "  やめました" ;; esac
