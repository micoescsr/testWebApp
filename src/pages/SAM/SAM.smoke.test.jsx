import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { NetworkProvider } from "../../context/NetworkContext";
import { ToastProvider } from "../../context/ToastContext";
import { ThreatDetectionProvider } from "../../context/ThreatDetectionContext";
import SAM from "./SAM";

// Render SAM once with initial state to surface any render-time throw.
describe("SAM smoke render", () => {
  it("renders without throwing", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ToastProvider>
          <NetworkProvider>
            <ThreatDetectionProvider>
              <SAM />
            </ThreatDetectionProvider>
          </NetworkProvider>
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(typeof html).toBe("string");
  });
});
