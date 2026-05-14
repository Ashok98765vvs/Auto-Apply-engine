#!/usr/bin/env node
/**
 * ollama-eval.mjs — Local Ollama-powered Job Offer Evaluator
 *
 * 100% local, free, offline alternative to gemini-eval.mjs.
 * No API key, no cloud calls, no auto-apply.
 *
 * Reads evaluation logic from modes/oferta.md + modes/_shared.md,
 * reads the user's resume from cv.md, and evaluates a Job Description
 * passed as a command-line argument.
 *
 * Usage:
 *   node ollama-eval.mjs "Paste full JD text here"
 *   node ollama-eval.mjs --file ./jds/my-job.txt
 *   node ollama-eval.mjs --model llama3.1:8b --file ./jds/my-job.txt
 *
 * Requires:
 *   - Ollama installed and running locally: https://ollama.com/download
 *   - A pulled model:   ollama pull llama3.1:8b
 *
 * No API key required. Talks to http://localhost:11434 by default.
 */

import {
  readFileSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Bootstrap: load .env (optional — only used for OLLAMA_HOST / OLLAMA_MODEL)
// ---------------------------------------------------------------------------
try {
  const { config } = await import('dotenv');
  config();
} catch {
  /* dotenv is optional */
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const ROOT = dirname(fileURLToPath(import.meta.url));

const PATHS = {
  shared:  join(ROOT, 'modes', '_shared.md'),
  oferta:  join(ROOT, 'modes', 'oferta.md'),
  cv:      join(ROOT, 'cv.md'),
  reports: join(ROOT, 'reports'),
  tracker: join(ROOT, 'data', 'applications.md'),
};

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║       career-ops — Ollama Evaluator (100% local, offline)       ║
╚══════════════════════════════════════════════════════════════════╝

  Evaluate a job offer using a local LLM via Ollama.
  No API key. No cloud. No auto-apply.

  USAGE
    node ollama-eval.mjs "<JD text>"
    node ollama-eval.mjs --file ./jds/my-job.txt
    node ollama-eval.mjs --model llama3.1:8b "<JD text>"

  OPTIONS
    --file <path>     Read JD from a file instead of inline text
    --model <name>    Ollama model to use (default: llama3.1:8b)
    --host <url>      Ollama server URL (default: http://localhost:11434)
    --no-save         Do not save report to reports/ directory
    --temperature <n> Sampling temperature (default: 0.4)
    --help            Show this help

  ENV VARS (optional)
    OLLAMA_MODEL=llama3.1:8b
    OLLAMA_HOST=http://localhost:11434

  SETUP (one-time)
    1. Install Ollama:  https://ollama.com/download
       macOS:           brew install ollama   (or download the .dmg)
    2. Start it:        ollama serve            (runs as a background app)
    3. Pull a model:    ollama pull llama3.1:8b
    4. Run this script: node ollama-eval.mjs --file ./jds/example.txt

  RECOMMENDED MODELS  (pick one based on your RAM)
    llama3.1:8b        ~5 GB    Best general default (16 GB RAM)
    qwen2.5:7b         ~5 GB    Strong reasoning, multilingual
    mistral:7b         ~4 GB    Fast, lightweight
    llama3.1:70b       ~40 GB   Top quality (needs 64 GB RAM)
    phi3:mini          ~2 GB    Tiny / older Macs (8 GB RAM)

  EXAMPLES
    node ollama-eval.mjs "We are looking for a Senior AI Engineer..."
    node ollama-eval.mjs --file ./jds/openai-swe.txt
    node ollama-eval.mjs --model qwen2.5:7b --file ./jds/example.txt
`);
  process.exit(0);
}

let jdText      = '';
let modelName   = process.env.OLLAMA_MODEL || 'llama3.1:8b';
let host        = process.env.OLLAMA_HOST  || 'http://localhost:11434';
let saveReport  = true;
let temperature = 0.4;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file' && args[i + 1]) {
    const filePath = args[++i];
    if (!existsSync(filePath)) {
      console.error(`❌  File not found: ${filePath}`);
      process.exit(1);
    }
    jdText = readFileSync(filePath, 'utf-8').trim();
  } else if (args[i] === '--model' && args[i + 1]) {
    modelName = args[++i];
  } else if (args[i] === '--host' && args[i + 1]) {
    host = args[++i];
  } else if (args[i] === '--temperature' && args[i + 1]) {
    temperature = parseFloat(args[++i]);
  } else if (args[i] === '--no-save') {
    saveReport = false;
  } else if (!args[i].startsWith('--')) {
    jdText += (jdText ? '\n' : '') + args[i];
  }
}

if (!jdText) {
  console.error('❌  No Job Description provided. Run with --help for usage.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------
function readFile(path, label) {
  if (!existsSync(path)) {
    console.warn(`⚠️   ${label} not found at: ${path}`);
    return `[${label} not found — skipping]`;
  }
  return readFileSync(path, 'utf-8').trim();
}

function nextReportNumber() {
  if (!existsSync(PATHS.reports)) return '001';
  const files = readdirSync(PATHS.reports)
    .filter(f => /^\d{3}-/.test(f))
    .map(f => parseInt(f.slice(0, 3)))
    .filter(n => !isNaN(n));
  if (files.length === 0) return '001';
  return String(Math.max(...files) + 1).padStart(3, '0');
}

// ---------------------------------------------------------------------------
// Pre-flight: check Ollama is running and the model is available
// ---------------------------------------------------------------------------
async function checkOllama() {
  try {
    const res = await fetch(`${host}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models = (data.models || []).map(m => m.name);
    if (!models.includes(modelName)) {
      console.error(`
❌  Model "${modelName}" is not pulled locally.

   Pull it first:
       ollama pull ${modelName}

   Or pick from your installed models:
       ${models.length ? models.join('\n       ') : '(none installed)'}
`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`
❌  Cannot reach Ollama at ${host}.

   1. Install Ollama:   https://ollama.com/download
   2. Start the server: ollama serve
      (On macOS, the desktop app starts it automatically.)
   3. Verify it's up:   curl ${host}/api/tags

   Underlying error: ${err.message}
`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Load context files
// ---------------------------------------------------------------------------
console.log('\n📂  Loading context files...');

const sharedContext = readFile(PATHS.shared, 'modes/_shared.md');
const ofertaLogic   = readFile(PATHS.oferta, 'modes/oferta.md');
const cvContent     = readFile(PATHS.cv,     'cv.md');

// ---------------------------------------------------------------------------
// Build the system prompt (mirrors the Gemini/Claude skill router logic)
// ---------------------------------------------------------------------------
const systemPrompt = `You are career-ops, an AI-powered job search assistant.
You evaluate job offers against the user's CV using a structured A-G scoring system.

Your evaluation methodology is defined below. Follow it exactly.

═══════════════════════════════════════════════════════
SYSTEM CONTEXT (_shared.md)
═══════════════════════════════════════════════════════
${sharedContext}

═══════════════════════════════════════════════════════
EVALUATION MODE (oferta.md)
═══════════════════════════════════════════════════════
${ofertaLogic}

═══════════════════════════════════════════════════════
CANDIDATE RESUME (cv.md)
═══════════════════════════════════════════════════════
${cvContent}

═══════════════════════════════════════════════════════
IMPORTANT OPERATING RULES FOR THIS LOCAL CLI SESSION
═══════════════════════════════════════════════════════
1. You are a local model running via Ollama. You have NO internet access,
   NO WebSearch, NO Playwright, and NO file-writing tools.
   - For Block D (Comp research): give salary estimates from training data,
     clearly labeled as estimates / approximate ranges.
   - For Block G (Legitimacy): analyze the JD text only; skip URL/page checks.
   - This script handles all file saving — do NOT attempt to write files.
2. You must NOT auto-apply, submit forms, send emails, or take any action
   on the user's behalf. You only produce a written evaluation report.
3. Generate Blocks A through G in full, in English (unless the JD is in
   another language, in which case match the JD's language).
4. At the very end, output a machine-readable summary block in this exact
   format (no extra characters):

---SCORE_SUMMARY---
COMPANY: <company name or "Unknown">
ROLE: <role title>
SCORE: <global score as decimal, e.g. 3.8>
ARCHETYPE: <detected archetype>
LEGITIMACY: <High Confidence | Proceed with Caution | Suspicious>
---END_SUMMARY---
`;

// ---------------------------------------------------------------------------
// Call Ollama
// ---------------------------------------------------------------------------
await checkOllama();
console.log(`🦙  Calling Ollama (${modelName}) at ${host} ... this may take a while on first run.\n`);

const body = {
  model: modelName,
  stream: true,
  options: {
    temperature,
    num_ctx: 8192,         // bigger context window for the long prompt
    num_predict: 4096,     // cap output length
  },
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: `JOB DESCRIPTION TO EVALUATE:\n\n${jdText}` },
  ],
};

let evaluationText = '';
try {
  const res = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama HTTP ${res.status}: ${text}`);
  }

  // Stream NDJSON chunks and print as they arrive
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  process.stdout.write('\n' + '═'.repeat(66) + '\n');
  process.stdout.write('  CAREER-OPS EVALUATION — powered by local Ollama\n');
  process.stdout.write('═'.repeat(66) + '\n\n');

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep the partial line for the next chunk
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        const piece = obj.message?.content ?? '';
        if (piece) {
          evaluationText += piece;
          process.stdout.write(piece);
        }
      } catch {
        // Ignore malformed NDJSON fragments
      }
    }
  }
  process.stdout.write('\n');
} catch (err) {
  console.error('\n❌  Ollama error:', err.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Parse score summary
// ---------------------------------------------------------------------------
const summaryMatch = evaluationText.match(
  /---SCORE_SUMMARY---\s*([\s\S]*?)---END_SUMMARY---/
);

let company    = 'unknown';
let role       = 'unknown';
let score      = '?';
let archetype  = 'unknown';
let legitimacy = 'unknown';

if (summaryMatch) {
  const block = summaryMatch[1];
  const extract = (key) => {
    const m = block.match(new RegExp(`${key}:\\s*(.+)`));
    return m ? m[1].trim() : 'unknown';
  };
  company    = extract('COMPANY');
  role       = extract('ROLE');
  score      = extract('SCORE');
  archetype  = extract('ARCHETYPE');
  legitimacy = extract('LEGITIMACY');
}

// ---------------------------------------------------------------------------
// Save report
// ---------------------------------------------------------------------------
if (saveReport) {
  try {
    if (!existsSync(PATHS.reports)) {
      mkdirSync(PATHS.reports, { recursive: true });
    }

    const num         = nextReportNumber();
    const today       = new Date().toISOString().split('T')[0];
    const companySlug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
    const filename    = `${num}-${companySlug}-${today}.md`;
    const reportPath  = join(PATHS.reports, filename);

    const reportContent = `# Evaluation: ${company} — ${role}

**Date:** ${today}
**Archetype:** ${archetype}
**Score:** ${score}/5
**Legitimacy:** ${legitimacy}
**PDF:** pending
**Tool:** Ollama (${modelName}) — local, no API

---

${evaluationText.replace(/---SCORE_SUMMARY---[\s\S]*?---END_SUMMARY---/, '').trim()}
`;

    writeFileSync(reportPath, reportContent, 'utf-8');
    console.log(`\n✅  Report saved: reports/${filename}`);
    console.log(`\n📊  Tracker entry (add to data/applications.md manually — no auto-apply):`);
    console.log(`    | ${num} | ${today} | ${company} | ${role} | ${score} | Evaluada | ❌ | [${num}](reports/${filename}) |`);
  } catch (err) {
    console.warn(`⚠️   Could not save report: ${err.message}`);
  }
}

console.log('\n' + '─'.repeat(66));
console.log(`  Score: ${score}/5  |  Archetype: ${archetype}  |  Legitimacy: ${legitimacy}`);
console.log('─'.repeat(66) + '\n');
