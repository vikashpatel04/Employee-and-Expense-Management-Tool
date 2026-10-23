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
      [_ in never]: never
    }
    Functions: {
      create_shop: {
        Args: { owner_name: string; shop_name: string }
        Returns: string
      }
      my_permissions: { Args: { p_shop: string }; Returns: string[] }
      ping: { Args: never; Returns: string }
      shop_exists: { Args: never; Returns: boolean }
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
