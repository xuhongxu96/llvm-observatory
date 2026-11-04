// The guide (components/HelpDialog.tsx): short sections in plain words, each with an
// example to try. Text marks `code` with backquotes (LLVM IR if it has a %, else C++),
// **bold** with double stars and [links](https://…). A picture is what the app shows, in
// a language to color it in; [[T]] in it is a badge. Every example runs without error
// and makes the records its section talks about (test/e2e/observe.test.ts).

export interface Example {
  label: string;
  ir: string;
}

export interface HelpSection {
  id: string;
  title: string;
  text: string[]; // paragraphs
  picture?: { label: string; text: string; language: "llvm-ir" | "cpp" | "text" };
  example?: Example;
}

const ADD_ZERO = `define i32 @f(i32 %x) {
  %a = add i32 %x, 0
  ret i32 %a
}
`;

const MUL_CHAIN = `define i32 @f(i32 %x) {
  %a = mul i32 %x, 2
  %b = mul i32 %a, 2
  %c = mul i32 %b, 2
  ret i32 %c
}
`;

const TWO_COMPARES = `define i1 @f(i32 %x, i32 %y) {
  %a = icmp slt i32 %x, 0
  %b = icmp slt i32 %y, 0
  %r = and i1 %a, %b
  ret i1 %r
}
`;

const SHIFTS = `define i32 @f(i32 %x) {
  %s = lshr i32 %x, 1
  %m = and i32 %s, 2147483647
  ret i32 %m
}
`;

export const HELP: HelpSection[] = [
  {
    id: "start",
    title: "Start Here",
    text: [
      "Paste LLVM IR into the editor on the left and press **Run**. LLVM Observatory runs InstCombine on it and records everything it does: each value it makes, each replacement, the line of LLVM code that did it, and why.",
      "Try the example: InstCombine sees that adding 0 changes nothing.",
    ],
    picture: {
      label: "The trace shows",
      text: "; value, made by visitAdd in visit 1\ni32 %x\n; replacement\n%a = add i32 %x, 0  ; → i32 %x",
      language: "llvm-ir",
    },
    example: { label: "x + 0", ir: ADD_ZERO },
  },
  {
    id: "trace",
    title: "Read the Trace",
    text: [
      "The trace on the right lists what InstCombine did, iteration by iteration.",
      "A **value** is something a fold made, such as `shl i32 %x, 1`. The orange tag is the **rule**: the InstCombine function that made it. The blue tag is the **visit**: which instruction InstCombine was working on.",
      "A **replacement** means InstCombine replaced every use of one value with another.",
      "Open **stack** under a record to see the whole chain of calls that led to it. The boxes at the top filter the records by text, opcode, rule or function.",
    ],
    example: { label: "x * 2 * 2 * 2", ir: MUL_CHAIN },
  },
  {
    id: "source",
    title: "See the Code",
    text: [
      "Click a rule or a file link to open LLVM's source at that line. The source is the exact version that ran.",
      "**Ctrl+click** (**⌘+click** on a Mac) a function name to jump to it, or press **F12**. The path you took shows at the top; **←** goes back. A line number opens the line on GitHub.",
    ],
  },
  {
    id: "conditions",
    title: "Why Did It Fire?",
    text: [
      "The source shows how each condition turned out, in a small badge after it: **T** for true, **F** for false, **T/F** if it went both ways, **–** if it was never checked. After a condition with `&&` or `||`, the badge **→ T** or **→ F** is the result of the whole condition. Hover a badge for the details.",
      "The tabs at the top choose which run of the code you see: **visit 1** is just the work on one instruction, **iteration 1** a whole pass over the function, **whole run** everything.",
      "Each iteration's **coverage** button lists the LLVM files it ran, with how many conditions it checked in each. Pick one to see its badges.",
    ],
    picture: {
      label: "In simplifyAddInst, for x + 0",
      text: "if (match(Op1, m_Zero()))[[T]]\n  return Op0;",
      language: "cpp",
    },
    example: { label: "x + 0", ir: ADD_ZERO },
  },
  {
    id: "patterns",
    title: "Pattern Checks",
    text: [
      "InstCombine looks for shapes in the IR with calls like `match(V, m_LShr(m_Value(X), m_APInt(C)))`. Each call that ran is underlined. Hover it to see each part of the pattern: ✓ if it matched, ✗ if not, and what it captured.",
    ],
    picture: {
      label: "Hovering a match call",
      text: "m_LShr(…)  i32 %s  ✓\n├ m_Value(X)  i32 %x  ✓  X = i32 %x\n└ m_APInt(C)  i32 1  ✓  C = 1",
      language: "text",
    },
    example: { label: "two compares", ir: TWO_COMPARES },
  },
  {
    id: "iterations",
    title: "Iterations",
    text: [
      "InstCombine goes over the function again and again until nothing changes. Each pass is an **iteration**; AggressiveInstCombine runs after it.",
      "The **IR after** menu in the Optimized IR panel shows the IR after each iteration. The last one is the result.",
    ],
    example: { label: "a shift and a mask", ir: SHIFTS },
  },
  {
    id: "data",
    title: "Raw Data",
    text: [
      "The **json** tab shows the trace as JSON, and **events** shows what the instrumented LLVM reported, before any processing. Both can be copied or downloaded.",
      "**Share** copies a link to your IR. Whoever opens it sees the same result.",
    ],
  },
  {
    id: "thanks",
    title: "Thanks",
    text: [
      "Thanks to Yingwei Zheng (dtcxzyw) and Min Hsu (mshockwave) for their suggestions in the [LLVM Discourse thread](https://discourse.llvm.org/t/web-based-trace-viewer-for-instcombine-rewrites/90889).",
    ],
  },
];
