# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **University Administrators** (Academic Schedulers, Deans, Department Chairs): Need to manage departments, class sections, faculty teaching qualifications, room capacities, and timetable constraints. They execute solver runs, audit constraint reports, and distribute approved timetables.
- **Faculty Members**: Need immediate access to their personal weekly teaching schedule, room assignments, workload distribution, and student section details without administrative cognitive load.
- **Students**: Need clean, responsive, and legible section timetables showing daily class sequences, subjects, instructors, room numbers, and breaks.

## Product Purpose
OptiSched automates university timetable generation using Google OR-Tools constraint satisfaction (CP-SAT). It eliminates scheduling conflicts, double-booked rooms, and faculty overlaps, turning weeks of manual scheduling into an instantaneous, auditable, and reliable process.

## Positioning
OptiSched is not a generic calendar or decorative project management tool. It is an industrial-strength academic operations platform that guarantees mathematical feasibility, faculty subject eligibility, and room capacity enforcement with clear constraint validation.

## Operating Context
- Academic administration offices, faculty desks, and student mobile devices across campus.
- Dense schedule inspection on high-resolution desktop monitors as well as quick mobile schedule lookups between classes.
- High demands on scanability, typographic precision, and reliable data export.

## Capabilities and Constraints
- **Constraint Solver**: Real-time OR-Tools CP-SAT engine delivering optimal or feasible conflict-free assignments.
- **Resource Management**: Comprehensive CRUD for class sections, faculty profiles, subjects, rooms, and course offerings with weekly period allocations.
- **Semester Configuration**: Customizable daily timing grids, period lengths, transition durations, and lunch/tea breaks per semester.
- **Role-Based Access**: Clerk-authenticated portal views tailored for Admin, Faculty, and Student roles with strict fail-closed authorization.
- **Export & Distribution**: Reliable CSV schedule export and published schedule distribution.

## Brand Commitments
- **Name**: OptiSched
- **Voice**: Measured, authoritative, institutional, clear, and reassuring.
- **Visual Stance**: Academic and editorial rigor; typography-driven hierarchy; functional tabular data display; restrained, purposeful accents.

## Evidence on Hand
- Functional FastAPI backend with SQLAlchemy models, relational schema, and OR-Tools optimization engine.
- Complete Clerk authentication infrastructure and verified role mapping.
- Working admin, faculty, and student client interfaces with API integration.

## Product Principles
1. **Mathematical Truth Over Decoration**: Never fabricate progress, statistics, or schedule slots. Reflect the real solver outcome and validation report.
2. **Scannable Density**: Academic timetables are dense by nature. Deliver maximum legibility through refined type scale, proportional column rhythm, and tabular numerals.
3. **Role Clarity**: Streamline workflows according to user responsibility—comprehensive configuration for Admins, instant schedule retrieval for Faculty and Students.
4. **Resilient Feedback**: Provide clear, accessible state transitions, informative empty states, and explicit validation diagnostics.

## Accessibility & Inclusion
- Target: WCAG 2.1 AA compliance across all workflows.
- Minimum contrast ratio >= 4.5:1 for body and data text, >= 3:1 for large display elements.
- Meaningful non-color cues (badges, icons, typography) alongside color indicators for session types (Lectures, Labs) and validation alerts.
- Fully accessible keyboard navigation, tab orders, and distinct focus rings.
