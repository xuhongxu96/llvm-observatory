// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../../src/web/components/ErrorBoundary.tsx";

afterEach(cleanup);

function Broken(): never {
  throw new Error("cannot place the badges");
}

it("shows a pane's error instead of unmounting the app", () => {
  vi.spyOn(console, "error").mockImplementation(() => {}); // React logs caught errors
  render(
    <div>
      <p>still here</p>
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>
    </div>,
  );
  expect(screen.getByText("still here")).toBeTruthy();
  expect(screen.getByText("this pane failed: cannot place the badges")).toBeTruthy();
});
