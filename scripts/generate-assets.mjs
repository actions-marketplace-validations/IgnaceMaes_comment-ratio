import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// opentype.js is CommonJS; a named ESM import of it fails at runtime.
const { parse: parseFont } = createRequire(import.meta.url)("opentype.js");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, ".github", "assets");
const fonts = path.join(root, "node_modules", "geist", "dist", "fonts");

// opentype.js 2.0.0 deprecated loadSync into returning undefined.
function loadFont(file) {
  const buf = fs.readFileSync(file);
  return parseFont(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

const sans = {
  bold: loadFont(path.join(fonts, "geist-sans", "Geist-Bold.ttf")),
  medium: loadFont(path.join(fonts, "geist-sans", "Geist-Medium.ttf")),
  regular: loadFont(path.join(fonts, "geist-sans", "Geist-Regular.ttf")),
};
const mono = {
  bold: loadFont(path.join(fonts, "geist-mono", "GeistMono-Bold.ttf")),
  medium: loadFont(path.join(fonts, "geist-mono", "GeistMono-Medium.ttf")),
  regular: loadFont(path.join(fonts, "geist-mono", "GeistMono-Regular.ttf")),
};

const n = (v) => Number(v.toFixed(2)).toString();

// opentype.js 2.0.0's toPathData() can emit NaN coordinates, and renderers
// truncate a path at the first unparseable number without warning. Walking
// the commands ourselves is the only reliable serialization.
function serialize(commands) {
  let d = "";
  for (const c of commands) {
    if (c.type === "M") d += `M${n(c.x)} ${n(c.y)}`;
    else if (c.type === "L") d += `L${n(c.x)} ${n(c.y)}`;
    else if (c.type === "Q") d += `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
    else if (c.type === "C") {
      d += `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
    } else if (c.type === "Z") d += "Z";
  }
  return d;
}

function width(font, str, size, tracking = 0) {
  if (!str) return 0;
  return font.getAdvanceWidth(str, size) + tracking * (str.length - 1);
}

// Laid out per glyph so tracking is available; getPath on the whole string is not.
function text(str, { font, size, x, y, fill, tracking = 0, anchor = "start" }) {
  const commands = [];
  let cursor = 0;
  for (const ch of str) {
    commands.push(...font.getPath(ch, cursor, y, size).commands);
    cursor += font.getAdvanceWidth(ch, size) + tracking;
  }

  // Centre and right-align on the ink rather than the advance width, whose
  // trailing side bearing would push the string visibly off centre.
  let dx = x;
  if (anchor !== "start") {
    const xs = commands.flatMap((c) => [c.x, c.x1, c.x2].filter((v) => v !== undefined));
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    dx = anchor === "middle" ? x - (min + max) / 2 : x - max;
  }

  for (const c of commands) {
    if (c.x !== undefined) c.x += dx;
    if (c.x1 !== undefined) c.x1 += dx;
    if (c.x2 !== undefined) c.x2 += dx;
  }
  return `<path d="${serialize(commands)}" fill="${fill}"/>`;
}

const MARK = `<path d="M8 24 L22 10"/><path d="M18 24 L32 10"/><path d="M8 38 H56"/><path d="M8 52 H40"/>`;

function mark({ x, y, scale, stroke, strokeWidth = 5 }) {
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${scale})" fill="none" stroke="${stroke}" ` +
    `stroke-width="${strokeWidth}" stroke-linecap="butt" stroke-linejoin="miter">${MARK}</g>`
  );
}

const THEMES = {
  light: {
    bg: "#FFFFFF",
    fg: "#000000",
    secondary: "#666666",
    dim: "#8F8F8F",
    hairline: "#EAEAEA",
    track: "#EDEDED",
    over: "#D93036",
  },
  dark: {
    bg: "#000000",
    fg: "#FFFFFF",
    secondary: "#A1A1A1",
    dim: "#6F6F6F",
    hairline: "#1F1F1F",
    track: "#242424",
    over: "#FF5C63",
  },
};

