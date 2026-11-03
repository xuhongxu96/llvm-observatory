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

const RESULT: RunResult = { status: 0, stderr: "", outputIr: "; final module", trace: TRACE };

afterEach(cleanup);

describe("OutputIrPanel", () => {
  it("shows the final IR by default and the IR after a chosen iteration", () => {
    render(<OutputIrPanel result={RESULT} />);
    const picker = screen.getByLabelText("IR after") as HTMLSelectElement;
    expect([...picker.options].map((o) => o.text)).toEqual([
      "final",
      "after iteration 1 (instcombine)",
      "after iteration 2 (instcombine)",
    ]);
    expect(screen.getByTestId("ir").textContent).toBe("; final module");

    fireEvent.change(picker, { target: { value: "1" } });
    expect(screen.getByTestId("ir").textContent).toContain("%b = shl i32 %x, 1");
  });

  it("goes back to the final IR on a new run", () => {
    const { rerender } = render(<OutputIrPanel result={RESULT} />);
    fireEvent.change(screen.getByLabelText("IR after"), { target: { value: "1" } });
    rerender(<OutputIrPanel result={{ ...RESULT, outputIr: "; next run" }} />);
    expect(screen.getByTestId("ir").textContent).toBe("; next run");
    expect((screen.getByLabelText("IR after") as HTMLSelectElement).value).toBe("final");
  });

  it("shows the driver's error, without a picker", () => {
    render(<OutputIrPanel result={{ ...RESULT, status: 1, stderr: "error: expected type" }} />);
    expect(screen.getByText("Driver error")).toBeTruthy();
    expect(screen.getByTestId("ir").textContent).toBe("error: expected type");
    expect((screen.getByLabelText("IR after") as HTMLSelectElement).disabled).toBe(true);
  });
});
