/**
 * Design tokens — sunlight-readable, big touch targets (PRD §15:
 * min 44dp, high contrast). Full design system lands with M2 UI work.
 */
export const colors = {
  bg: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  primary: "#166534",   // duka green
  primaryText: "#FFFFFF",
  danger: "#B91C1C",
  warning: "#B45309",
  surface: "#F3F4F6",
  border: "#D1D5DB",
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const touch = { minTarget: 48 } as const;

export const type_ = {
  title: { fontSize: 24, fontWeight: "700" as const },
  subtitle: { fontSize: 16, color: colors.muted },
  body: { fontSize: 16 },
  button: { fontSize: 18, fontWeight: "600" as const },
};
