// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OutputIrPanel } from "../../src/web/components/OutputIrPanel.tsx";
import type { RunResult } from "../../src/web/worker/protocol.ts";
import { TRACE } from "../fixtures.ts";

// The editor itself is Monaco; show what it is given instead.
vi.mock("../../src/web/components/IrEditor.tsx", () => ({
  OutputIr: ({ ir, error }: { ir: string; error: string }) => <pre data-testid="ir">{error || ir}</pre>,
}));

const RESULT: RunResult = { status: 0, stderr: "", outputIr: "; final module", trace: TRACE, events: [] };
const picker = () => screen.getByLabelText("IR after") as HTMLSelectElement;
const shown = () => screen.getByTestId("ir").textContent;

afterEach(cleanup);

describe("OutputIrPanel", () => {
  it("lists the iterations and shows the last one by default", () => {
    render(<OutputIrPanel result={RESULT} />);
    expect([...picker().options].map((o) => o.text)).toEqual([
      "after iteration 1 (instcombine)",
      "after iteration 2 (instcombine): final",
    ]);
    expect(picker().value).toBe("2");
    expect(shown()).toBe(TRACE.iterations[1].irAfter);
  });

  it("shows the IR after a chosen iteration, until the next run", () => {
    const { rerender } = render(<OutputIrPanel result={RESULT} />);
    fireEvent.change(picker(), { target: { value: "1" } });
    expect(shown()).toContain("%b = shl i32 %x, 1");
    rerender(<OutputIrPanel result={{ ...RESULT }} />);
    expect(picker().value).toBe("2");
  });

  it("shows the driver's output when no iteration ran", () => {
    render(<OutputIrPanel result={{ ...RESULT, trace: { iterations: [] } }} />);
    expect(screen.queryByLabelText("IR after")).toBeNull();
    expect(shown()).toBe("; final module");
  });

  it("shows the driver's error, without a picker", () => {
    render(<OutputIrPanel result={{ ...RESULT, status: 1, stderr: "error: expected type" }} />);
    expect(screen.getByText("Driver error")).toBeTruthy();
    expect(shown()).toBe("error: expected type");
    expect(screen.queryByLabelText("IR after")).toBeNull();
  });
});
