"use client";

const SURFACE = {
  background:
    "linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012)), #0b0b0e",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 16px 40px -18px rgba(0,0,0,0.55)",
};

const SOLID_SURFACE = {
  background: "#0d0d10",
  border: "1px solid rgba(255,255,255,0.06)",
  boxShadow: "0 10px 30px -18px rgba(0,0,0,0.5)",
};

/**
 * Shared card surface for the dashboard. Handles the glass background,
 * hairline top accent, and the entrance fade/rise animation so individual
 * sections don't each reimplement the same inline styles.
 */
export default function GlassPanel({
  as: Tag = "div",
  children,
  className = "",
  mounted = true,
  delay = 0,
  accent = true,
  solid = false,
  padded = true,
  style,
  ...rest
}) {
  return (
    <Tag
      className={`relative overflow-hidden rounded-2xl transition-[opacity,transform] duration-700 ease-out will-change-transform ${
        padded ? "p-5 sm:p-6" : ""
      } ${
        mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      } ${className}`}
      style={{
        ...(solid ? SOLID_SURFACE : SURFACE),
        transitionDelay: mounted ? `${delay}ms` : "0ms",
        ...style,
      }}
      {...rest}
    >
      {accent && (
        <div
          className="pointer-events-none absolute inset-x-6 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(77,141,255,0.55), transparent)",
          }}
        />
      )}
      {children}
    </Tag>
  );
}