#!/usr/bin/env bash
# Installs the Chouette owl eyes on this Raspberry Pi and starts them on its screen.
# No admin password needed: without one, pygame goes into a private folder for this user.
set -euo pipefail

DIR="$HOME/owl-eyes"
mkdir -p "$DIR" "$HOME/.config/autostart"

echo "Writing the owl eyes program..."
cat > "$DIR/owl_eyes.py" <<'OWL_EYES_PY'
#!/usr/bin/env python3
"""Animated eyes for the Chouette owl's screen (Raspberry Pi 3B+ and a 4" display).

The eyes look around, blink, react when you tap the screen and doze off at night.

    python3 owl_eyes.py            fullscreen, on the Pi
    python3 owl_eyes.py --window   in an 800x480 window, to try it on a PC

To quit: Esc or q on a keyboard, or hold a finger on the top-left corner for 3 seconds.
A hoot.wav next to this file plays when someone taps the owl.
"""

import argparse
import datetime
import math
import os
import random
import time

import pygame
import pygame.gfxdraw

# Chouette brand colours
CREAM = (245, 239, 226)  # face, #F5EFE2
LID = (228, 216, 192)  # eyelids, a shade darker than the face
NAVY = (35, 46, 82)  # outlines and lash lines, #232E52
GOLD = (176, 141, 87)  # irises with --gold-iris, #B08D57
WHITE = (255, 255, 255)
PUPIL = (22, 22, 28)

FPS = 30
SLEEP_FROM, SLEEP_UNTIL = 23, 7  # the owl dozes between these hours
QUIT_HOLD_SECONDS = 3

# (top lid, bottom lid, pupil size) for each mood; lids go from 0 = open to 1 = closed
MOODS = {
    "idle": (0.05, 0.0, 1.0),
    "surprised": (0.0, 0.0, 0.72),
    "happy": (0.22, 0.42, 1.0),
    "asleep": (0.78, 0.06, 1.0),
}


def aa_disc(surface, color, x, y, radius):
    x, y, radius = int(round(x)), int(round(y)), int(round(radius))
    pygame.gfxdraw.filled_circle(surface, x, y, radius, color)
    pygame.gfxdraw.aacircle(surface, x, y, radius, color)


