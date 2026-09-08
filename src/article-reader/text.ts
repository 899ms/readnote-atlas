export type TextContext = {
  prefix: string;
  suffix: string;
};

export function getContextForText(fullText: string, selectedText: string, contextChars = 80): TextContext {
  const index = fullText.indexOf(selectedText);
  if (index === -1) {
    return { prefix: "", suffix: "" };
  }

  return {
    prefix: fullText.slice(Math.max(0, index - contextChars), index),
    suffix: fullText.slice(index + selectedText.length, index + selectedText.length + contextChars)
  };
}
