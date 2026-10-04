import { useEffect, useRef, useState } from "react";
import type { RoadmapItem } from "../roadmap";
import type { GradedQuiz, OpenQuiz, QuizzesState } from "../hooks/useQuizzes";

interface Props {
  readonly item: RoadmapItem;
  readonly quizzes: QuizzesState;
  readonly onClose: () => void;
  readonly onPerfect: () => void;
}

type Stage =
  | { readonly name: "loading" }
  | { readonly name: "answering"; readonly quiz: OpenQuiz }
  | { readonly name: "submitting"; readonly quiz: OpenQuiz }
  | { readonly name: "graded"; readonly result: GradedQuiz }
  | { readonly name: "error"; readonly message: string };

const LETTERS = ["A", "B", "C", "D"];

export function QuizDialog({ item, quizzes, onClose, onPerfect }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [stage, setStage] = useState<Stage>({ name: "loading" });
  const [answers, setAnswers] = useState<readonly (number | null)[]>([]);

  const load = async () => {
    setStage({ name: "loading" });
    const res = await quizzes.start(item);
    if (res.ok) {
      setAnswers(res.value.questions.map(() => null));
      setStage({ name: "answering", quiz: res.value });
    } else {
      setStage({ name: "error", message: res.error });
    }
  };

  useEffect(() => {
    dialogRef.current?.showModal();
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (q: number, option: number) => setAnswers((cur) => cur.map((a, i) => (i === q ? option : a)));

  const submit = async (quiz: OpenQuiz) => {
    if (answers.some((a) => a === null)) return;
    setStage({ name: "submitting", quiz });
    const res = await quizzes.submit(quiz.id, answers as number[]);
    setStage(res.ok ? { name: "graded", result: res.value } : { name: "error", message: res.error });
    if (res.ok && res.value.score === res.value.total) onPerfect();
  };

  const unanswered = answers.filter((a) => a === null).length;

  return (
    <dialog ref={dialogRef} className="quiz" onClose={onClose} aria-labelledby="quiz-title">
      <header className="quiz-head">
        <div>
          <div className="ph-code">Quiz</div>
          <h2 id="quiz-title">{item.title}</h2>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Close</button>
      </header>

      {stage.name === "loading" && (
        <p className="quiz-status" role="status">Picking 5 questions…</p>
      )}

      {stage.name === "error" && (
        <div className="quiz-status">
          <p className="form-error" role="alert">{stage.message}</p>
          <button type="button" className="btn btn-primary" onClick={() => void load()}>Try again</button>
        </div>
      )}

      {(stage.name === "answering" || stage.name === "submitting") && (
        <form className="quiz-body" onSubmit={(e) => { e.preventDefault(); void submit(stage.quiz); }}>
          {stage.quiz.questions.map((q, qi) => (
            <fieldset key={qi} className="quiz-q">
              <legend><span className="quiz-num">{qi + 1}</span>{q.question}</legend>
              {q.options.map((opt, oi) => (
                <label key={oi} className={`quiz-opt${answers[qi] === oi ? " picked" : ""}`}>
                  <input type="radio" name={`q${qi}`} checked={answers[qi] === oi} onChange={() => choose(qi, oi)} disabled={stage.name === "submitting"} />
                  <span className="quiz-letter">{LETTERS[oi]}</span>
                  <span>{opt}</span>
                </label>
              ))}
            </fieldset>
          ))}
          <div className="quiz-foot">
            <span className="muted">{unanswered === 0 ? "All answered." : `${unanswered} left to answer.`}</span>
            <button type="submit" className="btn btn-primary" disabled={unanswered > 0 || stage.name === "submitting"}>
              {stage.name === "submitting" ? "Checking…" : "Submit answers"}
            </button>
          </div>
        </form>
      )}

      {stage.name === "graded" && (
        <div className="quiz-body">
          <p className="quiz-score">
            <b>{stage.result.score}/{stage.result.total}</b>
            <span className="quiz-verdict">{stage.result.score === stage.result.total ? "Flawless! +10 XP bonus." : stage.result.score >= stage.result.total * 0.6 ? "Solid run." : "Worth another look at the video."}</span>
          </p>
          {stage.result.questions.map((q, qi) => {
            const picked = stage.result.answers[qi];
            const right = picked === q.answer_index;
            return (
              <div key={qi} className={`quiz-q graded ${right ? "right" : "wrong"}`}>
                <p className="quiz-legend"><span className="quiz-num">{qi + 1}</span>{q.question}</p>
                <p className="quiz-line">
                  <b>{right ? "Correct" : "Not quite"}</b>
                  {!right && <> · you picked {LETTERS[picked]}: {q.options[picked]}</>}
                </p>
                <p className="quiz-line">Answer {LETTERS[q.answer_index]}: {q.options[q.answer_index]}</p>
                <p className="quiz-expl">{q.explanation}</p>
              </div>
            );
          })}
          <div className="quiz-foot">
            <button type="button" className="btn btn-ghost" onClick={() => void load()}>New quiz</button>
            <button type="button" className="btn btn-primary" onClick={() => dialogRef.current?.close()}>Done</button>
          </div>
        </div>
      )}
    </dialog>
  );
}
