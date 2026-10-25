/**
 * Shared data loading for FinCrew: Supabase rows → packages/core rules → what screens show.
 * Used by the website (server components and actions) and the Android app, so both work out
 * attendance, salary, expenses and reports the same way. RLS decides what each person gets.
 */
export * from './client';
export * from './mappers';
export * from './paid-leave';
export * from './session';
export * from './staff';
export * from './attendance-month';
export * from './attendance-write';
export * from './dashboard';
export * from './expenses';
export * from './leave-setup';
export * from './reports';
export * from './roles';
export * from './salary-month';
export * from './expense-write';
export * from './salary-run';
export * from './advances';
export * from './self-service';
export * from './payslip-text';
