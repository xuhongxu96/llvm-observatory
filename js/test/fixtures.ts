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
      values: [
        { value: { ptr: "0x10", ir: "i32 %x" }, frames: [simplify, visitAdd], rule: visitAdd },
        { value: { ptr: "0x30", ir: "  %b = shl i32 %x, 1", opcode: "shl", fn: "f", bb: "entry" }, frames: [visitMul], rule: visitMul },
      ],
      replacements: [
        {
          old: { ptr: "0x20", ir: "  %a = add i32 %x, 0", opcode: "add", fn: "f", bb: "entry" },
          new: { ptr: "0x10", ir: "i32 %x" },
          frames: [visitAdd],
          rule: visitAdd,
        },
      ],
    },
    { number: 2, pass: "instcombine", values: [], replacements: [] },
  ],
};
