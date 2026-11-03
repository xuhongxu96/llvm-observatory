// The trace as formatted JSON (the trace object of `observe.ts --json`), in a read-only
// editor: folding, search and selection come with it.
import MonacoEditor from "@monaco-editor/react";
import { useMonacoTheme } from "../hooks/useColorScheme.ts";
import { setupMonaco } from "../monaco/setup.ts";

export function JsonTraceView({ json, wordWrap }: { json: string; wordWrap: boolean }) {
  const theme = useMonacoTheme();
  return (
    <MonacoEditor
      value={json || "// press Run to observe InstCombine"}
      language="json"
      beforeMount={setupMonaco}
      theme={theme}
      options={{
        readOnly: true,
        domReadOnly: true,
        minimap: { enabled: false },
        fontSize: 13,
        scrollBeyondLastLine: false,
        wordWrap: wordWrap ? "on" : "off",
        folding: true,
      }}
    />
  );
}
