set shell := ["zsh", "-cu"]

release-validate:
	python3 tools/hil/validate_supported_boards.py
	python3 tools/hil/validate_docs_parity.py
	python3 tools/hil/validate_release_evidence.py
