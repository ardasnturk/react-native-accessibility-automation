import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  FileSearch,
  Globe2,
  Play,
  Radar,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";

const capabilities = [
  { icon: <Play size={18} />, label: "Browser controlled runs", text: "Start Appium, Expo, and simulator bootstrapping from the web UI." },
  { icon: <FileSearch size={18} />, label: "Evidence-first reports", text: "Review screenshots, XML, findings, runtime events, and crawler logs together." },
  { icon: <Radar size={18} />, label: "Bounded crawler", text: "Depth, duration, screen, tap-target, and deny-list limits reduce runaway sessions." },
  { icon: <Globe2 size={18} />, label: "EN/TR workspace", text: "Switch dashboard language without leaving the current workflow." },
];

export default function LandingPage() {
  return (
    <main className="marketing-page">
      <nav className="marketing-nav" aria-label="Primary">
        <Link className="brand-mark" href="/">
          <span className="brand-glyph"><ShieldCheck size={20} /></span>
          <span>Mobile A11y Crawler</span>
        </Link>
        <div className="marketing-nav-links">
          <a href="#workflow">Workflow</a>
          <a href="#reports">Reports</a>
          <ThemeToggle />
          <Link className="nav-cta" href="/dashboard">Open Dashboard</Link>
        </div>
      </nav>

      <section className="marketing-hero">
        <div className="hero-copy-block">
          <p className="eyebrow">Self-hosted accessibility automation for Expo and React Native</p>
          <h1>Run mobile accessibility crawls from a local control room.</h1>
          <p className="hero-copy">
            Configure the simulator, launch the crawler, recover from runtime interruptions, and inspect every screen with evidence-rich reports.
          </p>
          <div className="hero-actions">
            <Link className="primary-link" href="/dashboard">
              Open Dashboard <ArrowRight size={18} />
            </Link>
            <a className="secondary-link" href="https://www.w3.org/WAI/standards-guidelines/mobile/" target="_blank" rel="noreferrer">
              Mobile A11y Guidelines
            </a>
          </div>
          <div className="hero-proof">
            <span><CheckCircle2 size={16} /> Appium + WebdriverIO</span>
            <span><CheckCircle2 size={16} /> Local-first reports</span>
            <span><CheckCircle2 size={16} /> Expo Dev Client ready</span>
          </div>
        </div>

        <div className="product-preview" aria-label="Dashboard product preview">
          <div className="preview-sidebar">
            <span className="preview-logo" />
            <span />
            <span />
            <span />
          </div>
          <div className="preview-main">
            <div className="preview-command">
              <div>
                <small>Current run</small>
                <strong>iPhone 17 Pro · iOS 26.5</strong>
              </div>
              <span className="preview-live"><Clock3 size={14} /> Running</span>
            </div>
            <div className="preview-kpis">
              <div><strong>42</strong><span>screens</span></div>
              <div><strong>3</strong><span>errors</span></div>
              <div><strong>11</strong><span>warnings</span></div>
            </div>
            <div className="preview-report">
              <div className="preview-device">
                <span />
                <span />
                <span />
              </div>
              <div className="preview-findings">
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="capability-grid">
        {capabilities.map((capability) => (
          <article key={capability.label} className="capability-card">
            <span>{capability.icon}</span>
            <h2>{capability.label}</h2>
            <p>{capability.text}</p>
          </article>
        ))}
      </section>

      <section id="reports" className="report-strip">
        <div>
          <p className="eyebrow">Designed for repeated QA work</p>
          <h2>Historical reports, live logs, screenshots, XML, and findings stay in one local workspace.</h2>
        </div>
        <div className="report-strip-actions">
          <span><BarChart3 size={18} /> Summary metrics</span>
          <span><TerminalSquare size={18} /> Crawl logs</span>
          <span><FileSearch size={18} /> Evidence links</span>
        </div>
      </section>
    </main>
  );
}
