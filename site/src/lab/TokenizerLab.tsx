import { useEffect, useRef, useState } from "react";
import { charsPerToken, showWhitespace, tokenize, TOKENIZERS, type Tokenized } from "./tokenizer";

const SAMPLE = `Tokenization isn't magic: "unbelievable" might be 1 token or 3.
Numbers split oddly: 12345 + 67890 = 80235
def add(a, b):
    return a + b
Emoji and other scripts cost more 🙂 مرحبا بكم Bonjour à tous`;

const TOKEN_COLORS = 6;

interface Comparison {
  readonly id: string;
  readonly count: number | null;
  readonly error: boolean;
}

function useTokens(model: string, text: string) {
  const [result, setResult] = useState<Tokenized | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    const ticket = ++latest.current;
    setBusy(true);
    const t = window.setTimeout(() => {
      tokenize(model, text)
        .then((r) => {
          if (ticket !== latest.current) return;
          setResult(r);
          setError(null);
        })
        .catch((err: unknown) => {
          if (ticket !== latest.current) return;
          console.error("Tokenizing failed", err);
          setError("Couldn't load this tokenizer. Check your connection and try again.");
        })
        .finally(() => {
          if (ticket === latest.current) setBusy(false);
        });
    }, 150);
    return () => window.clearTimeout(t);
  }, [model, text]);

  return { result, busy, error };
}

export function TokenizerLab() {
  const [text, setText] = useState(SAMPLE);
  const [model, setModel] = useState(TOKENIZERS[0].id);
  const [showIds, setShowIds] = useState(false);
  const [comparison, setComparison] = useState<readonly Comparison[] | null>(null);
  const [comparing, setComparing] = useState(false);
  const { result, busy, error } = useTokens(model, text);
  const info = TOKENIZERS.find((t) => t.id === model) ?? TOKENIZERS[0];

  const textRef = useRef(text);
  textRef.current = text;

  const compare = async () => {
    const asked = text;
    setComparing(true);
    const rows = await Promise.all(
      TOKENIZERS.map((t) =>
        tokenize(t.id, text)
          .then((r): Comparison => ({ id: t.id, count: r.ids.length, error: false }))
          .catch((): Comparison => ({ id: t.id, count: null, error: true })),
      ),
    );
    setComparing(false);
    // The text changed while comparing: these counts are for the old text.
    if (textRef.current === asked) setComparison(rows);
  };

  const fewest = comparison ? Math.min(...comparison.flatMap((c) => (c.count === null ? [] : [c.count]))) : 0;

  return (
    <div className="playground">
      <p className="banner info">
        LLMs never see letters, only token IDs. Type anything and watch how different tokenizers chop it up. Each tokenizer downloads once (under 10 MB) and is cached.
      </p>

      <section className="panel" aria-labelledby="tok-title">
        <div className="panel-head">
          <h2 id="tok-title" className="panel-title">Tokenizer</h2>
          <span className="muted small-text">{info.kind} · {info.usedBy}</span>
        </div>
        <div className="tok-picker" role="radiogroup" aria-label="Tokenizer">
          {TOKENIZERS.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={t.id === model} className={`chip-btn${t.id === model ? " on" : ""}`} onClick={() => setModel(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="tok-input">Text to tokenize</label>
        <textarea id="tok-input" className="lab-textarea" rows={6} value={text} onChange={(e) => { setText(e.target.value); setComparison(null); }} />

        <div className="tok-stats" aria-live="polite">
          <div><b>{result ? result.ids.length : "…"}</b><span>tokens</span></div>
          <div><b>{[...text].length}</b><span>characters</span></div>
          <div><b>{result ? charsPerToken(text, result.ids.length).toFixed(2) : "…"}</b><span>chars per token</span></div>
          <label className="tok-toggle"><input type="checkbox" checked={showIds} onChange={(e) => setShowIds(e.target.checked)} /> Show token IDs</label>
        </div>

        {error && <p className="form-error">{error}</p>}
        <div className={`tok-out${busy ? " busy" : ""}`} aria-label="Tokens">
          {result?.pieces.map((p, i) => (
            <span key={i} className={`tok tok-${i % TOKEN_COLORS}`} title={`#${i} · id ${result.ids[i]} · ${JSON.stringify(result.raw[i])}`}>
              {showIds ? result.ids[i] : showWhitespace(p) || "∅"}
            </span>
          ))}
          {!result && !error && <span className="muted">Loading the tokenizer…</span>}
        </div>
        <p className="muted small-text">Hover a token for its ID and how it's stored in the vocabulary. · marks a space, ↵ a new line, � part of a character split across tokens.</p>
      </section>

      <section className="panel" aria-labelledby="cmp-title">
        <div className="panel-head">
          <h2 id="cmp-title" className="panel-title">Compare all tokenizers</h2>
          <button type="button" className="btn btn-primary btn-small" onClick={() => void compare()} disabled={comparing}>
            {comparing ? "Tokenizing…" : "Compare this text"}
          </button>
        </div>
        <p className="muted">Fewer tokens means cheaper API calls and more text in the context window. Try code, numbers, or another language.</p>
        {comparison && (
          <table className="tok-table">
            <thead><tr><th scope="col">Tokenizer</th><th scope="col">Tokens</th><th scope="col">Chars / token</th><th scope="col" className="tok-bar-col">Relative cost</th></tr></thead>
            <tbody>
              {comparison.map((c) => {
                const t = TOKENIZERS.find((x) => x.id === c.id)!;
                const max = Math.max(...comparison.map((x) => x.count ?? 0)) || 1;
                return (
                  <tr key={c.id} className={c.count === fewest ? "best" : ""}>
                    <th scope="row">{t.name}<span className="muted small-text"> {t.kind}</span></th>
                    <td>{c.error ? "failed" : c.count}</td>
                    <td>{c.count ? charsPerToken(text, c.count).toFixed(2) : "–"}</td>
                    <td className="tok-bar-col"><span className="hit-bar"><i style={{ width: `${((c.count ?? 0) / max) * 100}%` }} /></span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
