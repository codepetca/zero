# Zero icon assets

The Zero slashed-circle mark, in the shared purple `#683bef` and white.
Owner-selected softened slash corners and 20% thicker strokes (2.4 on a 24-unit
canvas) apply to the circle and slash. Slash corner radius is 0.6.
Each SVG is an editable square vector. The mark occupies 85% of the
canvas, with equal spacing on every side. Backgrounds stay square so the host
can apply its own rounded or circular mask.

| Asset | Appearance | Use |
| --- | --- | --- |
| [zero-purple.svg](zero-purple.svg) | Purple, transparent background | Light surfaces and layouts with their own background |
| [zero-purple-on-white.svg](zero-purple-on-white.svg) | Purple on white | Image uploads that need a solid light background |
| [zero-white-on-purple.svg](zero-white-on-purple.svg) | White on purple | App tiles and purple surfaces |

Preserve the same geometry, stroke weight and spacing across variants. Use an
SVG directly when supported. For raster uploads, use the 1024 × 1024 PNG exports;
the purple transparent export retains alpha. Give an image meaningful alt text
when it identifies Zero; use empty alt text when adjacent text already names it.

After installing the existing website dependencies, export from any directory:

```sh
node /path/to/zero/design/brand/export.mjs
```

This uses the website's existing Sharp dependency; no new package is installed.
Generated PNGs, preview and ZIP are in `exports/` and are intentionally ignored.
The ZIP includes all three SVGs, all three PNGs and this usage guide. The website, editor and future native builds use this shared mark. Published
release assets remain immutable.

The export also generates `zero-github-app.svg` and `zero-github-app.png` for the
Codepet Zero GitHub App avatar. This purple-on-white version scales only the mark
to 88%, increasing its internal edge padding from 7.5% to about 12.6%. Its square
background remains full size. This host-specific export stays outside the general
three-variant ZIP; website, editor and native icon geometry is unchanged.

## Website title lockup — selected 2026-10-20

The owner selected the icon followed by lowercase **zero** as one image.
[Light title](zero-wordmark.svg) preserves the approved purple icon and outlined
lettering; [dark title](zero-wordmark-dark.svg) uses the existing white-on-purple
icon treatment and white lettering. The final-o replacement experiment is not
the website default. Website preparation copies these authored SVGs to generated
public assets. Preserve their aspect ratio and accessible Zero/home labels.
