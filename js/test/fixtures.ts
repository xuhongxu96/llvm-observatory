// A small trace for tests: one iteration with a fold in visitAdd and its replacement.
import type { Frame, Trace } from "../src/core/types.ts";

export const frame = (fn: string, path: string | null, line: number): Frame => ({ function: fn, path, line, column: 0 });

const visitAdd = frame("llvm::InstCombinerImpl::visitAdd(llvm::BinaryOperator&)", "lib/Transforms/InstCombine/InstCombineAddSub.cpp", 1556);
const simplify = frame("llvm::simplifyAddInst(llvm::Value*, llvm::Value*)", "lib/Analysis/InstructionSimplify.cpp", 622);
const visitMul = frame("llvm::InstCombinerImpl::visitMul(llvm::BinaryOperator&)", "lib/Transforms/InstCombine/InstCombineMulDivRem.cpp", 200);

export const TRACE: Trace = {
  iterations: [
    {
      number: 1,
      pass: "instcombine",
      visits: [
        { number: 1, instruction: { ptr: "0x20", ir: "  %a = add i32 %x, 0", opcode: "add", fn: "f", bb: "entry" } },
        { number: 2, instruction: { ptr: "0x40", ir: "  %b = mul i32 %a, 2", opcode: "mul", fn: "f", bb: "entry" } },
      ],
      matches: [
        {
          visit: 1,
          site: { path: "lib/Analysis/InstructionSimplify.cpp", line: 608, column: 7 },
          matchers: [{ name: "cstval_pred_ty", line: 361, value: "i32 0", result: true, bound: [], matchers: [] }],
        },
      ],
      values: [
        { value: { ptr: "0x10", ir: "i32 %x" }, visit: 1, frames: [simplify, visitAdd], rule: visitAdd },
        { value: { ptr: "0x30", ir: "  %b = shl i32 %x, 1", opcode: "shl", fn: "f", bb: "entry" }, visit: 2, frames: [visitMul], rule: visitMul },
      ],
      replacements: [
        {
          old: { ptr: "0x20", ir: "  %a = add i32 %x, 0", opcode: "add", fn: "f", bb: "entry" },
          new: { ptr: "0x10", ir: "i32 %x" },
          visit: 1,
          frames: [visitAdd],
          rule: visitAdd,
        },
      ],
      irAfter: "define i32 @f(i32 %x) {\n  %b = shl i32 %x, 1\n  ret i32 %b\n}\n",
    },
    { number: 2, pass: "instcombine", visits: [], matches: [], values: [], replacements: [], irAfter: "" },
  ],
};
