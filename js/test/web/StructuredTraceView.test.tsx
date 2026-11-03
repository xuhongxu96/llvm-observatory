// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StructuredTraceView } from "../../src/web/components/StructuredTraceView.tsx";
import { TRACE } from "../fixtures.ts";

const TARGET = { ref: "main", commit: "abc123", version: "23.0.0" };

afterEach(cleanup);

describe("StructuredTraceView", () => {
  it("shows values and replacements of each iteration, and one that changed nothing", () => {
    render(<StructuredTraceView iterations={TRACE.iterations} target={TARGET} onOpen={() => {}} />);
    expect(screen.getByText("Iteration 1")).toBeTruthy();
    expect(screen.getByText("Iteration 2")).toBeTruthy(); // changed nothing: a header alone
    expect(screen.getAllByRole("button", { name: "InstCombinerImpl::visitAdd" })).toHaveLength(2);
    expect(screen.getByText("%a = add i32 %x, 0")).toBeTruthy();
  });

  it("filters records", () => {
    render(<StructuredTraceView iterations={TRACE.iterations} target={TARGET} onOpen={() => {}} />);
    fireEvent.change(screen.getByLabelText("opcode"), { target: { value: "shl" } });
    expect(screen.queryByText("%a = add i32 %x, 0")).toBeNull();
    expect(screen.getByRole("button", { name: "InstCombinerImpl::visitMul" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("opcode"), { target: { value: "fdiv" } });
    expect(screen.getByText("no records match the filters")).toBeTruthy();
    fireEvent.click(screen.getByText("clear"));
    expect(screen.getByText("%a = add i32 %x, 0")).toBeTruthy();
  });

  it("opens the source of a rule and of a frame, and links to GitHub", () => {
    const onOpen = vi.fn();
    render(<StructuredTraceView iterations={TRACE.iterations} target={TARGET} onOpen={onOpen} />);
    fireEvent.click(screen.getAllByRole("button", { name: "InstCombinerImpl::visitAdd" })[0]);
    expect(onOpen).toHaveBeenLastCalledWith({ scope: { iteration: 1, visit: 1 }, path: "lib/Transforms/InstCombine/InstCombineAddSub.cpp", line: 1556 });
    fireEvent.click(screen.getAllByText("InstructionSimplify.cpp:622")[0]);
    expect(onOpen).toHaveBeenLastCalledWith({ scope: { iteration: 1, visit: 1 }, path: "lib/Analysis/InstructionSimplify.cpp", line: 622 });
    const github = screen.getAllByTitle("open on GitHub")[0] as HTMLAnchorElement;
    expect(github.href).toBe("https://github.com/llvm/llvm-project/blob/abc123/llvm/lib/Analysis/InstructionSimplify.cpp#L622");
    fireEvent.click(screen.getAllByText("coverage")[0]);
    expect(onOpen).toHaveBeenLastCalledWith({ scope: { iteration: 1 }, path: null, line: null });
    fireEvent.click(screen.getAllByRole("button", { name: "visit 2" })[0]);
    expect(onOpen).toHaveBeenLastCalledWith({ scope: { iteration: 1, visit: 2 }, path: null, line: null });
  });

  it("jumps from a pointer to the value it names", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { container } = render(<StructuredTraceView iterations={TRACE.iterations} target={TARGET} onOpen={() => {}} />);
    const pointer = container.querySelector('.rep-new [data-ptr="0x10"]')!;
    fireEvent.click(pointer);
    expect(scrollIntoView).toHaveBeenCalled();
    expect(container.querySelector('[id="0x10"]')!.classList.contains("flash")).toBe(true);
  });
});
