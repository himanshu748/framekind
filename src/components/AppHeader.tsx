import { useState } from "react";

const NAV_ITEMS = [
  { id: "workbench", label: "Workbench" },
  { id: "benchmarks", label: "Benchmarks" },
  { id: "method", label: "Method" },
] as const;

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 28 28" aria-hidden="true">
      <path d="M3 11V3h8M17 3h8v8M25 17v8h-8M11 25H3v-8" />
      <path d="M9 9h5v5" />
    </svg>
  );
}

export function AppHeader() {
  const [active, setActive] = useState("workbench");

  const navigate = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <header className="app-header">
      <button className="brand-button" type="button" onClick={() => navigate("workbench")}>
        <BrandMark />
        <span>FrameKind</span>
      </button>
      <nav aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => (
          <button
            className={active === item.id ? "nav-item is-active" : "nav-item"}
            type="button"
            key={item.id}
            onClick={() => navigate(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
