// The trace as text (src/core/text.ts), in a read-only editor.
import MonacoEditor from "@monaco-editor/react";
import { useColorScheme } from "../hooks/useColorScheme.ts";
import { registerTraceLanguage, TRACE, TRACE_THEME } from "../monaco/traceLanguage.ts";

export function TextTraceView({ text, wordWrap }: { text: string; wordWrap: boolean }) {
  const { scheme } = useColorScheme();
  return (
    <MonacoEditor
      value={text || "— press Run to observe InstCombine —"}
      language={TRACE}
      // The themes must exist before the editor applies one: Monaco's theme is global.
      beforeMount={registerTraceLanguage}
      theme={TRACE_THEME[scheme]}
      options={{
        readOnly: true,
        domReadOnly: true,
        minimap: { enabled: false },
        fontSize: 13,
        scrollBeyondLastLine: false,
        wordWrap: wordWrap ? "on" : "off",
        contextmenu: false,
      }}
    />
  );
}
