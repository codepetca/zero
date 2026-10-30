// The Clipboard API needs a secure context and can be denied by the host.
// A selected temporary textarea also supports browser previews over local HTTP.
export async function copyCode(text, browserNavigator = navigator, browserDocument = document) {
  if (browserNavigator.clipboard?.writeText) {
    try {
      await browserNavigator.clipboard.writeText(text);
      return true;
    } catch {
      // Some embedded browsers expose the API but deny writes.
    }
  }
  if (typeof browserDocument.execCommand !== "function" || !browserDocument.body) return false;
  const previous = browserDocument.activeElement;
  const field = browserDocument.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.setAttribute("aria-hidden", "true");
  Object.assign(field.style, {position: "fixed", left: "-9999px", top: "0"});
  browserDocument.body.appendChild(field);
  try {
    field.focus({preventScroll: true});
    field.select();
    return browserDocument.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    field.remove();
    if (previous && typeof previous.focus === "function") previous.focus({preventScroll: true});
  }
}
