export type KernelState = "idle" | "loading" | "installing" | "running";

export interface CellOutput {
  readonly stdout: string;
  readonly stderr: string;
  /** repr() of the cell's last expression, like a notebook shows it. */
  readonly value: string | null;
  readonly error: string | null;
  /** matplotlib figures as base64 PNGs. */
  readonly images: readonly string[];
}
