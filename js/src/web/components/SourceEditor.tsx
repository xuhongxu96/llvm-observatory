// An observed source in a read-only editor: C++ highlighting (src/web/monaco/cpp.ts), the
// MC/DC badges of the iteration after their conditions (hover one for its test vectors),
// annotations (underlined, with a hover; e.g. a match call's matchers), the current line
// and the lines that evaluated conditions marked, line numbers that open the line on
// GitHub, and Ctrl/⌘+click or F12 on a name to follow it (to its definition).
import MonacoEditor, { type OnMount } from "@monaco-editor/react";
import type * as monacoApi from "monaco-editor";
import { useEffect, useRef, useState } from "react";
import type { TargetInfo } from "../../core/observatory.ts";
import { callArguments } from "../../core/tags.ts";
import { useMonacoTheme } from "../hooks/useColorScheme.ts";
import type { Badge, SourceMarks } from "../model/badges.ts";
import { githubUrl } from "../model/github.ts";
import { CPP } from "../monaco/cpp.ts";
import { setupMonaco } from "../monaco/setup.ts";

type Editor = monacoApi.editor.IStandaloneCodeEditor;
type Monaco = typeof monacoApi;

// A name to follow to its definition.
export interface Followed {
  name: string;
  line: number;
  column: number; // 1-based, of its first character
  args: number | null; // of the call, null if not a call
}

// A span of a line with a hover (markdown).
export interface Annotation {
  line: number;
  column: number; // 1-based
  length: number;
  hover: string;
}

interface Props {
  path: string;
  source: string;
  marks: SourceMarks | null;
  annotations: Annotation[];
  line: number | null; // the current line, revealed
  target: TargetInfo | null;
  onFollow(name: Followed): void;
}

export function SourceEditor({ path, source, marks, annotations, line, target, onFollow }: Props) {
  const theme = useMonacoTheme();
  const [mounted, setMounted] = useState<{ editor: Editor; monaco: Monaco } | null>(null);
  const decorations = useRef<monacoApi.editor.IEditorDecorationsCollection | null>(null);
  // The line kept in the middle of the editor until the user scrolls: the editor's
  // height changes as its panel opens, which would otherwise leave the line near the top.
  const anchor = useRef<number | null>(null);
  const centering = useRef(false);
  const githubLine = useRef<(n: number) => string | null>(() => null);
  githubLine.current = (n) => (target ? githubUrl(target, path, n) : null);
  const follow = useRef(onFollow);
  follow.current = onFollow;

  const onMount: OnMount = (editor, monaco) => {
    decorations.current = editor.createDecorationsCollection();
    editor.onDidLayoutChange(() => center(editor));
    editor.onDidScrollChange((e) => {
      if (e.scrollTopChanged && !centering.current) anchor.current = null; // the user scrolled
    });
    editor.onMouseDown((e) => {
      const position = e.target.position;
      if (!position) return;
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
        const url = githubLine.current(position.lineNumber);
        if (url) window.open(url, "_blank", "noopener");
      } else if (e.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT && (e.event.ctrlKey || e.event.metaKey)) {
        followAt(editor, position, follow.current);
      }
    });
    editor.addAction({
      id: "observatory.followDefinition",
      label: "Go to Definition",
      keybindings: [monaco.KeyCode.F12],
      run: (ed) => {
        const position = ed.getPosition();
        if (position) followAt(ed, position, follow.current);
      },
    });
    underlineOnModifier(editor, monaco);
    setMounted({ editor, monaco });
  };

  useEffect(() => {
    if (!mounted) return;
    decorations.current?.set([
      ...sourceDecorations(mounted.monaco, marks, line),
      ...annotations.map((a) => annotationDecoration(mounted.monaco, a)),
    ]);
  }, [mounted, marks, annotations, line, source]);

  useEffect(() => {
    if (!mounted) return;
    anchor.current = line;
    center(mounted.editor);
  }, [mounted, line, path]);

  function center(editor: Editor) {
    if (anchor.current === null || editor.getLayoutInfo().height === 0) return;
    centering.current = true;
    editor.revealLineInCenter(anchor.current, 1 /* ScrollType.Immediate */);
    centering.current = false;
  }

  return (
    <div className={`source-editor${target ? " linked" : ""}`}>
      <MonacoEditor
        path={`sources/${path}`}
        value={source}
        language={CPP}
        beforeMount={setupMonaco}
        onMount={onMount}
        theme={theme}
        options={{
          readOnly: true,
          domReadOnly: true,
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false,
          contextmenu: false,
          renderLineHighlight: "none",
          "semanticHighlighting.enabled": true,
        }}
      />
    </div>
  );
}

function sourceDecorations(monaco: Monaco, marks: SourceMarks | null, line: number | null) {
  const out: monacoApi.editor.IModelDeltaDecoration[] = [];
  const wholeLine = (n: number, className: string) =>
    out.push({ range: new monaco.Range(n, 1, n, 1), options: { isWholeLine: true, className } });

  for (const [n, badges] of marks?.badges ?? []) {
    if (n !== line) wholeLine(n, "source-line-hit");
    for (const badge of badges) out.push(badgeDecoration(monaco, n, badge));
  }
  if (line) wholeLine(line, "source-line-current");
  return out;
}

// The badge goes after the character before its column, which carries its hover.
function badgeDecoration(monaco: Monaco, n: number, badge: Badge): monacoApi.editor.IModelDeltaDecoration {
  const column = Math.max(badge.column, 1); // 1-based column of that character
  return {
    range: new monaco.Range(n, column, n, column + 1),
    options: {
      after: { content: badge.text, inlineClassName: `badge ${badge.kind}` },
      hoverMessage: { value: ["```", badge.title, "```"].join("\n") },
    },
  };
}


// Follows the name at `position`, with the number of arguments if it is called.
function followAt(editor: monacoApi.editor.ICodeEditor, position: monacoApi.IPosition, onFollow: Props["onFollow"]) {
  const model = editor.getModel();
  const word = model?.getWordAtPosition(position);
  if (!model || !word) return;
  const end = model.getOffsetAt({ lineNumber: position.lineNumber, column: word.endColumn });
  onFollow({ name: word.word, line: position.lineNumber, column: word.startColumn, args: callArguments(model.getValue(), end) });
}

// Underlines the word under the mouse while Ctrl/⌘ is held: it can be followed.
function underlineOnModifier(editor: Editor, monaco: Monaco) {
  const underline = editor.createDecorationsCollection();
  editor.onMouseMove((e) => {
    const position = e.target.position;
    const word = position && (e.event.ctrlKey || e.event.metaKey) ? editor.getModel()?.getWordAtPosition(position) : null;
    underline.set(
      word && position && e.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT
        ? [{ range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn), options: { inlineClassName: "source-followable" } }]
        : [],
    );
  });
  editor.onMouseLeave(() => underline.clear());
}

function annotationDecoration(monaco: Monaco, a: Annotation): monacoApi.editor.IModelDeltaDecoration {
  return {
    range: new monaco.Range(a.line, a.column, a.line, a.column + a.length),
    options: { inlineClassName: "source-annotation", hoverMessage: { value: a.hover } },
  };
}
