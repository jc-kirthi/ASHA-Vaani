.PHONY: all run test eval purge audio zip clean

all: run

run:
	@chmod +x run.sh
	@./run.sh

test:
	@python3 tests/test_all.py

eval:
	@python3 scripts/eval.py

purge:
	@chmod +x scripts/purge.py
	@python3 scripts/purge.py

audio:
	@python3 scripts/make_noisy_audio.py --mode audio --snr 10

zip:
	@chmod +x scripts/package_zip.py
	@python3 scripts/package_zip.py

clean:
	@rm -rf dist/ build/ data/cache/* __pycache__ tests/__pycache__ app/__pycache__ scripts/__pycache__
