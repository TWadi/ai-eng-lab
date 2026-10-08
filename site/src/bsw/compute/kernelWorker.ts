/// <reference lib="webworker" />
// A persistent Python kernel for the scratchpad: variables survive between cells, like a notebook.
// Packages (numpy, pandas, matplotlib, scikit-learn...) are installed on first import.

import { PYODIDE_INDEX_URL } from "./pyodide";

interface PyodideApi {
  runPython(code: string): unknown;
  loadPackagesFromImports(code: string, options?: { messageCallback?: (msg: string) => void }): Promise<unknown>;
  globals: { get(name: string): (code: string) => string };
}

interface RunMessage {
  readonly id: number;
  readonly code: string;
}

const KERNEL = String.raw`
import ast, base64, io, json, os, sys, traceback, warnings
os.environ.setdefault("MPLBACKEND", "AGG")
warnings.filterwarnings("ignore", message=".*non-interactive.*")
_ns = {"__name__": "__main__"}
_LIMIT = 100_000

def _figures():
    if "matplotlib.pyplot" not in sys.modules:
        return []
    import matplotlib.pyplot as plt
    out = []
    for n in plt.get_fignums():
        buf = io.BytesIO()
        plt.figure(n).savefig(buf, format="png", bbox_inches="tight", dpi=100)
        out.append(base64.b64encode(buf.getvalue()).decode())
    plt.close("all")
    return out

def run_cell(src):
    out, err = io.StringIO(), io.StringIO()
    old = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = out, err
    value, error = None, None
    try:
        tree = ast.parse(src, "<cell>", "exec")
        last = None
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            last = ast.Expression(tree.body.pop().value)
        exec(compile(tree, "<cell>", "exec"), _ns)
        if last is not None:
            v = eval(compile(last, "<cell>", "eval"), _ns)
            if v is not None:
                value = repr(v)
    except BaseException as e:
        if isinstance(e, SyntaxError):
            error = "".join(traceback.format_exception_only(type(e), e))
        else:
            tb = e.__traceback__.tb_next if e.__traceback__ else None
            error = "".join(traceback.format_exception(type(e), e, tb))
    finally:
        sys.stdout, sys.stderr = old
    try:
        images = _figures()
    except Exception as e:
        images, error = [], (error or "") + f"Couldn't draw the figure: {e}"
    return json.dumps({
        "stdout": out.getvalue()[:_LIMIT],
        "stderr": err.getvalue()[:_LIMIT],
        "value": value[:_LIMIT] if value else None,
        "error": error,
        "images": images,
    })
`;

let pyodide: Promise<PyodideApi> | null = null;

async function boot(): Promise<PyodideApi> {
  const mod = await import(/* @vite-ignore */ `${PYODIDE_INDEX_URL}pyodide.mjs`);
  const py: PyodideApi = await mod.loadPyodide({ indexURL: PYODIDE_INDEX_URL });
  py.runPython(KERNEL);
  return py;
}

self.onmessage = async (event: MessageEvent<RunMessage>) => {
  const { id, code } = event.data;
  try {
    if (!pyodide) {
      self.postMessage({ id, type: "status", state: "loading" });
      pyodide = boot();
      pyodide.catch(() => {
        pyodide = null;
      });
    }
    const py = await pyodide;
    await py.loadPackagesFromImports(code, {
      messageCallback: (msg) => {
        if (/^Loading /.test(msg)) self.postMessage({ id, type: "status", state: "installing", detail: msg.replace(/^Loading /, "") });
      },
    });
    self.postMessage({ id, type: "status", state: "running" });
    const out = py.globals.get("run_cell")(code);
    self.postMessage({ id, type: "result", result: JSON.parse(String(out)) });
  } catch (err) {
    self.postMessage({ id, type: "error", error: err instanceof Error ? err.message : String(err) });
  }
};
