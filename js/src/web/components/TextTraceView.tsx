// The trace as text (src/core/text.ts), in a read-only editor.
import MonacoEditor from "@monaco-editor/react";
import { useMonacoTheme } from "../hooks/useColorScheme.ts";
import { setupMonaco } from "../monaco/setup.ts";
import { TRACE } from "../monaco/traceLanguage.ts";

export function TextTraceView({ text, wordWrap }: { text: string; wordWrap: boolean }) {
  const theme = useMonacoTheme();
  return (
    <MonacoEditor
      value={text || "— press Run to observe InstCombine —"}
      language={TRACE}
      beforeMount={setupMonaco}
      theme={theme}
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
