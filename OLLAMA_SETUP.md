# career-ops — Local Ollama Setup (No API, No Auto-Apply)

This guide walks you through running career-ops **fully offline** with a local
LLM via [Ollama](https://ollama.com). No Gemini key, no Claude key, no cloud
calls, and no auto-apply — you stay in full control of every submission.

---

## What you get

- A drop-in replacement for `gemini-eval.mjs` called **`ollama-eval.mjs`**.
- A new npm script: **`npm run ollama:eval`**.
- 100% local inference — your CV and job descriptions never leave your machine.
- Same A–G evaluation report format, same `reports/` output, same tracker line.
- **No auto-apply.** The script only writes an evaluation report and prints a
  tracker row you copy into `data/applications.md` yourself.

---

## Step 1 — Install Ollama

Pick one:

**macOS (recommended for you)**
```bash
brew install ollama
```
…or download the desktop app: https://ollama.com/download

**Linux**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Windows**
Download the installer from https://ollama.com/download.

---

## Step 2 — Start the Ollama server

On macOS/Windows the desktop app starts it automatically. To start it manually:

```bash
ollama serve
```

Verify it's running:
```bash
curl http://localhost:11434/api/tags
```
You should get a JSON response (possibly with an empty `models` list).

---

## Step 3 — Pull a model

Pick **one** based on your Mac's RAM. For your typical 16 GB MacBook, start
with `llama3.1:8b`.

| Model           | Disk   | RAM needed | Notes                              |
|-----------------|--------|------------|------------------------------------|
| `llama3.1:8b`   | ~5 GB  | 16 GB      | **Recommended default**            |
| `qwen2.5:7b`    | ~5 GB  | 16 GB      | Strong reasoning, multilingual     |
| `mistral:7b`    | ~4 GB  | 8–16 GB    | Fast, lightweight                  |
| `phi3:mini`     | ~2 GB  | 8 GB       | Tiny / older Macs                  |
| `llama3.1:70b`  | ~40 GB | 64 GB+     | Best quality, only for big rigs    |

```bash
ollama pull llama3.1:8b
```

First pull is ~5 GB and takes a few minutes.

---

## Step 4 — Install career-ops Node dependencies

From inside the project folder:

```bash
cd career-ops-career-ops-v1.7.1
npm install
```

This installs `playwright`, `dotenv`, etc. The Ollama script needs **zero**
extra Node packages — it uses the built-in `fetch` to talk to
`http://localhost:11434`.

---

## Step 5 — Add your CV

The evaluator reads your résumé from `cv.md` at the project root.

```bash
# If you don't have one yet:
touch cv.md
# Then open it and paste your résumé in Markdown.
```

A minimal example:

```markdown
# Ashok Shankarappa
Software Engineer · F1 student · USA

## Skills
Python, JavaScript, Node.js, Stripe, web payments, LLC formation basics.

## Experience
- **Intern, ACME Corp** (2024–2025) — built X, shipped Y.
- **Founder, MySoftwareConsulting LLC** — founded a consulting practice…

## Education
- B.S. Computer Science, University of …

## Visa
F1, eligible for OPT/CPT.
```

---

## Step 6 — (Optional) Configure defaults in `.env`

```bash
cp .env.example .env
```

Then edit `.env` and add (you can ignore the Gemini key):

```env
# Local Ollama config (optional — defaults shown)
OLLAMA_MODEL=llama3.1:8b
OLLAMA_HOST=http://localhost:11434
```

You do **not** need `GEMINI_API_KEY` for the Ollama path.

---

## Step 7 — Run your first evaluation

Save a job description into `jds/example.txt` (or pass it inline) and run:

```bash
# Easiest:
npm run ollama:eval -- --file ./jds/example.txt

# Or directly:
node ollama-eval.mjs --file ./jds/example.txt

# Or inline:
node ollama-eval.mjs "We are hiring a Senior AI Engineer..."
```

Useful flags:

```bash
--file <path>          Read JD from a file
--model llama3.1:8b    Override model
--host http://...      Override Ollama URL (e.g. remote machine)
--temperature 0.4      Sampling temperature (default 0.4)
--no-save              Print only, don't save a report
--help                 Show usage
```

What happens:

1. The script loads `modes/_shared.md`, `modes/oferta.md`, and `cv.md`.
2. It checks Ollama is running and your model is pulled.
3. It streams the A–G evaluation to your terminal in real time.
4. It saves the report to `reports/NNN-<company>-YYYY-MM-DD.md`.
5. It prints a tracker row for you to paste into `data/applications.md`
   manually. **Nothing is auto-applied.**

---

## Step 8 — (Optional) Generate a PDF and dashboard

After evaluation, the rest of the pipeline still works locally:

```bash
npm run pdf       # Render LaTeX/PDF from the markdown report
npm run dashboard # (if available in your version)
npm run verify    # Sanity-check the pipeline
npm run doctor    # Diagnose setup issues
```

---

## Troubleshooting

**`Cannot reach Ollama at http://localhost:11434`**
- Run `ollama serve` in another terminal, or open the desktop app.
- Test with `curl http://localhost:11434/api/tags`.

**`Model "llama3.1:8b" is not pulled locally`**
- Run `ollama pull llama3.1:8b`.
- Or list what you have: `ollama list` and pass `--model <name>`.

**Output is slow / fan spinning**
- 7B–8B models on 16 GB RAM typically take **30–90 seconds** per evaluation.
- Try a smaller model: `--model phi3:mini` or `--model mistral:7b`.
- Close other heavy apps. Apple Silicon (M1/M2/M3) uses the GPU automatically.

**Output is cut off / missing the score summary block**
- Increase the output cap in `ollama-eval.mjs`:
  change `num_predict: 4096` to `8192`.
- Or use a stronger model (`qwen2.5:7b`, `llama3.1:70b`).

**Output quality is mediocre**
- Local 7B models are weaker than Gemini/Claude. Try:
  - `--model qwen2.5:7b` (better reasoning)
  - `--model llama3.1:70b` (only if you have ≥64 GB RAM)
  - Lower temperature: `--temperature 0.2` for more deterministic output.

---

## Why no auto-apply?

Because:

1. You're on an F1 visa — auto-submitting applications to roles you're not
   eligible for (citizenship-required, security-clearance, etc.) can hurt
   your reputation and waste recruiter time.
2. Auto-apply tools regularly get accounts banned on LinkedIn, Workday,
   Greenhouse, and Lever.
3. Tailoring matters more than volume. This pipeline is designed to **score
   and prioritize** offers so you apply manually to the best 3–5 per week.

The Ollama script enforces this by only generating reports — it has no
browser, no form-filling, and no network access beyond `localhost:11434`.

---

## Quick command cheat sheet

```bash
# One-time setup
brew install ollama
ollama serve &                          # or use the desktop app
ollama pull llama3.1:8b
cd career-ops-career-ops-v1.7.1
npm install

# Daily use
node ollama-eval.mjs --file ./jds/my-job.txt
ls reports/                             # see your evaluations
npm run pdf                             # optional: render to PDF
```

Happy (manual, intentional) job hunting.
