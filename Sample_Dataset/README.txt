OptiSched synthetic sample dataset
===================================
Files:
- classes.csv: 20 class/section records
- subjects.csv: sample subjects and default weekly requirements
- faculty.csv: faculty capacity limits
- faculty_subjects.csv: faculty qualification mapping
- rooms.csv: rooms, capacities, and room types
- requirements.csv: per-class subject, assigned faculty, sessions/week, and duration
- time_slots.csv: Monday-Friday, seven teaching periods/day, plus lunch-break records

Important notes:
- This is synthetic sample data for development and experiments, not real university data.
- Requirements are an illustrative starting dataset, not guaranteed to be globally feasible as-is.
- In requirements.csv, a lab row with sessions_per_week=1 and duration_periods=2 means one two-period block per week.
- The scheduler should enforce room capacity, faculty qualification, class/faculty/room non-overlap, and consecutive lab periods.
- For clean experiments, validate the dataset and adjust workloads/capacities before comparing CP-SAT, GA, and SA.
