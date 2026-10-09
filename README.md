# StudyAI — Mini Project → Major Project

This project follows the uploaded proposal: full-stack student productivity + learning assistant with Python/Flask, database, AI chatbot, summarization, quiz generation, study planning and analytics. The proposal explicitly lists PDF processing/RAG/analytics/mobile as advanced expansion paths.

## Run
1. `python -m venv venv`
2. Windows: `venv\Scripts\activate`
3. `pip install -r requirements.txt`
4. Copy `.env.example` to `.env`
5. `python app.py`
6. Open http://127.0.0.1:5000

## Optional local AI
Install Ollama, then:
`ollama pull deepseek-r1:7b`
Set `OLLAMA_ENABLED=true`.

Without Ollama the application still runs in demo fallback mode.

## MySQL
Set:
`DATABASE_URL=mysql+pymysql://root:PASSWORD@localhost/studyai`

## Demo account
Run `python seed.py`, then:
- Email: demo@studyai.local
- Password: demo123

## Major-project roadmap
Phase 1 (mini): current modules.
Phase 2: RAG over personal notes using embeddings + vector DB.
Phase 3: OCR + scanned PDFs + flashcards.
Phase 4: long-term learning recommendation model.
Phase 5: PWA/mobile + voice.
Phase 6: teacher/admin portal, cloud deployment and monitoring.


## Ollama setup (StudyAI AI Assistant)
The supplied `.env` is configured for the locally installed `deepseek-r1:7b` model:

```env
OLLAMA_ENABLED=true
OLLAMA_URL=http://localhost:11434/api/generate
OLLAMA_MODEL=deepseek-r1:7b
```

Verify Ollama:
```powershell
ollama list
curl http://localhost:11434/api/tags
```

Run StudyAI from the folder containing `app.py`:
```powershell
python app.py
```
Then open `http://127.0.0.1:5000`. Open **AI Assistant** and confirm the green **Ollama Ready** badge before asking a question.

If Ollama is not running, start it and retry. The AI Assistant returns a clear connection error rather than silently pretending the local model answered.
