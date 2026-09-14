#!/usr/bin/env python3
"""Build Marg's local CAT PYQ source bank from user-supplied PDFs.

The builder deliberately keeps source extraction separate from student-facing
eligibility. A paper can be indexed for calibration while an individual item is
quarantined if its answer, options, formula text, or shared passage/set context
cannot be recovered safely.

Third-party solution prose is never copied into the generated bank.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from pypdf import PdfReader


SCHEMA_VERSION = 1


@dataclass(frozen=True)
class PaperSpec:
    filename: str
    year: int
    slot: int
    section_counts: dict[str, int]
    numbering: str


PAPERS = [
    PaperSpec("CAT-2017-SLOT-1.pdf", 2017, 1, {"varc": 34, "dilr": 32, "qa": 34}, "global"),
    PaperSpec("CAT-2017-SLOT-2.pdf", 2017, 2, {"varc": 34, "dilr": 32, "qa": 34}, "global"),
    PaperSpec("CAT-2018SLOT-1.pdf", 2018, 1, {"varc": 34, "dilr": 32, "qa": 34}, "global"),
    PaperSpec("CAT-2018-SLOT-2.pdf", 2018, 2, {"varc": 34, "dilr": 32, "qa": 34}, "global"),
    PaperSpec("CAT-2019-OFFICIAL-question-paper-solution-slot-1-Bodheeprep.pdf", 2019, 1, {"varc": 34, "dilr": 32, "qa": 34}, "global"),
    PaperSpec("CAT-2019-OFFICIAL-question-paper-solution-slot-2-Bodheeprep.pdf", 2019, 2, {"varc": 34, "dilr": 32, "qa": 34}, "global"),
    PaperSpec("CAT-2020-Question-paper-with-Solutions-Slot-1-Bodhee-Prep.pdf", 2020, 1, {"varc": 26, "dilr": 24, "qa": 26}, "global"),
    PaperSpec("CAT-2020-Question-paper-with-Solutions-Slot-2-Bodhee-Prep.pdf", 2020, 2, {"varc": 26, "dilr": 24, "qa": 26}, "global"),
    PaperSpec("CAT-2020-Question-paper-with-Solutions-Slot-3-Bodhee-Prep.pdf", 2020, 3, {"varc": 26, "dilr": 24, "qa": 26}, "global"),
    PaperSpec("CAT-2021-paper-slot-1-with-answer-keys.pdf", 2021, 1, {"varc": 24, "dilr": 20, "qa": 22}, "section"),
    PaperSpec("CAT-2021-paper-slot-2-with-answer-keys.pdf", 2021, 2, {"varc": 24, "dilr": 20, "qa": 22}, "section"),
    PaperSpec("CAT-2021-paper-slot-3-with-answer-keys.pdf", 2021, 3, {"varc": 24, "dilr": 20, "qa": 22}, "section"),
    PaperSpec("CAT-2022-Question-Paper-Slot-1-with-Answer-Keys-Bodhee-Prep.pdf", 2022, 1, {"varc": 24, "dilr": 20, "qa": 22}, "section"),
    PaperSpec("CAT-2022-Question-Paper-slot-2-with-Answer-Keys-by-Bodhee-Prep.pdf", 2022, 2, {"varc": 24, "dilr": 20, "qa": 22}, "section"),
    PaperSpec("CAT-2022-Question-Paper-slot-3-with-Answer-Keys-by-Bodhee-Prep.pdf", 2022, 3, {"varc": 24, "dilr": 20, "qa": 22}, "section"),
    PaperSpec("CAt-2023-Question-Paper-slot-01-answer-keys-Bodheeprep.pdf", 2023, 1, {"varc": 24, "dilr": 20, "qa": 22}, "section"),
    PaperSpec("CAt-2023-Question-Paper-slot-02-answer-keys-Bodheeprep.pdf", 2023, 2, {"varc": 24, "dilr": 20, "qa": 22}, "section"),
    PaperSpec("CAt-2023-Question-Paper-slot-03.pdf", 2023, 3, {"varc": 24, "dilr": 20, "qa": 22}, "section"),
    PaperSpec("CAT-2024-Slot-01-Final-with-Answer-Keys.pdf", 2024, 1, {"varc": 24, "dilr": 22, "qa": 22}, "section"),
    PaperSpec("CAT-2024-Slot-02-Final-with-Answer-Keys.pdf", 2024, 2, {"varc": 24, "dilr": 22, "qa": 22}, "section"),
    PaperSpec("CAT-2025-Slot-01.pdf", 2025, 1, {"varc": 24, "dilr": 22, "qa": 22}, "global"),
    PaperSpec("CAT-2025-Slot-02.pdf", 2025, 2, {"varc": 24, "dilr": 22, "qa": 22}, "global"),
    PaperSpec("CAT-2025-Slot-03.pdf", 2025, 3, {"varc": 24, "dilr": 22, "qa": 22}, "global"),
]


SECTION_ORDER = ("varc", "dilr", "qa")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_space(text: str) -> str:
    text = text.replace("\u00a0", " ").replace("\u200b", "")
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"\b(?:CAT\s+\d{4}[^\n]{0,80}|Online CAT Course[^\n]*|Get Full details|Click to join[^\n]*)\b", " ", text, flags=re.I)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def page_for_offset(offset: int, page_offsets: list[int]) -> int:
    page = 1
    for index, start in enumerate(page_offsets, start=1):
        if start > offset:
            break
        page = index
    return page


def section_for_global_number(spec: PaperSpec, number: int) -> tuple[str, int]:
    cursor = 0
    for section in SECTION_ORDER:
        count = spec.section_counts[section]
        if cursor < number <= cursor + count:
            return section, number - cursor
        cursor += count
    raise ValueError(f"Question {number} is outside the configured paper range")


def section_bounds(text: str, spec: PaperSpec) -> dict[str, tuple[int, int]]:
    patterns = {
        "varc": [r"Section\s*(?:0?1\s*:|:)\s*Verbal Ability", r"Section\s*:\s*VARC", r"\bVARC Section\b", r"VERBAL ABILITY AND READING COMPREHENSION"],
        "dilr": [r"Section\s*(?:0?2\s*:|:)\s*Data [Ii]nterpretation", r"Section\s*:\s*DILR", r"\bDILR Section\b", r"DATA INTERPRETATION AND LOGICAL REASONING"],
        "qa": [r"Section\s*(?:0?3\s*:|:)\s*Quantitative Aptitude", r"Section\s*:\s*(?:Quant|QA)", r"\bQuant Section\b", r"QUANTITATIVE APTITUDE"],
    }
    starts: dict[str, int] = {}
    for section, candidates in patterns.items():
        matches: list[int] = []
        for pattern in candidates:
            matches.extend(m.start() for m in re.finditer(pattern, text, flags=re.I))
        if matches:
            starts[section] = min(matches)
    if len(starts) != 3:
        return {}
    ordered = sorted((position, section) for section, position in starts.items())
    answer_start = answer_material_start(text)
    bounds: dict[str, tuple[int, int]] = {}
    for idx, (start, section) in enumerate(ordered):
        end = ordered[idx + 1][0] if idx + 1 < len(ordered) else answer_start
        bounds[section] = (start, end)
    return bounds


def answer_material_start(text: str) -> int:
    candidates = []
    for pattern in (
        r"\nAnswer Keys?\s*(?:\n|$)",
        r"\nQNo:-\s*\u00a0*\s*1\s*[, ]+Correct Answer",
        r"\nSolutions?\s+1\s*(?:\n|:)",
    ):
        for match in re.finditer(pattern, text, flags=re.I):
            if match.start() > len(text) * 0.35:
                candidates.append(match.start())
    return min(candidates) if candidates else len(text)


def marker_pattern(year: int) -> re.Pattern[str]:
    if year == 2017:
        return re.compile(r"Question No\.\s*:\s*(\d+)", re.I)
    if year == 2018:
        return re.compile(r"(?m)^Q\s+(\d+)\s*:")
    if 2019 <= year <= 2024:
        return re.compile(r"(?m)^Q\.\s*(\d+)\s*[):]?")
    # 2025 uses plain numbered questions. Real question starts are separated by
    # a blank extraction line; numbered statements inside VA/DILR are not.
    return re.compile(r"(?m)(?:^|\n\s*\n)\s*(\d+)\.\s+")


def find_ordered_markers(text: str, year: int, expected_numbers: Iterable[int]) -> list[re.Match[str]]:
    expected = list(expected_numbers)
    matches = list(marker_pattern(year).finditer(text))
    selected: list[re.Match[str]] = []
    floor = -1
    for number in expected:
        candidates = [m for m in matches if int(m.group(1)) == number and m.start() > floor]
        if not candidates:
            break
        # Prefer a candidate that leaves room for the immediately following
        # question number. This avoids numbered statements inside a question.
        choice = candidates[0]
        if number != expected[-1]:
            next_number = number + 1
            viable = []
            for candidate in candidates:
                if any(int(n.group(1)) == next_number and n.start() > candidate.start() + 35 for n in matches):
                    viable.append(candidate)
            if viable:
                choice = viable[0]
        selected.append(choice)
        floor = choice.start() + 20
    return selected


def split_questions(text: str, spec: PaperSpec, page_offsets: list[int]) -> list[dict]:
    records: list[dict] = []
    if spec.numbering == "section":
        bounds = section_bounds(text, spec)
        if len(bounds) != 3:
            return records
        for section in SECTION_ORDER:
            start, end = bounds[section]
            segment = text[start:end]
            markers = find_ordered_markers(segment, spec.year, range(1, spec.section_counts[section] + 1))
            records.extend(question_records_from_markers(segment, markers, spec, section, start, page_offsets))
    else:
        end = answer_material_start(text)
        segment = text[:end]
        total = sum(spec.section_counts.values())
        markers = find_ordered_markers(segment, spec.year, range(1, total + 1))
        records.extend(question_records_from_markers(segment, markers, spec, None, 0, page_offsets))
    return records


def question_records_from_markers(
    segment: str,
    markers: list[re.Match[str]],
    spec: PaperSpec,
    fixed_section: str | None,
    absolute_start: int,
    page_offsets: list[int],
) -> list[dict]:
    records = []
    for idx, marker in enumerate(markers):
        number = int(marker.group(1))
        end = markers[idx + 1].start() if idx + 1 < len(markers) else len(segment)
        block = normalize_space(segment[marker.end():end])
        if fixed_section:
            section, section_number = fixed_section, number
        else:
            section, section_number = section_for_global_number(spec, number)
        stem, options = extract_stem_and_options(block)
        records.append({
            "id": f"cat-{spec.year}-s{spec.slot}-{section}-q{section_number}",
            "section": section,
            "question_number": section_number,
            "paper_question_number": number,
            "source_page": page_for_offset(absolute_start + marker.start(), page_offsets),
            "stem": stem,
            "options": options,
            "answer_raw": None,
            "correct_index": None,
            "question_type": "mcq" if len(options) == 4 else "tita_or_unparsed",
            "direct_use_status": "quarantined",
            "review_notes": [],
        })
    return records


def extract_stem_and_options(block: str) -> tuple[str, list[str]]:
    option_patterns = [
        re.compile(r"(?m)^\[(1|2|3|4)\]\s*"),
        re.compile(r"\((1|2|3|4)\)\s*"),
        re.compile(r"(?m)^(1|2|3|4)\.\s+"),
        re.compile(r"(?m)^([A-D])\.\s+"),
        re.compile(r"(?m)^([a-dA-D])\)\s+"),
    ]
    best: tuple[int, list[re.Match[str]]] | None = None
    for pattern in option_patterns:
        candidates = list(pattern.finditer(block))
        for start_idx, candidate in enumerate(candidates):
            sequence = candidates[start_idx:start_idx + 4]
            labels = [item.group(1).upper() for item in sequence]
            if len(sequence) == 4 and labels in (["1", "2", "3", "4"], ["A", "B", "C", "D"]):
                if best is None or candidate.start() > best[0]:
                    best = (candidate.start(), sequence)
                break
    if best is None:
        return block, []
    option_start, sequence = best
    options = []
    for idx, match in enumerate(sequence):
        end = sequence[idx + 1].start() if idx + 1 < len(sequence) else len(block)
        option = normalize_space(block[match.end():end])
        options.append(option)
    return normalize_space(block[:option_start]), options


def parse_answers(text: str, spec: PaperSpec) -> dict[tuple[str, int], str]:
    if spec.year == 2017:
        answers = re.findall(r"QNo:-\s*\u00a0*\s*(\d+)\s*[, ]+Correct Answer:-\s*\u00a0*\s*\n?\s*([A-D])", text, flags=re.I)
        return {
            section_for_global_number(spec, int(number)): answer.upper()
            for number, answer in answers[:sum(spec.section_counts.values())]
        }
    if spec.year == 2018:
        # The supplied 2018 files encode many answers only as PDF formatting;
        # extracted text does not retain a dependable answer key.
        return {}
    if spec.year == 2020:
        solution_start = answer_material_start(text)
        solution_text = text[solution_start:]
        values = re.findall(r"\[(?:Option|Answer):\s*([^\]]+)\]", solution_text, flags=re.I)
        result = {}
        for number, value in enumerate(values[:sum(spec.section_counts.values())], start=1):
            result[section_for_global_number(spec, number)] = value.strip()
        return result

    if spec.year == 2024:
        return parse_2024_answer_tables(text, spec)

    answer_matches = list(re.finditer(r"Answer Keys?\s*:?", text, flags=re.I))
    answer_start = answer_matches[-1].start() if answer_matches else -1
    if answer_start < 0:
        return {}
    tail = text[answer_start:]
    header = re.search(r"VARC\s+DILR\s+(?:QA|QUANT|Quant)", tail)
    if not header:
        return parse_2019_answer_table(tail, spec) if spec.year == 2019 else {}
    result: dict[tuple[str, int], str] = {}
    for raw_line in tail[header.end():].splitlines():
        tokens = raw_line.strip().split()
        if not tokens or not tokens[0].isdigit():
            continue
        if len(tokens) == 4:
            q = int(tokens[0])
            for section, value in zip(SECTION_ORDER, tokens[1:]):
                if q <= spec.section_counts[section]:
                    result[(section, q)] = value
        elif len(tokens) >= 6:
            for section, pair_start in zip(SECTION_ORDER, (0, 2, 4)):
                if pair_start + 1 < len(tokens) and tokens[pair_start].isdigit():
                    q = int(tokens[pair_start])
                    if spec.year == 2025:
                        try:
                            mapped_section, local_q = section_for_global_number(spec, q)
                        except ValueError:
                            continue
                        if mapped_section == section:
                            result[(section, local_q)] = tokens[pair_start + 1]
                    elif q <= spec.section_counts[section]:
                        result[(section, q)] = tokens[pair_start + 1]
    return result


def parse_2024_answer_tables(text: str, spec: PaperSpec) -> dict[tuple[str, int], str]:
    result: dict[tuple[str, int], str] = {}
    labels = {"varc": "VARC Section", "dilr": "DILR Section", "qa": "Quant Section"}
    starts = {section: text.rfind(label) for section, label in labels.items()}
    if any(position < 0 for position in starts.values()):
        return result
    ordered = sorted((position, section) for section, position in starts.items())
    for idx, (start, section) in enumerate(ordered):
        end = ordered[idx + 1][0] if idx + 1 < len(ordered) else len(text)
        for line in text[start:end].splitlines():
            tokens = line.strip().split()
            if len(tokens) < 2:
                continue
            for pair_start in range(0, len(tokens) - 1, 2):
                if not tokens[pair_start].isdigit():
                    continue
                question = int(tokens[pair_start])
                if 1 <= question <= spec.section_counts[section]:
                    result[(section, question)] = tokens[pair_start + 1]
    return result


def parse_2019_answer_table(tail: str, spec: PaperSpec) -> dict[tuple[str, int], str]:
    result: dict[tuple[str, int], str] = {}
    tail = re.split(r"\nSolution\s+1\s*:", tail, maxsplit=1, flags=re.I)[0]
    row_pattern = re.compile(r"(?m)^(\d+)\s+(Option:\s*[1-4]|\S+)\s+(\d+)\s+(Option:\s*[1-4]|\S+)\s+(\d+)\s+(Option:\s*[1-4]|\S+)\s+(\d+)\s+(Option:\s*[1-4]|\S+)")
    for match in row_pattern.finditer(tail):
        values = match.groups()
        for offset in range(0, 8, 2):
            number = int(values[offset])
            if 1 <= number <= sum(spec.section_counts.values()):
                result[section_for_global_number(spec, number)] = values[offset + 1].replace("Option:", "").strip()
    return result


def answer_to_index(answer: str | None, options: list[str]) -> int | None:
    if not answer or len(options) != 4:
        return None
    value = answer.strip().upper()
    if value in {"A", "B", "C", "D"}:
        return ord(value) - ord("A")
    if value in {"1", "2", "3", "4"}:
        return int(value) - 1
    return None


def extraction_is_clean(text: str) -> bool:
    if not text or len(text) < 12:
        return False
    if any("\ue000" <= char <= "\uf8ff" for char in text):
        return False
    words = re.findall(r"[A-Za-z]+", text)
    if len(words) >= 12 and sum(len(word) == 1 for word in words) / len(words) > 0.28:
        return False
    return True


def option_extraction_is_clean(text: str) -> bool:
    if not text or len(text) > 700:
        return False
    if any("\ue000" <= char <= "\uf8ff" for char in text):
        return False
    return True


def apply_answers_and_status(records: list[dict], answers: dict[tuple[str, int], str], spec: PaperSpec) -> None:
    for record in records:
        key = (record["section"], record["question_number"])
        answer = answers.get(key)
        record["answer_raw"] = answer
        record["correct_index"] = answer_to_index(answer, record["options"])
        notes = record["review_notes"]
        if not answer:
            notes.append("answer_not_reliably_extracted")
        if len(record["options"]) != 4:
            notes.append("options_not_reliably_extracted_or_tita")
        if not extraction_is_clean(record["stem"]) or any(not option_extraction_is_clean(option) for option in record["options"]):
            notes.append("text_or_formula_extraction_needs_review")
        if record["section"] in {"varc", "dilr"}:
            notes.append("shared_passage_or_set_context_not_yet_verified")
        if not notes and record["correct_index"] is not None:
            record["direct_use_status"] = "answer_key_ready"
        record["review_notes"] = sorted(set(notes))


def build_paper(path: Path, spec: PaperSpec) -> tuple[dict, dict]:
    reader = PdfReader(str(path))
    page_texts = [(page.extract_text() or "") for page in reader.pages]
    page_offsets = []
    cursor = 0
    for page_text in page_texts:
        page_offsets.append(cursor)
        cursor += len(page_text) + 1
    text = "\n".join(page_texts)
    records = split_questions(text, spec, page_offsets)
    answers = parse_answers(text, spec)
    apply_answers_and_status(records, answers, spec)
    expected = sum(spec.section_counts.values())
    actual_by_section = {section: sum(record["section"] == section for record in records) for section in SECTION_ORDER}
    ready_by_section = {section: sum(record["section"] == section and record["direct_use_status"] == "answer_key_ready" for record in records) for section in SECTION_ORDER}
    paper_id = f"cat-{spec.year}-slot-{spec.slot}"
    payload = {
        "schema_version": SCHEMA_VERSION,
        "paper": {
            "id": paper_id,
            "exam": "CAT",
            "year": spec.year,
            "slot": spec.slot,
            "source_filename": spec.filename,
            "source_sha256": sha256(path),
            "page_count": len(reader.pages),
            "expected_question_count": expected,
            "indexed_question_count": len(records),
            "section_counts": actual_by_section,
            "answer_key_ready_counts": ready_by_section,
            "source_policy": "Question text and answer key only; third-party solution prose excluded.",
        },
        "questions": records,
    }
    manifest_entry = payload["paper"] | {
        "asset": f"papers/{paper_id}.json",
        "complete_index": len(records) == expected and actual_by_section == spec.section_counts,
    }
    return payload, manifest_entry


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, default=Path.home() / "Downloads")
    parser.add_argument("--output-dir", type=Path, default=Path("data/cat-pyq"))
    args = parser.parse_args()

    missing = [spec.filename for spec in PAPERS if not (args.source_dir / spec.filename).exists()]
    if missing:
        raise SystemExit("Missing CAT PDF files:\n- " + "\n- ".join(missing))

    papers_dir = args.output_dir / "papers"
    papers_dir.mkdir(parents=True, exist_ok=True)
    manifest_entries = []
    totals = {"documents": 0, "questions_indexed": 0, "answer_key_ready": 0, "quarantined": 0}
    for spec in PAPERS:
        payload, entry = build_paper(args.source_dir / spec.filename, spec)
        target = papers_dir / f"cat-{spec.year}-slot-{spec.slot}.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        manifest_entries.append(entry)
        totals["documents"] += 1
        totals["questions_indexed"] += entry["indexed_question_count"]
        ready = sum(entry["answer_key_ready_counts"].values())
        totals["answer_key_ready"] += ready
        totals["quarantined"] += entry["indexed_question_count"] - ready

    manifest = {
        "schema_version": SCHEMA_VERSION,
        "exam": "CAT",
        "source_scope": "User-supplied CAT papers, 2017-2025",
        "duplicate_note": "CAt-2023-Question-Paper-slot-03 (1).pdf is byte-identical to Slot 03 and is intentionally not indexed twice.",
        "student_facing_rule": "Only answer_key_ready records may be considered for direct use, and RC/DILR still require verified shared context before display.",
        "totals": totals,
        "papers": manifest_entries,
    }
    (args.output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(totals, indent=2))
    incomplete = [entry["id"] for entry in manifest_entries if not entry["complete_index"]]
    if incomplete:
        print("Incomplete paper indexes (kept quarantined for review): " + ", ".join(incomplete))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
