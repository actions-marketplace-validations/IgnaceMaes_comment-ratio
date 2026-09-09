# Brand assets

| File                                   | Use                                                       |
| -------------------------------------- | --------------------------------------------------------- |
| `banner-light.svg` / `banner-dark.svg` | README header, 1200×340, picked by `prefers-color-scheme` |
| `logo.svg`                             | 64×64 tile, safe down to 16px                             |
| `logomark.svg`                         | the bare mark, `stroke: currentColor`                     |
| `social-preview.png`                   | 1280×640, upload under Settings → Social preview          |

## The mark

A comment above two lines of code, sharing their left margin: the two things
the action counts, in the proportion it wants to see. It is drawn on a 64 grid
in one stroke weight, at 45° and horizontal only, with mitred joins and no
curves.

## Colours

Monochrome, with colour reserved for a failing check.

| Token           | Light                 | Dark                  |
| --------------- | --------------------- | --------------------- |
| background      | `#FFFFFF`             | `#000000`             |
| foreground      | `#000000`             | `#FFFFFF`             |
| secondary / dim | `#666666` / `#8F8F8F` | `#A1A1A1` / `#6F6F6F` |
| hairline        | `#EAEAEA`             | `#1F1F1F`             |
| meter track     | `#EDEDED`             | `#242424`             |
| over the limit  | `#D93036`             | `#FF5C63`             |

## The meter

The bar is every line a pull request adds. Comments fill it from the left,
foreground up to the limit and red past it; the rest is code in the track
colour. It carries the same numbers as the example report in the README.

## Type

[Geist](https://vercel.com/font) for the wordmark and prose, Geist Mono for
figures and verdicts, both OFL. All text is converted to outlines, so the SVGs
render identically everywhere and load no fonts.

## Regenerating

Everything here is generated. Edit
[`scripts/generate-assets.mjs`](../../scripts/generate-assets.mjs) and run:

```sh
pnpm assets
```

Copy and numbers live in that script, never in the SVG paths — the text is
outlined, so there is nothing editable in the output. The meter's numbers come
from the `REPORT` constant, which mirrors the example report in the root README;
change one and change the other. The social preview is rasterized from an
in-memory SVG through headless Chrome, the only rasterizer these machines have.
