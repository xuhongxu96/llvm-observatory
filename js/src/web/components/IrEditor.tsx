// The input IR editor and the read-only output IR view.
import MonacoEditor from "@monaco-editor/react";
import { useMonacoTheme } from "../hooks/useColorScheme.ts";
import { LLVM_IR } from "../monaco/llvmIr.ts";
import { setupMonaco } from "../monaco/setup.ts";

const OPTIONS = { minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false } as const;

export function IrEditor({ value, onChange }: { value: string; onChange(value: string): void }) {
  const theme = useMonacoTheme();
  return (
    <MonacoEditor
      value={value}
      onChange={(v) => onChange(v ?? "")}
      language={LLVM_IR}
      beforeMount={setupMonaco}
      theme={theme}
      options={{ ...OPTIONS, renderWhitespace: "selection" }}
    />
  );
}

// The optimized IR, or the driver's error output.
export function OutputIr({ ir, error }: { ir: string; error: string }) {
  const theme = useMonacoTheme();
  return (
    <MonacoEditor
      key={error ? "error" : "ir"} // a fresh editor when switching language
      value={error || ir || "; run to see the optimized IR"}
      language={error ? "plaintext" : LLVM_IR}
      beforeMount={setupMonaco}
      theme={theme}
      options={{ ...OPTIONS, readOnly: true, domReadOnly: true, wordWrap: error ? "on" : "off", contextmenu: false }}
    />
  );
}
