import Link from "next/link";

interface PageNavProps {
  current: "dashboard" | "teaching" | "graph";
}

function navClass(active: boolean): string {
  return `nav-link${active ? " nav-link-active" : ""}`;
}

export function PageNav({ current }: PageNavProps) {
  return (
    <nav className="page-nav" aria-label="Demo views">
      <Link href="/" className={navClass(current === "dashboard")}>
        Live Demo
      </Link>
      <Link href="/teaching" className={navClass(current === "teaching")}>
        Teaching View
      </Link>
      <Link href="/graph" className={navClass(current === "graph")}>
        Graph View
      </Link>
    </nav>
  );
}
