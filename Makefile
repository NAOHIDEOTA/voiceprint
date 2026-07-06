.PHONY: up build test demo models release-models publish publish-patch publish-minor

up:
	docker compose up -d --build

build:
	docker exec voiceprint npm run build

test:
	docker exec voiceprint npm run test:rust
	docker exec voiceprint npm test

# ONNXモデルを取得し、small (int8量子化) を生成して models/ に配置する
models:
	docker exec voiceprint bash scripts/prepare_models.sh

# models/ の ONNX を GitHub Releases (tag: models-v1) にアップロードする
release-models:
	gh release view models-v1 >/dev/null 2>&1 || gh release create models-v1 --title "Models v1" --notes "Speaker embedding ONNX models (3D-Speaker, Apache-2.0)"
	gh release upload models-v1 models/campplus-zhen-int8.onnx models/campplus-zhen.onnx models/eres2netv2-zh.onnx --clobber

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
