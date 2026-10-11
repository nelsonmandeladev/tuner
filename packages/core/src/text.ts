/**
 * Text folding for matching what the user types against provider names:
 * case, accents and punctuation do not matter ("telefoot" matches "Téléfoot").
 */
export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
