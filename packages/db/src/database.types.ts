export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      advances: {
        Row: {
          amount_paise: number
          created_at: string
          created_by: string | null
          date: string
          id: string
          kind: string
          note: string | null
          over_limit_confirmed: boolean
          payment_mode: string | null
          shop_id: string
          staff_id: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          kind?: string
          note?: string | null
          over_limit_confirmed?: boolean
          payment_mode?: string | null
          shop_id: string
          staff_id: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          kind?: string
          note?: string | null
          over_limit_confirmed?: boolean
          payment_mode?: string | null
          shop_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "advances_shop_id_created_by_fkey"
            columns: ["shop_id", "created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "advances_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advances_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "advance_balances"
            referencedColumns: ["shop_id", "staff_id"]
          },
          {
            foreignKeyName: "advances_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["shop_id", "person_id"]
          },
        ]
      }
      allowances: {
        Row: {
          amount_paise: number
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          name: string
          prorated: boolean
          shop_id: string
          staff_id: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          name: string
          prorated?: boolean
          shop_id: string
          staff_id: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          name?: string
          prorated?: boolean
          shop_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "allowances_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allowances_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "advance_balances"
            referencedColumns: ["shop_id", "staff_id"]
          },
          {
            foreignKeyName: "allowances_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["shop_id", "person_id"]
          },
        ]
      }
      attendance: {
        Row: {
          check_in: string | null
          check_out: string | null
          date: string
          id: string
          marked_by: string | null
          note: string | null
          overtime_minutes: number
          shop_id: string
          source: string
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          date: string
          id?: string
          marked_by?: string | null
          note?: string | null
          overtime_minutes?: number
          shop_id: string
          source?: string
          staff_id: string
          status: string
          updated_at?: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          date?: string
          id?: string
          marked_by?: string | null
          note?: string | null
          overtime_minutes?: number
          shop_id?: string
          source?: string
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_shop_id_marked_by_fkey"
            columns: ["shop_id", "marked_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "attendance_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "advance_balances"
            referencedColumns: ["shop_id", "staff_id"]
          },
          {
            foreignKeyName: "attendance_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["shop_id", "person_id"]
          },
        ]
      }
      attendance_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          shop_id: string
          valid_from: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          shop_id: string
          valid_from?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          shop_id?: string
          valid_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_codes_shop_id_created_by_fkey"
            columns: ["shop_id", "created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "attendance_codes_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_scans: {
        Row: {
          at: string
          device_id: string | null
          id: number
          kind: string | null
          method: string
          result: string
          shop_id: string
          staff_id: string
        }
        Insert: {
          at?: string
          device_id?: string | null
          id?: never
          kind?: string | null
          method: string
          result: string
          shop_id: string
          staff_id: string
        }
        Update: {
          at?: string
          device_id?: string | null
          id?: never
          kind?: string | null
          method?: string
          result?: string
          shop_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_scans_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_scans_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "advance_balances"
            referencedColumns: ["shop_id", "staff_id"]
          },
          {
            foreignKeyName: "attendance_scans_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["shop_id", "person_id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          at: string
          before: Json | null
          id: number
          row_id: string | null
          shop_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          id?: never
          row_id?: string | null
          shop_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          id?: never
          row_id?: string | null
          shop_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          archived: boolean
          colour: string
          created_at: string
          icon: string
          id: string
          name: string
          shop_id: string
        }
        Insert: {
          archived?: boolean
          colour?: string
          created_at?: string
          icon?: string
          id?: string
          name: string
          shop_id: string
        }
        Update: {
          archived?: boolean
          colour?: string
          created_at?: string
          icon?: string
          id?: string
          name?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_paise: number
          bill_path: string | null
          category_id: string
          charged_to_kind: string
          charged_to_staff_id: string | null
          created_at: string
          created_by: string | null
          date: string
          id: string
          note: string | null
          paid_by_kind: string
          paid_by_staff_id: string | null
          payment_mode: string
          reimburse: boolean
          shop_id: string
          updated_at: string
        }
        Insert: {
          amount_paise: number
          bill_path?: string | null
          category_id: string
          charged_to_kind?: string
          charged_to_staff_id?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          note?: string | null
          paid_by_kind?: string
          paid_by_staff_id?: string | null
          payment_mode?: string
          reimburse?: boolean
          shop_id: string
          updated_at?: string
        }
        Update: {
          amount_paise?: number
          bill_path?: string | null
          category_id?: string
          charged_to_kind?: string
          charged_to_staff_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          note?: string | null
          paid_by_kind?: string
          paid_by_staff_id?: string | null
          payment_mode?: string
          reimburse?: boolean
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_shop_id_category_id_fkey"
            columns: ["shop_id", "category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "expenses_shop_id_charged_to_staff_id_fkey"
            columns: ["shop_id", "charged_to_staff_id"]
            isOneToOne: false
            referencedRelation: "advance_balances"
            referencedColumns: ["shop_id", "staff_id"]
          },
          {
            foreignKeyName: "expenses_shop_id_charged_to_staff_id_fkey"
            columns: ["shop_id", "charged_to_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["shop_id", "person_id"]
          },
          {
            foreignKeyName: "expenses_shop_id_created_by_fkey"
            columns: ["shop_id", "created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "expenses_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_shop_id_paid_by_staff_id_fkey"
            columns: ["shop_id", "paid_by_staff_id"]
            isOneToOne: false
            referencedRelation: "advance_balances"
            referencedColumns: ["shop_id", "staff_id"]
          },
          {
            foreignKeyName: "expenses_shop_id_paid_by_staff_id_fkey"
            columns: ["shop_id", "paid_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["shop_id", "person_id"]
          },
        ]
      }
      fixed_deductions: {
        Row: {
          amount_paise: number
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          name: string
          shop_id: string
          staff_id: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          name: string
          shop_id: string
          staff_id: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          name?: string
          shop_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_deductions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_deductions_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "advance_balances"
            referencedColumns: ["shop_id", "staff_id"]
          },
          {
            foreignKeyName: "fixed_deductions_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["shop_id", "person_id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          date: string
          id: string
          name: string
          paid: boolean
          shop_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          name: string
          paid?: boolean
          shop_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          name?: string
          paid?: boolean
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holidays_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          carried: number
          earned: number
          lapsed: number
          month: number
          opening: number
          paid_out: number
          shop_id: string
          staff_id: string
          updated_at: string
          used: number
          year: number
        }
        Insert: {
          carried?: number
          earned?: number
          lapsed?: number
          month: number
          opening?: number
          paid_out?: number
          shop_id: string
          staff_id: string
          updated_at?: string
          used?: number
          year: number
        }
        Update: {
          carried?: number
          earned?: number
          lapsed?: number
          month?: number
          opening?: number
          paid_out?: number
          shop_id?: string
          staff_id?: string
          updated_at?: string
          used?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "advance_balances"
            referencedColumns: ["shop_id", "staff_id"]
          },
          {
            foreignKeyName: "leave_balances_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["shop_id", "person_id"]
          },
        ]
      }
      leave_template_versions: {
        Row: {
          accrual: Json
          carry_over: Json
          created_at: string
          effective_from: string
          id: string
          paid_leaves_per_month: number
          sandwich: Json
          shop_id: string
          template_id: string
          weekly_offs: Json
        }
        Insert: {
          accrual?: Json
          carry_over?: Json
          created_at?: string
          effective_from: string
          id?: string
          paid_leaves_per_month?: number
          sandwich?: Json
          shop_id: string
          template_id: string
          weekly_offs?: Json
        }
        Update: {
          accrual?: Json
          carry_over?: Json
          created_at?: string
          effective_from?: string
          id?: string
          paid_leaves_per_month?: number
          sandwich?: Json
          shop_id?: string
          template_id?: string
          weekly_offs?: Json
        }
        Relationships: [
          {
            foreignKeyName: "leave_template_versions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_template_versions_shop_id_template_id_fkey"
            columns: ["shop_id", "template_id"]
            isOneToOne: false
            referencedRelation: "leave_templates"
            referencedColumns: ["shop_id", "id"]
          },
        ]
      }
      leave_templates: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          name: string
          shop_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          name: string
          shop_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          name?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_templates_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          adjusts: string | null
          amount_paise: number
          created_at: string
          created_by: string | null
          date: string
          id: string
          name: string | null
          note: string | null
          payment_mode: string | null
          ref_id: string | null
          ref_table: string | null
          reverses_id: string | null
          shop_id: string
          staff_id: string
          type: string
        }
        Insert: {
          adjusts?: string | null
          amount_paise: number
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          name?: string | null
          note?: string | null
          payment_mode?: string | null
          ref_id?: string | null
          ref_table?: string | null
          reverses_id?: string | null
          shop_id: string
          staff_id: string
          type: string
        }
        Update: {
          adjusts?: string | null
          amount_paise?: number
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          name?: string | null
          note?: string | null
          payment_mode?: string | null
          ref_id?: string | null
          ref_table?: string | null
          reverses_id?: string | null
          shop_id?: string
          staff_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_shop_id_created_by_fkey"
            columns: ["shop_id", "created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "ledger_entries_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "advance_balances"
            referencedColumns: ["shop_id", "staff_id"]
          },
          {
            foreignKeyName: "ledger_entries_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["shop_id", "person_id"]
          },
        ]
      }
      pay_settings: {
        Row: {
          created_at: string
          daily_wage_paise: number | null
          day_minutes: number | null
          effective_from: string
          grace_minutes: number
          hourly_rate_paise: number | null
          id: string
          late_policy_override: Json
          monthly_salary_paise: number | null
          overtime_rate_paise: number | null
          pay_rules_override: Json
          pay_type: string
          shift_end: number | null
          shift_start: number | null
          shop_id: string
          staff_id: string
        }
        Insert: {
          created_at?: string
          daily_wage_paise?: number | null
          day_minutes?: number | null
          effective_from: string
          grace_minutes?: number
          hourly_rate_paise?: number | null
          id?: string
          late_policy_override?: Json
          monthly_salary_paise?: number | null
          overtime_rate_paise?: number | null
          pay_rules_override?: Json
          pay_type: string
          shift_end?: number | null
          shift_start?: number | null
          shop_id: string
          staff_id: string
        }
        Update: {
          created_at?: string
          daily_wage_paise?: number | null
          day_minutes?: number | null
          effective_from?: string
          grace_minutes?: number
          hourly_rate_paise?: number | null
          id?: string
          late_policy_override?: Json
          monthly_salary_paise?: number | null
          overtime_rate_paise?: number | null
          pay_rules_override?: Json
          pay_type?: string
          shift_end?: number | null
          shift_start?: number | null
          shop_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pay_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_settings_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "advance_balances"
            referencedColumns: ["shop_id", "staff_id"]
          },
          {
            foreignKeyName: "pay_settings_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["shop_id", "person_id"]
          },
        ]
      }
      payslips: {
        Row: {
          advance_cut_paise: number
          created_at: string
          deductions_paise: number
          finalized_at: string | null
          finalized_by: string | null
          gross_paise: number
          id: string
          leave: Json | null
          lines: Json
          net_before_advance_paise: number
          net_pay_paise: number
          pdf_path: string | null
          revision: number
          run_id: string
          shop_id: string
          staff_id: string
          status: string
          summary: Json
          warnings: Json
        }
        Insert: {
          advance_cut_paise?: number
          created_at?: string
          deductions_paise?: number
          finalized_at?: string | null
          finalized_by?: string | null
          gross_paise?: number
          id?: string
          leave?: Json | null
          lines?: Json
          net_before_advance_paise?: number
          net_pay_paise?: number
          pdf_path?: string | null
          revision?: number
          run_id: string
          shop_id: string
          staff_id: string
          status?: string
          summary?: Json
          warnings?: Json
        }
        Update: {
          advance_cut_paise?: number
          created_at?: string
          deductions_paise?: number
          finalized_at?: string | null
          finalized_by?: string | null
          gross_paise?: number
          id?: string
          leave?: Json | null
          lines?: Json
          net_before_advance_paise?: number
          net_pay_paise?: number
          pdf_path?: string | null
          revision?: number
          run_id?: string
          shop_id?: string
          staff_id?: string
          status?: string
          summary?: Json
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "payslips_shop_id_finalized_by_fkey"
            columns: ["shop_id", "finalized_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "payslips_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_shop_id_run_id_fkey"
            columns: ["shop_id", "run_id"]
            isOneToOne: false
            referencedRelation: "salary_runs"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "payslips_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "advance_balances"
            referencedColumns: ["shop_id", "staff_id"]
          },
          {
            foreignKeyName: "payslips_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["shop_id", "person_id"]
          },
        ]
      }
      people: {
        Row: {
          auth_user_id: string | null
          created_at: string
          id: string
          is_owner: boolean
          login_email: string | null
          name: string
          phone: string | null
          photo_path: string | null
          shop_id: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          id?: string
          is_owner?: boolean
          login_email?: string | null
          name: string
          phone?: string | null
          photo_path?: string | null
          shop_id: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          id?: string
          is_owner?: boolean
          login_email?: string | null
          name?: string
          phone?: string | null
          photo_path?: string | null
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          area: string
          description: string
          key: string
        }
        Insert: {
          area: string
          description: string
          key: string
        }
        Update: {
          area?: string
          description?: string
          key?: string
        }
        Relationships: []
      }
      person_roles: {
        Row: {
          person_id: string
          role_id: string
          shop_id: string
        }
        Insert: {
          person_id: string
          role_id: string
          shop_id: string
        }
        Update: {
          person_id?: string
          role_id?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_roles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_roles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_credentials: {
        Row: {
          failed_attempts: number
          locked: boolean
          person_id: string
          pin_hash: string
          shop_id: string
          updated_at: string
          wait_until: string | null
        }
        Insert: {
          failed_attempts?: number
          locked?: boolean
          person_id: string
          pin_hash: string
          shop_id: string
          updated_at?: string
          wait_until?: string | null
        }
        Update: {
          failed_attempts?: number
          locked?: boolean
          person_id?: string
          pin_hash?: string
          shop_id?: string
          updated_at?: string
          wait_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pin_credentials_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pin_credentials_shop_id_person_id_fkey"
            columns: ["shop_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["shop_id", "id"]
          },
        ]
      }
      requests: {
        Row: {
          advance_id: string | null
          amount_paise: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          from_date: string | null
          id: string
          kind: string
          leave_status: string | null
          note: string | null
          shop_id: string
          staff_id: string
          status: string
          to_date: string | null
        }
        Insert: {
          advance_id?: string | null
          amount_paise?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          from_date?: string | null
          id?: string
          kind: string
          leave_status?: string | null
          note?: string | null
          shop_id: string
          staff_id: string
          status?: string
          to_date?: string | null
        }
        Update: {
          advance_id?: string | null
          amount_paise?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          from_date?: string | null
          id?: string
          kind?: string
          leave_status?: string | null
          note?: string | null
          shop_id?: string
          staff_id?: string
          status?: string
          to_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requests_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "advances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_shop_id_decided_by_fkey"
            columns: ["shop_id", "decided_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "requests_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "advance_balances"
            referencedColumns: ["shop_id", "staff_id"]
          },
          {
            foreignKeyName: "requests_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["shop_id", "person_id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_key: string
          role_id: string
          shop_id: string
        }
        Insert: {
          permission_key: string
          role_id: string
          shop_id: string
        }
        Update: {
          permission_key?: string
          role_id?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          id: string
          name: string
          shop_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          shop_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_runs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          month: number
          shop_id: string
          year: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          month: number
          shop_id: string
          year: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          month?: number
          shop_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "salary_runs_shop_id_created_by_fkey"
            columns: ["shop_id", "created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "salary_runs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          created_at: string
          id: string
          name: string
          settings: Json
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          settings?: Json
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          settings?: Json
        }
        Relationships: []
      }
      staff: {
        Row: {
          advance_cut_paise: number | null
          advance_limit_paise: number | null
          created_at: string
          device_id: string | null
          joining_date: string
          leaving_date: string | null
          person_id: string
          self_attendance: boolean
          shop_id: string
          status: string
        }
        Insert: {
          advance_cut_paise?: number | null
          advance_limit_paise?: number | null
          created_at?: string
          device_id?: string | null
          joining_date: string
          leaving_date?: string | null
          person_id: string
          self_attendance?: boolean
          shop_id: string
          status?: string
        }
        Update: {
          advance_cut_paise?: number | null
          advance_limit_paise?: number | null
          created_at?: string
          device_id?: string | null
          joining_date?: string
          leaving_date?: string | null
          person_id?: string
          self_attendance?: boolean
          shop_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shop_id_person_id_fkey"
            columns: ["shop_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["shop_id", "id"]
          },
        ]
      }
      staff_documents: {
        Row: {
          created_at: string
          file_path: string
          id: string
          mime_type: string
          name: string
          shop_id: string
          size_bytes: number
          staff_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          mime_type: string
          name: string
          shop_id: string
          size_bytes: number
          staff_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          mime_type?: string
          name?: string
          shop_id?: string
          size_bytes?: number
          staff_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_documents_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_documents_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "advance_balances"
            referencedColumns: ["shop_id", "staff_id"]
          },
          {
            foreignKeyName: "staff_documents_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["shop_id", "person_id"]
          },
          {
            foreignKeyName: "staff_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_leave_templates: {
        Row: {
          created_at: string
          effective_from: string
          id: string
          shop_id: string
          staff_id: string
          template_id: string
        }
        Insert: {
          created_at?: string
          effective_from: string
          id?: string
          shop_id: string
          staff_id: string
          template_id: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          id?: string
          shop_id?: string
          staff_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_leave_templates_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_leave_templates_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "advance_balances"
            referencedColumns: ["shop_id", "staff_id"]
          },
          {
            foreignKeyName: "staff_leave_templates_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["shop_id", "person_id"]
          },
          {
            foreignKeyName: "staff_leave_templates_shop_id_template_id_fkey"
            columns: ["shop_id", "template_id"]
            isOneToOne: false
            referencedRelation: "leave_templates"
            referencedColumns: ["shop_id", "id"]
          },
        ]
      }
    }
    Views: {
      advance_balances: {
        Row: {
          advance_cut_paise: number | null
          advance_limit_paise: number | null
          outstanding_paise: number | null
          shop_id: string | null
          staff_id: string | null
        }
        Insert: {
          advance_cut_paise?: number | null
          advance_limit_paise?: number | null
          outstanding_paise?: never
          shop_id?: string | null
          staff_id?: string | null
        }
        Update: {
          advance_cut_paise?: number | null
          advance_limit_paise?: number | null
          outstanding_paise?: never
          shop_id?: string | null
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shop_id_person_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["shop_id", "id"]
          },
        ]
      }
      ledger_balances: {
        Row: {
          balance_paise: number | null
          shop_id: string | null
          staff_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "advance_balances"
            referencedColumns: ["shop_id", "staff_id"]
          },
          {
            foreignKeyName: "ledger_entries_shop_id_staff_id_fkey"
            columns: ["shop_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["shop_id", "person_id"]
          },
        ]
      }
    }
    Functions: {
      add_staff: {
        Args: {
          p_joining_date: string
          p_name: string
          p_phone: string
          p_shop: string
        }
        Returns: string
      }
      attendance_code: { Args: { p_shop: string }; Returns: Json }
      auth_user_by_email: { Args: { p_email: string }; Returns: string }
      change_pin: {
        Args: {
          p_current: string
          p_device: string
          p_new: string
          p_person: string
        }
        Returns: Json
      }
      check_in: {
        Args: {
          p_code: string
          p_device: string
          p_method: string
          p_shop: string
        }
        Returns: Json
      }
      create_shop: {
        Args: { owner_name: string; shop_name: string }
        Returns: string
      }
      finalize_payslip: { Args: { p_payslip: string }; Returns: undefined }
      helper_login_link: {
        Args: { p_email: string; p_person: string; p_user: string }
        Returns: undefined
      }
      helper_login_target: { Args: { p_person: string }; Returns: Json }
      my_permissions: { Args: { p_shop: string }; Returns: string[] }
      phone_lookup: { Args: { p_phone: string }; Returns: Json }
      pin_login: {
        Args: { p_device: string; p_person: string; p_pin: string }
        Returns: Json
      }
      pin_setup: {
        Args: {
          p_auth_user: string
          p_device: string
          p_phone: string
          p_pin: string
        }
        Returns: Json
      }
      ping: { Args: never; Returns: string }
      regenerate_attendance_code: { Args: { p_shop: string }; Returns: Json }
      reset_pin: { Args: { p_person: string }; Returns: undefined }
      reset_staff_phone: { Args: { p_person: string }; Returns: undefined }
      shop_exists: { Args: never; Returns: boolean }
      staff_logins: {
        Args: { p_shop: string }
        Returns: {
          has_pin: boolean
          locked: boolean
          person_id: string
          phone_bound: boolean
          wait_until: string
        }[]
      }
      unlock_login: { Args: { p_person: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
