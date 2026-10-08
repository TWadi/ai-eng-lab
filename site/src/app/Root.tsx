import { useState } from "react";
import { createRte } from "../bsw";
import { RteProvider } from "../rte/RteContext";
import { App } from "./App";

/** Composition root (the "ECU configuration"): wires the basic software into the RTE once. */
export function Root() {
  const [rte] = useState(createRte);
  return (
    <RteProvider rte={rte}>
      <App />
    </RteProvider>
  );
}
