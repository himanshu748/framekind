import "@fontsource-variable/inter";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("FrameKind could not find its root element.");
}

createRoot(root).render(<App />);
