import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bankRoot = path.join(root, 'data', 'cat-pyq');
const manifest = JSON.parse(fs.readFileSync(path.join(bankRoot, 'manifest.json'), 'utf8'));

const checks = [];
checks.push(['23 unique CAT papers are indexed', manifest.papers.length === 23 && manifest.totals.documents === 23]);
checks.push(['the duplicate 2023 Slot 3 file is explicitly excluded', /byte-identical/i.test(manifest.duplicate_note)]);
checks.push(['the bank contains a substantial question index', manifest.totals.questions_indexed >= 1600]);
checks.push(['some QA items have clean answer-key-ready extraction', manifest.totals.answer_key_ready >= 100]);

const ids = new Set();
let duplicateId = false;
let copiedSolutionProse = false;
let unsafeContextWasReleased = false;
let missingPaperAsset = false;

for (const paper of manifest.papers) {
  const assetPath = path.join(bankRoot, paper.asset);
  if (!fs.existsSync(assetPath)) {
    missingPaperAsset = true;
    continue;
  }
  const payload = JSON.parse(fs.readFileSync(assetPath, 'utf8'));
  const serialized = JSON.stringify(payload.questions);
  if (/\bSolution\s+\d+\s*:|\bExplanation\s*:-/i.test(serialized)) copiedSolutionProse = true;
  for (const question of payload.questions) {
    if (ids.has(question.id)) duplicateId = true;
    ids.add(question.id);
    if ((question.section === 'varc' || question.section === 'dilr') && question.direct_use_status === 'answer_key_ready') {
      unsafeContextWasReleased = true;
    }
  }
}

checks.push(['every manifest asset exists', !missingPaperAsset]);
checks.push(['question IDs are unique', !duplicateId && ids.size === manifest.totals.questions_indexed]);
checks.push(['third-party solution prose is excluded', !copiedSolutionProse]);
checks.push(['RC and DILR stay quarantined until shared context is verified', !unsafeContextWasReleased]);

let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} — ${name}`);
  if (!passed) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} CAT PYQ bank checks passed.`);
if (failed) process.exit(1);
