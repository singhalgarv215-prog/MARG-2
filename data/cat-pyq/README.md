# Marg CAT PYQ source bank

This directory is generated from the CAT PDFs supplied for 2017–2025.

- `manifest.json` records each unique paper, its checksum, year, slot, extraction totals and review state.
- `papers/*.json` stores question-paper text, options where extraction is dependable, and answer keys where recoverable.
- Coaching-provider solution prose is intentionally excluded. Marg should produce its own concise, independently checked explanation.
- `answer_key_ready` means a single MCQ has clean text, four extracted options and a matching answer-table entry. It does not mean the answer was solved independently.
- `quarantined` means the record is useful for source coverage or calibration but must not be shown directly.
- Reading comprehension and DILR questions stay unavailable until the shared passage or data is present in the record and checked. An extracted answer table is not that check.
- `verification-status.json` classifies every indexed question. Student practice uses only the items recomputed in `/cat-bank-verification.js`, together with the hand-checked packs already embedded in the app. Indexed DILR is not offered.

Rebuild the paper index after adding another source PDF:

```sh
python3 build_cat_pyq_bank.py --source-dir /path/to/source/pdfs
```

Regenerate the checked overlay from the current paper files:

```sh
node scripts/build-cat-bank-verification.cjs
```

The builder never guesses a missing answer or repairs corrupted mathematical notation silently.
