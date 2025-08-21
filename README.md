# Intervue.ai  
Built by [Vishal Kumar, Pankaj Kumar Gupta]  

A mock-interview analysis platform using:
- **Frontend**: Next.js + Tailwind CSS
- **Backend**: FastAPI
- **Database**: MongoDB / Firebase
- **AI Modules**: Whisper (STT), GPT (NLP), MediaPipe (CV)

## Features
- AI-driven feedback
- Content & fluency scoring
- Non-verbal cue analysis


## Structure
```
intervue-ai/
├─ frontend/               # Next.js + Tailwind
├─ backend/                # FastAPI APIs
├─ services/
│  ├─ nlp/                 # GPT-based content analysis
│  ├─ stt/                 # Whisper helpers
│  └─ cv/                  # MediaPipe/OpenCV utilities
├─ scripts/                # seed scripts
├─ docs/                   # diagrams, specs
├─ .env.example
├─ .gitignore
├─ LICENSE
└─ README.md
```

## Quickstart

1. Copy `.env.example` to `.env` and fill values as needed.
2. Initialize git and make the first commit (see instructions in your chat).
3. (Later) Bootstrap frontend and backend.

---
