# Marg CAT PYQ source bank

This directory is generated from the CAT PDFs supplied for 2017–2025.

- `manifest.json` records each unique paper, its checksum, year, slot, extraction totals and review state.
- `papers/*.json` stores question-paper text, options where extraction is dependable, and answer keys where recoverable.
- Coaching-provider solution prose is intentionally excluded. Marg should produce its own concise, independently checked explanation.
- `answer_key_ready` means a single MCQ has clean text, four extracted options and a matching answer key.
- `quarantined` means the record is useful for source coverage/calibration but must not be shown directly yet.
- RC and DILR questions remain quarantined until their complete shared passage/set context is grouped and verified.

Rebuild after adding another source PDF:

```sh
python3 scripts/build_cat_pyq_bank.py --source-dir /path/to/source/pdfs
```

The builder never guesses a missing answer or repairs corrupted mathematical notation silently.
