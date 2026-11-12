---
name: OptiSched
description: Sophisticated academic operations, constraint management, and timetable optimization platform
colors:
  primary: "#1e293b"
  primary-deep: "#0f172a"
  primary-hover: "#334155"
  accent-indigo: "#3b5998"
  accent-teal: "#0d9488"
  accent-amber: "#d97706"
  accent-emerald: "#059669"
  neutral-bg: "#f8fafc"
  neutral-surface: "#ffffff"
  neutral-surface-subtle: "#f1f5f9"
  neutral-border: "#e2e8f0"
  neutral-border-strong: "#cbd5e1"
  text-primary: "#0f172a"
  text-secondary: "#475569"
  text-muted: "#64748b"
  lecture-bg: "#f0f4ff"
  lecture-border: "#c7d7fe"
  lecture-text: "#1e3a8a"
  lab-bg: "#f0fdf4"
  lab-border: "#bbf7d0"
  lab-text: "#14532d"
  break-bg: "#fefce8"
  break-border: "#fef08a"
  break-text: "#713f12"
typography:
  display:
    fontFamily: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.015em"
  body:
    fontFamily: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  label:
    fontFamily: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.05em"
  caption:
    fontFamily: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.02em"
  micro:
    fontFamily: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.04em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
  xl: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-surface}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
  button-secondary:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
---

# Design System: OptiSched

## Overview

**Creative North Star: "The Academic Registry"**

OptiSched embodies the understated authority, structural rigor, and functional elegance of an esteemed university registrar. Rather than treating timetable planning as a playground for generic SaaS cards or flashy gradients, OptiSched is built as a precision operational instrument for academic scheduling officers, professors, and students.

The interface prioritizes maximum tabular legibility, calm surfaces, crisp typography, and unambiguous operational state signaling. Information hierarchy is established through thoughtful type scale, proportional white space, and deliberate contrasts between dense data cells and clean navigational frames. 

**Key Characteristics:**
- **Authoritative & Calm**: Deep slate tones, warm off-white canvas backgrounds, and balanced borders that eliminate visual fatigue.
- **Data-First Readability**: High-density timetable grids styled for instant horizontal and vertical scanning, equipped with tabular figures and clear period demarcation.
- **Purposeful Color System**: Color is reserved strictly for operational communication—never decoration. Distinct hues identify session typologies (Lecture vs. Lab vs. Break) and solver validation outcomes.
- **Refined Restraint**: No purple gradients, no fuzzy glassmorphism, no nested card bloat, and no decorative placeholder charts. Every element serves an operational purpose.

## Colors

The palette is rooted in timeless architectural and academic neutrals, paired with functional accents for constraint verification and schedule categorization.

- **Foundational Surfaces**:
  - Canvas Background: `{colors.neutral-bg}` (`#f8fafc`) - Provides a warm, low-glare backdrop.
  - Surface Panel: `{colors.neutral-surface}` (`#ffffff`) - High-contrast container for active data grids and forms.
  - Subtle Insets: `{colors.neutral-surface-subtle}` (`#f1f5f9`) - Header bars, table headers, and inactive states.
  - Structural Borders: `{colors.neutral-border}` (`#e2e8f0`) and `{colors.neutral-border-strong}` (`#cbd5e1`).
- **Typography & Ink**:
  - Ink Primary: `{colors.text-primary}` (`#0f172a`) - Maximum contrast for critical headings, course codes, and active metrics.
  - Ink Secondary: `{colors.text-secondary}` (`#475569`) - Body text, table contents, and secondary labels.
  - Ink Muted: `{colors.text-muted}` (`#64748b`) - Captions, timestamps, and metadata.
- **Domain Accents (Session Typologies)**:
  - Lecture: `{colors.lecture-bg}` (`#f0f4ff`) with border `{colors.lecture-border}` (`#c7d7fe`) and ink `{colors.lecture-text}` (`#1e3a8a`).
  - Laboratory: `{colors.lab-bg}` (`#f0fdf4`) with border `{colors.lab-border}` (`#bbf7d0`) and ink `{colors.lab-text}` (`#14532d`).
  - Break / Lunch: `{colors.break-bg}` (`#fefce8`) with border `{colors.break-border}` (`#fef08a`) and ink `{colors.break-text}` (`#713f12`).
