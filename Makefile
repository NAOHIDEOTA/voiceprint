.PHONY: up build test demo models release-models publish publish-patch publish-minor

HF_REPO := sollonao/voiceprint-models

up:
	docker compose up -d --build

build:
	docker exec voiceprint npm run build

test:
	docker exec voiceprint npm run test:rust
	docker exec voiceprint npm test

models:
	docker exec voiceprint bash scripts/prepare_models.sh

# models/ の ONNX を Hugging Face Hub にアップロードする。
# GitHub Releases は CORS 非対応でブラウザから取得できないため使わない。
# hf CLI 未導入なら: pip install huggingface_hub && hf auth login
release-models:
	@command -v hf >/dev/null 2>&1 || { echo "hf CLI がありません。'pip install huggingface_hub && hf auth login' を実行するか、https://huggingface.co/$(HF_REPO)/tree/main から手動アップロードしてください"; exit 1; }
	hf upload $(HF_REPO) models/campplus-zhen-int8.onnx campplus-zhen-int8.onnx
	hf upload $(HF_REPO) models/campplus-zhen.onnx campplus-zhen.onnx
	hf upload $(HF_REPO) models/eres2netv2-zh.onnx eres2netv2-zh.onnx

demo:
	docker exec -d voiceprint npx http-server /workspace -p 8081 --cors
	@echo "http://localhost:8081/docs/"

publish:
	docker exec voiceprint npm run build
	npm publish --ignore-scripts

publish-patch:
	npm version patch --no-git-tag-version
	docker exec voiceprint npm run build
	npm publish --ignore-scripts

publish-minor:
	npm version minor --no-git-tag-version
	docker exec voiceprint npm run build
	npm publish --ignore-scripts
