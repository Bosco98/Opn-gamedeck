import { createRoot } from "react-dom/client";
import { ConsoleApp } from "./ConsoleApp";
import "./styles.css";

// Deliberately no <StrictMode>: its double-invoked effects would open two
// network sessions (same reasoning as game-racing).
createRoot(document.getElementById("root")!).render(<ConsoleApp />);