// The example report the README shows, so the artwork and the docs agree.
const REPORT = {
  codeAdded: 241,
  commentsAdded: 149,
  files: 4,
  limit: 0.05,
};
REPORT.totalAdded = REPORT.codeAdded + REPORT.commentsAdded;
REPORT.ratio = REPORT.commentsAdded / REPORT.totalAdded;

const pct = (v) => `${(v * 100).toFixed(1).replace(/\.0$/, "")}%`;

// Comments fill the bar from the left: foreground within the limit, red past it,
// track for the code that makes up the rest of the diff.
function meter({ x, y, w, h, segments, ratio, limit, theme }) {
  const seg = w / (segments * 1.6 - 0.6);
  const step = seg * 1.6;
  const within = Math.round(limit * segments);
  const filled = Math.round(ratio * segments);

  let out = "";
  for (let i = 0; i < segments; i++) {
    const fill = i < within ? theme.fg : i < filled ? theme.over : theme.track;
    out +=
      `<rect x="${n(x + i * step)}" y="${n(y)}" width="${n(seg)}" height="${n(h)}" ` +
      `rx="${n(Math.min(2, seg / 2))}" fill="${fill}"/>`;
  }
  return out;
}

function banner(name) {
  const t = THEMES[name];
  const W = 1200;
  const H = 340;
  const split = 716;
  const right = 780;
  const rightEnd = 1136;

  const parts = [
    `<rect width="${W}" height="${H}" rx="14" fill="${t.bg}"/>`,
    `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="13.5" fill="none" stroke="${t.hairline}"/>`,
    `<rect x="${split}" y="0" width="1" height="${H}" fill="${t.hairline}"/>`,

    mark({ x: 52.38, y: 38.59, scale: 1.75, stroke: t.fg }),
    text("comment-ratio", { font: sans.bold, size: 46, x: 62, y: 190, fill: t.fg }),
    text("Coding agents love to narrate every line.", {
      font: sans.regular,
      size: 19,
      x: 62,
      y: 222,
      fill: t.secondary,
    }),
    text("Fail the pull requests that overdo it.", {
      font: sans.regular,
      size: 19,
      x: 62,
      y: 250,
      fill: t.secondary,
    }),
    text("One GitHub Action. Counted with tokei, not the diff.", {
      font: sans.regular,
      size: 15.5,
      x: 62,
      y: 288,
      fill: t.dim,
    }),

    text("COMMENT DENSITY", {
      font: mono.medium,
      size: 12,
      x: right,
      y: 66,
      fill: t.secondary,
      tracking: 1.4,
    }),
    `<circle cx="${rightEnd - 62}" cy="62" r="3.5" fill="${t.over}"/>`,
    text("FAILED", {
      font: mono.bold,
      size: 12,
      x: rightEnd,
      y: 66,
      fill: t.over,
      tracking: 1.2,
      anchor: "end",
    }),
    `<rect x="${right}" y="84" width="${rightEnd - right}" height="1" fill="${t.hairline}"/>`,

    text(pct(REPORT.ratio).replace("%", ""), {
      font: mono.bold,
      size: 52,
      x: right,
      y: 143,
      fill: t.fg,
    }),
    text("%", {
      font: mono.bold,
      size: 52,
      x: right + width(mono.bold, pct(REPORT.ratio).replace("%", ""), 52),
      y: 143,
      fill: t.dim,
    }),
    text("of the lines this pull request adds are comments", {
      font: sans.regular,
      size: 15,
      x: right,
      y: 167,
      fill: t.secondary,
    }),

    meter({
      x: right,
      y: 190,
      w: rightEnd - right,
      h: 14,
      segments: 44,
      ratio: REPORT.ratio,
      limit: REPORT.limit,
      theme: t,
    }),
    text(`limit ${pct(REPORT.limit)}`, {
      font: mono.regular,
      size: 12,
      x: right + 56,
      y: 229,
      fill: t.dim,
      anchor: "middle",
    }),
    text(`${REPORT.totalAdded} lines added`, {
      font: mono.regular,
      size: 12,
      x: rightEnd,
      y: 229,
      fill: t.dim,
      anchor: "end",
    }),
  ];

  const stats = [
    [`+${REPORT.codeAdded}`, "code"],
    [`+${REPORT.commentsAdded}`, "comments"],
    [`${REPORT.files}`, "files"],
  ];
  stats.forEach(([value, label], i) => {
    const x = right + i * 120;
    parts.push(text(value, { font: sans.bold, size: 21, x, y: 279, fill: t.fg }));
    parts.push(text(label, { font: sans.regular, size: 13, x, y: 299, fill: t.dim }));
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="comment-ratio — fail pull requests that add too many comments">`,
    ...parts.map((p) => `  ${p}`),
    "</svg>",
    "",
  ].join("\n");
}

function socialPreview() {
  const t = THEMES.dark;
  const W = 1280;
  const H = 640;
  const cx = W / 2;
  const barW = 720;
  const barX = (W - barW) / 2;

  const parts = [
    `<rect width="${W}" height="${H}" fill="${t.bg}"/>`,
    mark({ x: cx - 32 * 1.45, y: 140, scale: 1.45, stroke: t.fg }),
    text("comment-ratio", {
      font: sans.bold,
      size: 68,
      x: cx,
      y: 325,
      fill: t.fg,
      anchor: "middle",
    }),
    text("Coding agents love to narrate every line.", {
      font: sans.regular,
      size: 25,
      x: cx,
      y: 372,
      fill: t.secondary,
      anchor: "middle",
    }),
    meter({
      x: barX,
      y: 432,
      w: barW,
      h: 18,
      segments: 60,
      ratio: REPORT.ratio,
      limit: REPORT.limit,
      theme: t,
    }),
    text(`${pct(REPORT.ratio)} comments  ·  limit ${pct(REPORT.limit)}`, {
      font: mono.regular,
      size: 17,
      x: cx,
      y: 486,
      fill: t.dim,
      anchor: "middle",
    }),
  ];

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="comment-ratio — fail pull requests that add too many comments">`,
    ...parts.map((p) => `  ${p}`),
    "</svg>",
    "",
  ].join("\n");
}

function logo() {
  const t = THEMES.dark;
  const scale = 0.9291666666666667;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="comment-ratio">`,
    `  <rect width="64" height="64" rx="14" fill="${t.bg}"/>`,
    // Slightly heavier than the 5 the mark uses elsewhere: an optical correction
    // that keeps the tile readable down to 16px.
    `  ${mark({ x: 2.27, y: 2.8, scale, stroke: t.fg, strokeWidth: 5.4 / scale })}`,
    "</svg>",
    "",
  ].join("\n");
}

function logomark() {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="comment-ratio">`,
    `  <g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="butt" stroke-linejoin="miter">${MARK}</g>`,
    "</svg>",
    "",
  ].join("\n");
}

const outputs = {
  "banner-light.svg": banner("light"),
  "banner-dark.svg": banner("dark"),
  "logo.svg": logo(),
  "logomark.svg": logomark(),
};

for (const [file, content] of Object.entries(outputs)) {
  fs.writeFileSync(path.join(assets, file), content);
  console.log(`wrote .github/assets/${file}`);
}

// GitHub's social preview only takes a bitmap, so the SVG is a build artefact
// rather than something we keep. Headless Chrome is the one rasterizer we can
// count on having; there is no rsvg/inkscape/imagemagick here.
const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => fs.existsSync(p));

const svgPath = path.join(os.tmpdir(), "comment-ratio-social-preview.svg");
fs.writeFileSync(svgPath, socialPreview());

if (!CHROME) {
  console.log(`\nNo Chrome found; rasterize ${svgPath} to 1280x640 yourself.`);
} else {
  const png = path.join(assets, "social-preview.png");
  execFileSync(
    CHROME,
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--window-size=1280,640",
      `--screenshot=${png}`,
      `file://${svgPath}`,
    ],
    { stdio: "ignore" },
  );
  console.log("wrote .github/assets/social-preview.png");
}
