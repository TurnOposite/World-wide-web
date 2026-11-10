# The telegraph line's icons

Every picture in this folder is an icon a listener can pick when joining the
telegraph line (the chat in the Antenna window).

To change the bank: put pictures here, take out the ones you do not want, and
publish. Nothing else to edit: the list (`site/data/telegraph.json`) is made
again from this folder each time the site is built.

- **Formats:** png, jpg, jpeg, webp, gif, avif, svg.
- **Shape and size:** square, around 128 to 256 px. They are shown at 28 to
  56 px, and every listener downloads the whole bank when the join form
  opens: keep each file under 60 KB (the build warns past that, and leaves
  out anything over 300 KB).
- **Names:** letters, digits, `-`, `_` and `.` only, no spaces (`blue-cat.png`).
  A file named otherwise is left out, and the build says so. The order in the
  form is the order of the names, so `01-`, `02-` … arranges them.
- **Changing a picture** under the same name changes it for the messages
  already on the line. Removing one leaves those messages with a letter in a
  circle instead.

The twelve `NN-*.svg` here are placeholders drawn on 2026-11-10 so the line
could open; replace them freely.