class Owl:
    def __init__(self, size, gold_iris=False, sleep_hours=(SLEEP_FROM, SLEEP_UNTIL), hoot=None):
        self.w, self.h = size
        self.r = int(min(0.20 * self.w, 0.42 * self.h))
        self.centers = [(int(0.27 * self.w), self.h // 2), (int(0.73 * self.w), self.h // 2)]
        self.gold_iris = gold_iris
        self.sleep_hours = sleep_hours
        self.hoot = hoot
        self.force_sleep = False

        self.gaze = [0.0, 0.0]
        self.target = [0.0, 0.0]
        self.top, self.bottom, self.pupil = MOODS["idle"]
        self.blink = 0.0
        self.mood = "idle"
        self.mood_until = 0.0
        self.awake_until = 0.0
        self.next_look = 0.0
        self.next_blink = 1.0
        self.blink_start = None
        self.blinks_left = 0
        self.last_hoot = -10.0
        self.zs = []
        self.next_z = 0.0
        self.now = 0.0

        size = 2 * self.r + 2
        self.eye = pygame.Surface((size, size))
        self.mask = pygame.Surface((size, size))
        self.mask.fill(CREAM)
        pygame.draw.circle(self.mask, (255, 0, 255), (self.r + 1, self.r + 1), self.r)
        self.mask.set_colorkey((255, 0, 255))
        self.z_glyph = pygame.font.Font(None, max(24, self.r // 3)).render("z", True, NAVY)

    def sleep_time(self, hour):
        if self.force_sleep:
            return True
        if not self.sleep_hours:
            return False
        start, end = self.sleep_hours
        return hour >= start or hour < end if start > end else start <= hour < end

    def tap(self, pos, now):
        """Look at the finger, then act surprised and happy (or wake up)."""
        x = (pos[0] - self.w / 2) / (self.w / 2)
        y = (pos[1] - self.h / 2) / (self.h / 2)
        length = math.hypot(x, y)
        self.target = [x / length, y / length] if length > 1 else [x, y]
        self.next_look = now + 2.5
        if self.mood == "asleep":
            self.force_sleep = False
            self.awake_until = now + 60
            self.mood = "idle"
            self.blink_start, self.blinks_left = now, 2  # groggy double blink
            return
        self.mood, self.mood_until = "surprised", now + 0.5
        if self.hoot and now - self.last_hoot > 2:
            self.hoot.play()
            self.last_hoot = now

    def update(self, dt, now, hour):
        self.now = now
        asleep = self.sleep_time(hour) and now > self.awake_until
        if asleep:
            self.mood = "asleep"
        elif self.mood == "asleep":
            self.mood = "idle"
        if self.mood in ("surprised", "happy") and now >= self.mood_until:
            if self.mood == "surprised":
                self.mood, self.mood_until = "happy", now + 1.4
            else:
                self.mood = "idle"

        if self.mood == "asleep":
            self.target = [0.0, 0.35]
        elif self.mood == "idle" and now >= self.next_look:
            self.target = self.random_target()
            self.next_look = now + random.uniform(0.8, 3.5)

        top, bottom, pupil = MOODS[self.mood]
        if self.mood == "asleep":
            top += 0.04 * math.sin(now * 1.3)  # slow breathing
        ease = 1 - math.exp(-dt * 10)
        self.top += (top - self.top) * ease
        self.bottom += (bottom - self.bottom) * ease
        self.pupil += (pupil - self.pupil) * ease
        snap = 1 - math.exp(-dt * 14)  # eyes jump to a new spot quickly, like real eyes
        self.gaze = [g + (t - g) * snap for g, t in zip(self.gaze, self.target)]
        self.update_blink(now)
        self.update_zs(now)

    def random_target(self):
        if random.random() < 0.35:  # often come back to looking straight ahead
            return [random.uniform(-0.15, 0.15), random.uniform(-0.1, 0.1)]
        angle, dist = random.uniform(0, 2 * math.pi), random.uniform(0.4, 1.0)
        return [dist * math.cos(angle), 0.7 * dist * math.sin(angle)]

    def update_blink(self, now):
        if self.blink_start is None:
            self.blink = 0.0
            if now >= self.next_blink and self.mood != "asleep":
                self.blink_start = now
                self.blinks_left = 2 if random.random() < 0.15 else 1
            return
        t = now - self.blink_start
        close, hold, reopen = 0.07, 0.04, 0.12
        if t < close:
            self.blink = t / close
        elif t < close + hold:
            self.blink = 1.05
        elif t < close + hold + reopen:
            self.blink = 1 - (t - close - hold) / reopen
        else:
            self.blink = 0.0
            self.blinks_left -= 1
            if self.blinks_left > 0:
                self.blink_start = now
            else:
                self.blink_start = None
                self.next_blink = now + random.uniform(2.0, 6.0)

    def update_zs(self, now):
        if self.mood == "asleep" and now >= self.next_z:
            self.zs.append(now)
            self.next_z = now + 1.6
        self.zs = [born for born in self.zs if now - born < 3.0]

    def draw(self, screen):
        screen.fill(CREAM)
        for i, (cx, cy) in enumerate(self.centers):
            self.draw_eye(screen, cx, cy, toward_beak=1 if i == 0 else -1)
        self.draw_zs(screen)

    def draw_eye(self, screen, cx, cy, toward_beak):
        r, c, eye = self.r, self.r + 1, self.eye
        eye.fill(CREAM)
        aa_disc(eye, WHITE, c, c, r)

        pupil_r = 0.40 * r * self.pupil
        reach = r - pupil_r - 0.10 * r
        px = c + (self.gaze[0] + 0.06 * toward_beak) * reach  # a little cross-eyed, owl-style
        py = c + self.gaze[1] * reach
        if self.gold_iris:
            aa_disc(eye, GOLD, px, py, pupil_r * 1.45)
        aa_disc(eye, PUPIL, px, py, pupil_r)
        aa_disc(eye, WHITE, px - 0.35 * pupil_r, py - 0.38 * pupil_r, max(2, 0.26 * pupil_r))
        aa_disc(eye, WHITE, px + 0.30 * pupil_r, py + 0.32 * pupil_r, max(1, 0.10 * pupil_r))

        # Each lid is a curved edge with a navy lash line: a navy ellipse with a lid-coloured one
        # drawn over it, shifted by the line width, plus a plain fill for the rest of the lid.
        lid_w, lid_h, line = int(2.6 * r), int(1.6 * r), max(2, r // 30)
        width = eye.get_width()
        top = max(self.top, self.blink)
        if top > 0.01:
            edge = int(c - r + top * 2 * r)
            rect = pygame.Rect(c - lid_w // 2, edge - lid_h, lid_w, lid_h)
            pygame.draw.ellipse(eye, NAVY, rect)
            pygame.draw.ellipse(eye, LID, rect.move(0, -line))
            pygame.draw.rect(eye, LID, (0, 0, width, rect.centery - line))
        if self.bottom > 0.01:
            edge = int(c + r - self.bottom * 2 * r)
            rect = pygame.Rect(c - lid_w // 2, edge, lid_w, lid_h)
            pygame.draw.ellipse(eye, NAVY, rect)
            pygame.draw.ellipse(eye, LID, rect.move(0, line))
            pygame.draw.rect(eye, LID, (0, rect.centery + line, width, width))

        eye.blit(self.mask, (0, 0))  # trim everything outside the round eye
        screen.blit(eye, (cx - c, cy - c))
        pygame.draw.circle(screen, NAVY, (cx, cy), r + 1, max(2, r // 28))
        pygame.gfxdraw.aacircle(screen, cx, cy, r + 1, NAVY)

    def draw_zs(self, screen):
        cx, cy = self.centers[1]
        for born in self.zs:
            age = (self.now - born) / 3.0
            scale = 0.6 + 0.8 * age
            glyph = pygame.transform.smoothscale(
                self.z_glyph,
                (max(1, int(self.z_glyph.get_width() * scale)), max(1, int(self.z_glyph.get_height() * scale))),
            )
            glyph.set_alpha(int(255 * (1 - age)))
            x = cx + 0.75 * self.r + age * 0.5 * self.r
            y = cy - 0.9 * self.r - age * 0.9 * self.r
            screen.blit(glyph, (int(x), int(y)))


def load_hoot():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hoot.wav")
    if not os.path.exists(path):
        return None
    try:
        if not pygame.mixer.get_init():
            pygame.mixer.init()
        return pygame.mixer.Sound(path)
    except pygame.error:
        return None  # no speaker found: stay silent


def main():
    parser = argparse.ArgumentParser(description="Animated eyes for the Chouette owl.")
    parser.add_argument("--window", action="store_true", help="run in a window, to try it on a PC")
    parser.add_argument("--size", default="800x480", help="window size with --window (default 800x480)")
    parser.add_argument("--gold-iris", action="store_true", help="gold owl irises around the pupils")
    parser.add_argument("--no-sleep", action="store_true", help="stay awake at night")
    args = parser.parse_args()

    os.environ.setdefault("SDL_VIDEO_MINIMIZE_ON_FOCUS_LOSS", "0")  # stay up when a pop-up takes focus
    pygame.mixer.pre_init(22050, -16, 1, 512)
    pygame.init()
    if args.window:
        screen = pygame.display.set_mode(tuple(int(v) for v in args.size.lower().split("x")))
    else:
        screen = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
        if pygame.display.get_driver() == "offscreen":  # SDL found no desktop and drew nowhere
            raise SystemExit("No desktop found: the Pi must be showing its desktop for this user.")
        pygame.mouse.set_visible(False)
    pygame.display.set_caption("Chouette owl eyes (tap to poke, s = sleep, Esc = quit)")

    owl = Owl(
        screen.get_size(),
        gold_iris=args.gold_iris,
        sleep_hours=None if args.no_sleep else (SLEEP_FROM, SLEEP_UNTIL),
        hoot=load_hoot(),
    )
    clock = pygame.time.Clock()
    press = None
    while True:
        now = time.monotonic()
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                return
            if event.type == pygame.KEYDOWN:
                if event.key in (pygame.K_ESCAPE, pygame.K_q):
                    return
                if event.key == pygame.K_s:
                    owl.force_sleep = not owl.force_sleep
                    owl.awake_until = 0.0
            if event.type == pygame.MOUSEBUTTONDOWN:
                press = (now, event.pos)
                owl.tap(event.pos, now)
            if event.type == pygame.MOUSEBUTTONUP and press:
                held, (x, y) = now - press[0], press[1]
                if held >= QUIT_HOLD_SECONDS and x < owl.w * 0.15 and y < owl.h * 0.15:
                    return
                press = None
        dt = clock.tick(FPS) / 1000
        owl.update(dt, time.monotonic(), datetime.datetime.now().hour)
        owl.draw(screen)
        pygame.display.flip()


if __name__ == "__main__":
    main()
OWL_EYES_PY

echo "Making the hoot sound..."
python3 - "$DIR/hoot.wav" <<'MAKE_HOOT'
"""Synthesize a soft two-note owl hoot ("hoo... hoo-oo") as a 16-bit mono WAV."""
import math, random, struct, sys, wave

RATE = 22050
random.seed(7)

def note(dur, f0, f1, vib=0.0, gain=0.6):
    out, phase = [], 0.0
    n = int(dur * RATE)
    for i in range(n):
        t = i / RATE
        f = f0 + (f1 - f0) * (t / dur) + vib * math.sin(2 * math.pi * 6 * t)
        phase += 2 * math.pi * f / RATE
        env = min(1.0, t / 0.06) * min(1.0, (dur - t) / 0.18)
        env = env * env * (3 - 2 * env)  # smooth attack/release
        s = math.sin(phase) + 0.18 * math.sin(2 * phase) + 0.05 * math.sin(3 * phase)
        s += 0.03 * (random.random() * 2 - 1)  # a little breath
        out.append(gain * env * s / 1.26)
    return out

def silence(dur):
    return [0.0] * int(dur * RATE)

samples = note(0.32, 430, 395) + silence(0.16) + note(0.62, 445, 360, vib=9)
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
    w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32000)) for s in samples))
print("hoot seconds:", round(len(samples) / RATE, 2))
MAKE_HOOT

ADMIN=no
if sudo -n true 2>/dev/null; then ADMIN=yes; fi  # -n: never ask for a password

PY=python3
if python3 -c "import pygame" >/dev/null 2>&1; then
    echo "pygame is already installed."
elif [ "$ADMIN" = yes ]; then
    echo "Installing pygame (takes a minute or two)..."
    sudo apt-get update -qq
    sudo apt-get install -y python3-pygame
else
    echo "Installing pygame just for $USER (no admin password needed, takes a few minutes)..."
    if python3 -m venv "$DIR/venv" && "$DIR/venv/bin/pip" install --quiet --disable-pip-version-check pygame; then
        PY="$DIR/venv/bin/python"
    else
        python3 -m pip install --user --break-system-packages --quiet pygame
    fi
fi

echo "Starting it automatically with the desktop..."
cat > "$HOME/.config/autostart/owl-eyes.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Chouette owl eyes
Comment=Animated owl eyes on the owl's screen
Exec=sh -c 'sleep 5; exec "$PY" "$DIR/owl_eyes.py"'
X-GNOME-Autostart-enabled=true
DESKTOP

if [ "$ADMIN" = yes ]; then
    sudo raspi-config nonint do_blanking 1 || true  # keep the screen on (from the next restart)
fi

echo "Opening the owl eyes on the Pi's screen..."
# The running owl programs: python processes whose first argument is our owl_eyes.py.
owl_pids() {
    for pid in $(pgrep -f owl_eyes.py || true); do
        if [ "$(tr '\0' '\n' < "/proc/$pid/cmdline" 2>/dev/null | sed -n 2p)" = "$DIR/owl_eyes.py" ]; then
            echo "$pid"
        fi
    done
}
for pid in $(owl_pids); do kill "$pid" 2>/dev/null || true; done
# An autostart that is still in its "sleep 5" would start a second copy: stop it too.
pkill -u "$(id -u)" -f "sleep 5; exec .*$DIR/owl_eyes\.py" 2>/dev/null || true
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
WAYLAND_NAME="$(ls -1 "$XDG_RUNTIME_DIR" 2>/dev/null | grep -m1 -E '^wayland-[0-9]+$' || true)"
if [ -n "$WAYLAND_NAME" ]; then export WAYLAND_DISPLAY="$WAYLAND_NAME"; fi
export DISPLAY="${DISPLAY:-:0}"
if [ -f "$HOME/.Xauthority" ]; then export XAUTHORITY="$HOME/.Xauthority"; fi
setsid "$PY" "$DIR/owl_eyes.py" > "$DIR/owl-eyes.log" 2>&1 < /dev/null &
sleep 5
if [ -n "$(owl_pids)" ]; then
    echo "All done: the owl eyes are open on the Pi's screen, and they start by themselves after every restart."
else
    echo "The eyes didn't open. Last lines of $DIR/owl-eyes.log:"
    tail -n 15 "$DIR/owl-eyes.log"
    exit 1
fi
