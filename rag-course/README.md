# RAG course — Harish Neel, *Complete RAG Tutorial 2026*

Our warm-up before phase 0. Watch together, tick each video on the [lab website](https://twadi.github.io/ai-engineering-arena/), and post a note on the site for anything you learned or found unclear.

Playlist: https://www.youtube.com/playlist?list=PLNIQLFWpQMRUMjxfe8o6g3uzJ6LH_VotY

- [ ] #1 [Complete introduction to retrieval augmented generation](https://www.youtube.com/watch?v=63B-3rqRFbQ&list=PLNIQLFWpQMRUMjxfe8o6g3uzJ6LH_VotY)
- [ ] #2 [Vector embeddings and RAG architecture explained](https://www.youtube.com/watch?v=9iGvXxH_fdE&list=PLNIQLFWpQMRUMjxfe8o6g3uzJ6LH_VotY)
- [ ] #3 [Build a data ingestion pipeline with Python](https://www.youtube.com/watch?v=LK-OyelN9MU&list=PLNIQLFWpQMRUMjxfe8o6g3uzJ6LH_VotY)
- [ ] #4 [Document retrieval implementation with LangChain](https://www.youtube.com/watch?v=brbd3AvsJWs&list=PLNIQLFWpQMRUMjxfe8o6g3uzJ6LH_VotY)
- [ ] #5 [Cosine similarity for vector search explained](https://www.youtube.com/watch?v=nbJVJ1RPBEg&list=PLNIQLFWpQMRUMjxfe8o6g3uzJ6LH_VotY)
- [ ] #6 [Build your first RAG application from scratch](https://www.youtube.com/watch?v=i_v4Vm2KBuc&list=PLNIQLFWpQMRUMjxfe8o6g3uzJ6LH_VotY)
- [ ] #7 [Conversational RAG with chat history](https://www.youtube.com/watch?v=ZWXXpK4TIDY&list=PLNIQLFWpQMRUMjxfe8o6g3uzJ6LH_VotY)
- [ ] #8 [Text chunking strategies for better RAG performance](https://www.youtube.com/watch?v=POE8LDjdAw4&list=PLNIQLFWpQMRUMjxfe8o6g3uzJ6LH_VotY)
- [ ] #9 [Advanced text splitting with LangChain](https://www.youtube.com/watch?v=Ht8ImZT6kJ0&list=PLNIQLFWpQMRUMjxfe8o6g3uzJ6LH_VotY)
- [ ] #10 [Semantic chunking for improved RAG results](https://www.youtube.com/watch?v=FPYtGK6HYRg&list=PLNIQLFWpQMRUMjxfe8o6g3uzJ6LH_VotY)
- [ ] #11 [AI agent-based document chunking](https://www.youtube.com/watch?v=slG8qWvIPKg&list=PLNIQLFWpQMRUMjxfe8o6g3uzJ6LH_VotY)
- [ ] #12 [Multi-modal RAG with images and documents](https://www.youtube.com/watch?v=dHgvDTXVvPA&list=PLNIQLFWpQMRUMjxfe8o6g3uzJ6LH_VotY)
- [ ] #13 [Advanced document retrieval techniques](https://www.youtube.com/watch?v=kNU-J4NNNhk&list=PLNIQLFWpQMRUMjxfe8o6g3uzJ6LH_VotY)
- [ ] #14 [Multi-query RAG for better search results](https://www.youtube.com/watch?v=ghwZVc9G0ac&list=PLNIQLFWpQMRUMjxfe8o6g3uzJ6LH_VotY)
- [ ] #15 [Reciprocal rank fusion for enhanced RAG performance](https://www.youtube.com/watch?v=1qQCuWiRIfA&list=PLNIQLFWpQMRUMjxfe8o6g3uzJ6LH_VotY)
- [ ] #16 [Hybrid search: combining vector and keyword search](https://www.youtube.com/watch?v=7WEtNxVh1vo&list=PLNIQLFWpQMRUMjxfe8o6g3uzJ6LH_VotY)
- [ ] #17 [RAG reranking and next steps](https://www.youtube.com/watch?v=VWA15n6uiS4&list=PLNIQLFWpQMRUMjxfe8o6g3uzJ6LH_VotY)

## Run the instructor's notebooks on localhost

The course code is in [harishneel1/rag-for-beginners](https://github.com/harishneel1/rag-for-beginners). These steps open it in Jupyter at `http://localhost:8888`, like in the videos. They're written for #12 (multi-modal RAG).

1. **System tools** for PDF parsing and OCR (one time):

   ```bash
   brew install poppler tesseract libmagic                    # macOS
   sudo apt-get install poppler-utils tesseract-ocr libmagic1 # Ubuntu / Debian / WSL
   choco install poppler tesseract                            # Windows (open a new terminal afterwards)
   ```

2. **Python packages and the course code**, from the root of this repo:

   ```bash
   uv sync --group rag
   git clone https://github.com/harishneel1/rag-for-beginners.git   # gitignored, stays local
   ```

3. **OpenAI key:** the notebook calls `gpt-4o` and OpenAI embeddings. Put `OPENAI_API_KEY=sk-...` in `.env` at the repo root (set a spend limit first). `uv run python 00-setup/check_env.py` shows whether it's picked up.

4. **Start Jupyter:**

   ```bash
   uv run --group rag jupyter lab
   ```

   Your browser opens `http://localhost:8888/lab`. Open `rag-for-beginners/8_multi_modal_rag.ipynb` and run the cells top to bottom, **skipping the `%pip install` cell**: uv already installed everything, and the environment has no `pip`.

The first `hi_res` partition downloads a layout model from Hugging Face, so it takes a minute; later runs reuse it.

## Where things go

- Code you write along with the videos: `rag-course/<your-github-username>/`
- Videos #3 and #6 are the ones to code along with; the rest you can mostly watch.
