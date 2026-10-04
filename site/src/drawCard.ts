import { BADGE_PATHS } from "./components/BadgeIcon";
import { CARD_H, CARD_W, SITE_URL, type CardModel } from "./share";
import { BADGES } from "./gamify";

/** Fixed light palette: the card looks the same whatever theme the viewer uses. */
const C = {
  bg: "#eaf2ff",
  dots: "#c9d8f5",
  card: "#ffffff",
  card2: "#f5f8ff",
  ink: "#17183a",
  muted: "#5d6290",
  tomato: "#ff6b4a",
  sun: "#ffc83d",
};

const DISPLAY = '"Lilita One", "Arial Rounded MT Bold", sans-serif';
const BODY = '"Atkinson Hyperlegible", "Segoe UI", sans-serif';
const MONO = '"IBM Plex Mono", Consolas, monospace';

/** Player colors are CSS variables on the page; resolve them to real colors for the canvas. */
export function resolveColor(cssColor: string): string {
  const m = /^var\((--[\w-]+)\)$/.exec(cssColor.trim());
  if (!m) return cssColor;
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || "#3f5bff";
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // GitHub avatars allow CORS, so the canvas stays exportable
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draw a box with a thick outline and a hard offset shadow, like the site's cards. */
function sticker(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, shadow: string, offset = 8) {
  roundRect(ctx, x + offset, y + offset, w, h, r);
  ctx.fillStyle = shadow;
  ctx.fill();
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, maxWidth: number, start: number, min: number): number {
  let size = start;
  ctx.font = font(size);
  while (size > min && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = font(size);
  }
  return size;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s+\S*$/, "")}…`;
    return kept;
  }
  return lines;
}

function badgeGlyph(ctx: CanvasRenderingContext2D, id: keyof typeof BADGE_PATHS, cx: number, cy: number, size: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = C.sun;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  const scale = (size * 0.56) / 24;
  ctx.save();
  ctx.translate(cx - 12 * scale, cy - 12 * scale);
  ctx.scale(scale, scale);
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = C.ink;
  ctx.stroke(new Path2D(BADGE_PATHS[id]));
  ctx.restore();
}

export async function drawCard(canvas: HTMLCanvasElement, model: CardModel, avatarUrl: string | null, playerColor: string): Promise<void> {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  const color = resolveColor(playerColor);

  // Make sure the web fonts are ready before measuring and drawing text.
  await Promise.all([
    document.fonts.load(`76px ${DISPLAY}`),
    document.fonts.load(`700 30px ${BODY}`),
    document.fonts.load(`600 20px ${MONO}`),
  ]).catch(() => undefined);
  const avatar = avatarUrl ? await loadImage(avatarUrl) : null;

  // Background: sky blue with a dot grid.
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = C.dots;
  for (let x = 11; x < CARD_W; x += 22) for (let y = 11; y < CARD_H; y += 22) ctx.fillRect(x, y, 3, 3);

  // Main card.
  sticker(ctx, 36, 36, CARD_W - 84, CARD_H - 84, 36, C.card, color, 12);

  // Avatar (or initial) with a thick ring in the player's color.
  const ax = 90, ay = 120, size = 220;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax + size / 2, ay + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = C.card2;
  ctx.fill();
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, ax, ay, size, size);
  } else {
    ctx.fillStyle = C.ink;
    ctx.font = `110px ${DISPLAY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(model.name.slice(0, 1).toUpperCase(), ax + size / 2, ay + size / 2 + 6);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(ax + size / 2, ay + size / 2, size / 2, 0, Math.PI * 2);
  ctx.lineWidth = 12;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.strokeStyle = C.ink;
  ctx.beginPath();
  ctx.arc(ax + size / 2, ay + size / 2, size / 2 + 8, 0, Math.PI * 2);
  ctx.stroke();

  // Name under the avatar.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.ink;
  fitText(ctx, model.name, (px) => `${px}px ${DISPLAY}`, 260, 40, 24);
  ctx.fillText(model.name, ax + size / 2, ay + size + 70);
  ctx.fillStyle = C.muted;
  ctx.font = `600 20px ${MONO}`;
  ctx.fillText(model.handle, ax + size / 2, ay + size + 102);

  // Right column.
  const rx = 390, rw = CARD_W - rx - 110;
  ctx.textAlign = "left";
  ctx.fillStyle = C.muted;
  ctx.font = `600 20px ${MONO}`;
  ctx.fillText(model.eyebrow.toUpperCase().split("").join(" "), rx, 116);

  ctx.fillStyle = C.ink;
  // Leave room on the right for the level sticker / featured badge.
  const headWidth = rw - 190;
  const headSize = fitText(ctx, model.headline, (px) => `${px}px ${DISPLAY}`, headWidth, 78, 46);
  const headLines = ctx.measureText(model.headline).width <= headWidth ? [model.headline] : wrap(ctx, model.headline, headWidth, 2);
  headLines.forEach((l, i) => ctx.fillText(l, rx, 196 + i * (headSize + 4)));
  if (model.featuredBadge) badgeGlyph(ctx, model.featuredBadge, CARD_W - 170, 170, 112);

  // Stat tiles: four equal tiles, or (badge cards) one double-width "Earned for" tile plus two.
  const tileY = headLines.length > 1 ? 300 : 262;
  const tileW = (rw - 3 * 16) / 4;
  const firstWide = Boolean(model.stats[0]?.wide);
  const layout = (firstWide ? model.stats.slice(0, 3) : model.stats.slice(0, 4)).map((stat, i) => ({
    stat,
    span: firstWide && i === 0 ? 2 : 1,
    col: firstWide && i > 0 ? i + 1 : i,
  }));
  for (const { stat, span, col } of layout) {
    const tx = rx + col * (tileW + 16);
    const w = tileW * span + 16 * (span - 1);
    roundRect(ctx, tx, tileY, w, 104, 18);
    ctx.fillStyle = C.card2;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.fillStyle = C.muted;
    ctx.font = `600 16px ${MONO}`;
    ctx.fillText(stat.label.toUpperCase(), tx + 16, tileY + 32);
    ctx.fillStyle = C.ink;
    if (span === 2) {
      ctx.font = `700 22px ${BODY}`;
      wrap(ctx, stat.value, w - 32, 2).forEach((l, li) => ctx.fillText(l, tx + 16, tileY + 62 + li * 26));
    } else {
      fitText(ctx, stat.value, (px) => `${px}px ${DISPLAY}`, w - 32, 44, 24);
      ctx.fillText(stat.value, tx + 16, tileY + 84);
    }
  }

  // Earned badges row.
  const by = tileY + 160;
  if (model.badges.length > 0) {
    ctx.fillStyle = C.muted;
    ctx.font = `600 16px ${MONO}`;
    ctx.fillText(`BADGES ${model.badges.length}/${BADGES.length}`, rx, by - 6);
    model.badges.slice(0, 10).forEach((id, i) => badgeGlyph(ctx, id, rx + 30 + i * 66, by + 38, 54));
  }

  // Level sticker, top right (not on badge cards, where the badge takes that spot).
  if (!model.featuredBadge) {
    const sx = CARD_W - 175, sy = 118;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate((8 * Math.PI) / 180);
    ctx.beginPath();
    ctx.arc(7, 7, 70, 0, Math.PI * 2);
    ctx.fillStyle = C.ink;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 70, 0, Math.PI * 2);
    ctx.fillStyle = C.tomato;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = `600 15px ${MONO}`;
    ctx.fillText(model.sticker.top, 0, -18);
    ctx.font = `64px ${DISPLAY}`;
    ctx.fillText(model.sticker.big, 0, 40);
    ctx.restore();
  }

  // Footer.
  ctx.textAlign = "left";
  ctx.fillStyle = C.tomato;
  roundRect(ctx, 90, CARD_H - 112, 46, 34, 9);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `20px ${DISPLAY}`;
  ctx.fillText("AI", 100, CARD_H - 88);
  ctx.fillStyle = C.ink;
  ctx.font = `26px ${DISPLAY}`;
  ctx.fillText("Eng Lab", 148, CARD_H - 86);
  ctx.textAlign = "right";
  ctx.fillStyle = C.muted;
  ctx.font = `600 18px ${MONO}`;
  ctx.fillText(SITE_URL.replace(/^https:\/\//, "").replace(/\/$/, ""), CARD_W - 110, CARD_H - 88);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the image"))), "image/png");
  });
}
