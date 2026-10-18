# Zero icon assets

The existing slashed-zero mark, in the shared purple `#683bef` and white.
Each SVG is an editable square vector. The mark occupies five-sixths of the
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
The ZIP includes all three SVGs, all three PNGs and this usage guide. The current
website/editor/native icon consumers have their own existing integration; these
files provide reusable, explicit-color assets for deliberate adoption.
