// Code outside an editor (the guide), colored as the editors color it: LLVM IR by
// Monaco's tokenizer (src/web/monaco/llvmIr.ts), C++ by tree-sitter's categories
// (src/web/monaco/cpp.ts) in the themes' colors. Plain until the coloring is ready.
import { loader } from "@monaco-editor/react";
import { useEffect, useState } from "react";
import { useColorScheme } from "../hooks/useColorScheme.ts";
import { cppRuns } from "../monaco/cpp.ts";
import { LLVM_IR } from "../monaco/llvmIr.ts";
import { setupMonaco } from "../monaco/setup.ts";
import { COLORS } from "../monaco/theme.ts";

export type CodeLanguage = "llvm-ir" | "cpp" | "text";

// Monaco's colorizer: its spans take the current theme's colors.
async function colorizeIr(text: string): Promise<string> {
  const monaco = await loader.init();
  setupMonaco(monaco);
  return monaco.editor.colorize(text, LLVM_IR, { tabSize: 2 });
}

export function Code({ text, language }: { text: string; language: CodeLanguage }) {
  const dark = useColorScheme().scheme === "dark";
  const [ir, setIr] = useState<string | null>(null);
  const [cpp, setCpp] = useState<{ text: string; category: string | null }[] | null>(null);
  useEffect(() => {
    let live = true;
    setIr(null);
    setCpp(null);
    if (language === "llvm-ir") colorizeIr(text).then((html) => live && setIr(html), () => {});
    if (language === "cpp") cppRuns(text).then((runs) => live && setCpp(runs), () => {});
    return () => {
      live = false;
    };
  }, [text, language]);

  // colorize ends each line with <br/>; the text is shown in a <pre>, which breaks lines.
  if (ir !== null) return <span dangerouslySetInnerHTML={{ __html: ir.replace(/<br\/>/g, "\n").replace(/\n$/, "") }} />;
  if (cpp !== null)
    return cpp.map((run, i) =>
      run.category ? (
        <span key={i} style={{ color: `#${COLORS[run.category][dark ? 1 : 0]}`, fontStyle: run.category === "comment" ? "italic" : undefined }}>
          {run.text}
        </span>
      ) : (
        run.text
      ),
    );
  return text;
}