- **Operational Statuses**:
  - Verified / Optimal: `{colors.accent-emerald}` (`#059669`).
  - Warning / Infeasibility / Conflict: `{colors.accent-amber}` (`#d97706`).
  - Destructive / Error: `#dc2626`.

## Typography

Typographic hierarchy is clean, structured, and legible at small sizes:
- **Display & Headings**: Clean, disciplined sans-serif with tight tracking (`-0.02em` to `-0.025em`) conveying institutional precision.
- **Body & Controls**: Inter/Geist standard scale with regular line height (`1.5`) ensuring comfortable scanning across complex tables.
- **Data & Numeric Labels**: Monospace with tabular numerals (`tabular-nums`) for period timestamps, room numbers, course codes, and solver statistics.

## Layout

- **Unified Application Shell**: Fixed-width, collapsible sidebar on desktop (`260px`), transitioning to a responsive overlay drawer on mobile and tablet breakpoints.
- **Top Utility Header**: Streamlined single-row header containing contextual breadcrumbs, primary portal actions, solver status indicator, and Clerk user authentication.
- **Fluid Data Canvas**: Maximum container width of `1600px` with responsive padding (`px-4 sm:px-6 lg:px-8`) preventing table clipping.
- **Timetable Matrix**: Horizontally scrollable container with sticky period headers and day columns, guaranteeing immediate orientation regardless of viewport size.

## Elevation & Depth

- Elevation is communicated through single 1px borders and tonal contrast rather than exaggerated drop shadows.
- Cards and panels use a crisp `border border-slate-200/80` with a minimal ambient shadow (`shadow-xs` or `shadow-sm`) only where separation is functional.
- Modals and contextual popovers utilize an opaque backdrop (`bg-slate-900/40`) with clean elevation (`shadow-md`).

## Shapes

- Outer containers and primary application cards: `{rounded.lg}` (`10px`).
- Form controls, table cells, and buttons: `{rounded.md}` (`6px`).
- Status chips, session badges, and tags: `{rounded.sm}` (`4px`) with uppercase or semi-bold micro-copy.
- Fully rounded pills are reserved exclusively for avatar containers and compact count indicators.

## Components

- **Timetable Grid**:
  - Fixed-width period index column with clear start/end timestamps.
  - Day columns with consistent widths, crisp column dividers, and distinct cell states.
  - Session items render course code, course title, faculty name, room badge, and session occurrence with non-color icons.
  - Empty slots display a muted dashed border and subtle hover state indicating availability.
- **Primary Buttons**:
  - Solid deep slate background, white text, subtle hover darkening, accessible focus ring.
- **Secondary / Outline Buttons**:
  - White background, 1px slate border, dark slate text, subtle background hover.
- **Status Banners & Toasts**:
  - Solid or tinted borders with unambiguous icon indicators (`CheckCircle2`, `AlertTriangle`, `ShieldAlert`) and recovery instructions.
- **Form Controls**:
  - Clean borders (`border-slate-300`), white background, precise focus states (`ring-2 ring-slate-900/10 border-slate-900`), and clear helper text.

## Do's and Don'ts

### Do:
- Use tabular numerals (`tabular-nums`) for all times, period numbers, and metrics.
- Keep background surfaces flat and warm; use 1px borders to define regions.
- Ensure every button performs an authentic action and displays feedback.
- Provide accessible labels, ARIA landmarks, and keyboard focus states.
- Accompany every colored status tag with an explicit text label or icon.

### Don't:
- Never use multi-stop purple or blue gradient text or backgrounds.
- Never use glassmorphism or blurry frosted backgrounds over dense schedules.
- Never stack cards inside cards; use dividers and clean grid cells instead.
- Never use emoji icons in place of consistent Lucide vector icons.
- Never invent fake solver progress bars or artificial animation delays.
