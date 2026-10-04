import confetti from "canvas-confetti";

const COLORS = ["#FF6B4A", "#FFC83D", "#22C59A", "#3F5BFF", "#FF7EB6"];

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Small pop from the element that was clicked (ticking an item). */
export function popFrom(el: Element | null): void {
  if (!el || reducedMotion()) return;
  const r = el.getBoundingClientRect();
  void confetti({
    particleCount: 28, spread: 55, startVelocity: 22, scalar: 0.8, ticks: 90, colors: COLORS,
    origin: { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight },
  });
}

/** Big two-sided burst (perfect quiz, level up, phase complete). */
export function bigCelebration(): void {
  if (reducedMotion()) return;
  const shot = (x: number, angle: number) =>
    void confetti({ particleCount: 90, angle, spread: 70, startVelocity: 55, origin: { x, y: 0.75 }, colors: COLORS });
  shot(0.1, 60);
  shot(0.9, 120);
}
