// Everything the app's editors need from Monaco, registered once before the first editor
// mounts (pass it as every editor's beforeMount).
import type * as monacoApi from "monaco-editor";
import { registerCppHighlighting } from "./cpp.ts";
import { registerLlvmIr } from "./llvmIr.ts";
import { defineThemes } from "./theme.ts";

let done = false;

export function setupMonaco(monaco: typeof monacoApi): void {
  if (done) return;
  done = true;
  registerLlvmIr(monaco);
  registerCppHighlighting(monaco);
  defineThemes(monaco);
}
