import { existsSync, statSync } from "node:fs";

export function needsDesktopCaptionBuild(executable, sources) {
  if (!existsSync(executable)) return true;
  const builtAt = statSync(executable).mtimeMs;
  return sources.some(source => statSync(source).mtimeMs > builtAt);
}
