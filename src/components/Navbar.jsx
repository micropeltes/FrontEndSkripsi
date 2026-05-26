import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  ActivityHeartIcon,
  Menu01Icon,
  Moon01Icon,
  SunIcon,
  XCloseIcon,
  ZapIcon
} from "@untitledui/icons-react/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const EXTRA_LINKS = [
  { to: "/monitoring", label: "Latest" },
  { to: "/history", label: "History" },
  { to: "/tools/convert", label: "Convert ADC" },
  { to: "/calibration", label: "Calibration" }
];

export default function Navbar({
  theme,
  onToggleTheme,
  activeSection,
  scrollProgress = 0,
  healthStatus = "checking",
  healthMessage = "",
  onNavigateLanding,
  onNavigateDashboard
}) {
  const [open, setOpen] = useState(false);
  const useScrollNav = Boolean(onNavigateLanding && onNavigateDashboard);
  const safeProgress = useScrollNav ? Math.min(Math.max(scrollProgress, 0), 1) : 0;
  const progressMode = activeSection === "dashboard" ? "dashboard" : "landing";

  const backendLabel = healthStatus === "online" ? "Backend Online" : healthStatus === "offline" ? "Cek Backend" : "Cek Backend";

  function closeMenuAnd(action) {
    setOpen(false);
    action?.();
  }

  return (
    <header className="navbar">
      <div className="nav-inner">
        {useScrollNav ? (
          <button type="button" className="brand brand-btn" onClick={() => closeMenuAnd(onNavigateLanding)}>
            <ZapIcon className="brand-icon" />
            <Badge variant="secondary" className="uppercase tracking-wide">
              Garbage Odor Detection
            </Badge>
            <span
              className={`backend-indicator ${healthStatus}`}
              title={healthMessage || backendLabel}
              aria-live="polite"
            >
              <ActivityHeartIcon className="ui-icon" />
              <span>{backendLabel}</span>
            </span>
          </button>
        ) : (
          <NavLink to="/" className="brand" onClick={() => setOpen(false)}>
            <ZapIcon className="brand-icon" />
            <Badge variant="secondary" className="uppercase tracking-wide">
              Garbage Odor Detection
            </Badge>
            <span
              className={`backend-indicator ${healthStatus}`}
              title={healthMessage || backendLabel}
              aria-live="polite"
            >
              <ActivityHeartIcon className="ui-icon" />
              <span>{backendLabel}</span>
            </span>
          </NavLink>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="menu-btn"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-label="Toggle navigation"
        >
          {open ? <XCloseIcon className="ui-icon" /> : <Menu01Icon className="ui-icon" />}
          <span>Menu</span>
        </Button>

        <nav className={`nav-links ${open ? "open" : ""}`}>
          {useScrollNav ? (
            <>
              <button
                type="button"
                className={`nav-link ${activeSection === "landing" ? "active" : ""}`}
                onClick={() => closeMenuAnd(onNavigateLanding)}
              >
                Landing
              </button>
              <button
                type="button"
                className={`nav-link ${activeSection === "dashboard" ? "active" : ""}`}
                onClick={() => closeMenuAnd(onNavigateDashboard)}
              >
                Dashboard
              </button>
              {EXTRA_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
                >
                  {link.label}
                </NavLink>
              ))}
            </>
          ) : (
            <>
              <NavLink
                to="/"
                end
                onClick={() => setOpen(false)}
                className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              >
                Landing
              </NavLink>
              <NavLink
                to="/dashboard"
                onClick={() => setOpen(false)}
                className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              >
                Dashboard
              </NavLink>
              {EXTRA_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
                >
                  {link.label}
                </NavLink>
              ))}
            </>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="theme-btn"
            onClick={() => {
              setOpen(false);
              onToggleTheme();
            }}
          >
            {theme === "dark" ? <SunIcon className="ui-icon" /> : <Moon01Icon className="ui-icon" />}
            <span>{theme === "dark" ? "Light" : "Dark"}</span>
          </Button>
        </nav>
      </div>
      <div className="nav-progress-track" aria-hidden>
        <span
          className={`nav-progress-fill ${progressMode}`}
          style={{ transform: `scaleX(${safeProgress})` }}
        />
      </div>
    </header>
  );
}
