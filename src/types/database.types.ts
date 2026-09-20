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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_profiles: {
        Row: {
          created_at: string
          is_active: boolean
          role: Database["public"]["Enums"]["admin_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["admin_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["admin_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          metadata: Json
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          metadata?: Json
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          metadata?: Json
        }
        Relationships: []
      }
      drop_delivery_zones: {
        Row: {
          code: string
          created_at: string
          drop_id: string
          fee_minor: number | null
          id: string
          is_enabled: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          drop_id: string
          fee_minor?: number | null
          id?: string
          is_enabled?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          drop_id?: string
          fee_minor?: number | null
          id?: string
          is_enabled?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drop_delivery_zones_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "drop_inventory"
            referencedColumns: ["drop_id"]
          },
          {
            foreignKeyName: "drop_delivery_zones_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "drops"
            referencedColumns: ["id"]
          },
        ]
      }
      drop_items: {
        Row: {
          created_at: string
          description: string | null
          drop_id: string
          id: string
          is_enabled: boolean
          item_type: Database["public"]["Enums"]["drop_item_type"]
          name: string
          price_minor: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          drop_id: string
          id?: string
          is_enabled?: boolean
          item_type?: Database["public"]["Enums"]["drop_item_type"]
          name: string
          price_minor?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          drop_id?: string
          id?: string
          is_enabled?: boolean
          item_type?: Database["public"]["Enums"]["drop_item_type"]
          name?: string
          price_minor?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drop_items_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "drop_inventory"
            referencedColumns: ["drop_id"]
          },
          {
            foreignKeyName: "drop_items_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "drops"
            referencedColumns: ["id"]
          },
        ]
      }
      drop_media: {
        Row: {
          alt_text: string | null
          created_at: string
          drop_id: string
          id: string
          is_enabled: boolean
          kind: Database["public"]["Enums"]["drop_media_kind"]
          label: string | null
          path: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          drop_id: string
          id?: string
          is_enabled?: boolean
          kind: Database["public"]["Enums"]["drop_media_kind"]
          label?: string | null
          path: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          drop_id?: string
          id?: string
          is_enabled?: boolean
          kind?: Database["public"]["Enums"]["drop_media_kind"]
          label?: string | null
          path?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drop_media_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "drop_inventory"
            referencedColumns: ["drop_id"]
          },
          {
            foreignKeyName: "drop_media_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "drops"
            referencedColumns: ["id"]
          },
        ]
      }
      drop_slots: {
        Row: {
          capacity: number | null
          created_at: string
          drop_id: string
          ends_at: string
          id: string
          is_enabled: boolean
          sort_order: number
          starts_at: string
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          drop_id: string
          ends_at: string
          id?: string
          is_enabled?: boolean
          sort_order?: number
          starts_at: string
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          drop_id?: string
          ends_at?: string
          id?: string
          is_enabled?: boolean
          sort_order?: number
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drop_slots_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "drop_inventory"
            referencedColumns: ["drop_id"]
          },
          {
            foreignKeyName: "drop_slots_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "drops"
            referencedColumns: ["id"]
          },
        ]
      }
      drops: {
        Row: {
          capacity: number
          created_at: string
          created_by: string | null
          currency: string
          delivery_enabled: boolean
          description: string | null
          fulfillment_date: string | null
          fulfillment_day_label: string | null
          hero_image_path: string | null
          id: string
          lifecycle_status: Database["public"]["Enums"]["drop_lifecycle_status"]
          low_stock_threshold: number
          name: string
          number: number
          orders_close_at: string | null
          orders_open_at: string | null
          pickup_enabled: boolean
          pickup_label: string | null
          price_minor: number
          published_at: string | null
          slug: string
          tagline: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          capacity: number
          created_at?: string
          created_by?: string | null
          currency?: string
          delivery_enabled?: boolean
          description?: string | null
          fulfillment_date?: string | null
          fulfillment_day_label?: string | null
          hero_image_path?: string | null
          id?: string
          lifecycle_status?: Database["public"]["Enums"]["drop_lifecycle_status"]
          low_stock_threshold?: number
          name: string
          number: number
          orders_close_at?: string | null
          orders_open_at?: string | null
          pickup_enabled?: boolean
          pickup_label?: string | null
          price_minor?: number
          published_at?: string | null
          slug: string
          tagline?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          capacity?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          delivery_enabled?: boolean
          description?: string | null
          fulfillment_date?: string | null
          fulfillment_day_label?: string | null
          hero_image_path?: string | null
          id?: string
          lifecycle_status?: Database["public"]["Enums"]["drop_lifecycle_status"]
          low_stock_threshold?: number
          name?: string
          number?: number
          orders_close_at?: string | null
          orders_open_at?: string | null
          pickup_enabled?: boolean
          pickup_label?: string | null
          price_minor?: number
          published_at?: string | null
          slug?: string
          tagline?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      prelaunch_sales: {
        Row: {
          confirmed_at: string
          created_at: string
          created_by: string | null
          drop_id: string
          id: string
          note: string | null
          quantity: number
          source: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          confirmed_at?: string
          created_at?: string
          created_by?: string | null
          drop_id: string
          id?: string
          note?: string | null
          quantity: number
          source: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          confirmed_at?: string
          created_at?: string
          created_by?: string | null
          drop_id?: string
          id?: string
          note?: string | null
          quantity?: number
          source?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prelaunch_sales_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "drop_inventory"
            referencedColumns: ["drop_id"]
          },
          {
            foreignKeyName: "prelaunch_sales_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "drops"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_config: {
        Row: {
          current_drop_id: string | null
          next_drop_id: string | null
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          current_drop_id?: string | null
          next_drop_id?: string | null
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          current_drop_id?: string | null
          next_drop_id?: string | null
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storefront_config_current_drop_id_fkey"
            columns: ["current_drop_id"]
            isOneToOne: false
            referencedRelation: "drop_inventory"
            referencedColumns: ["drop_id"]
          },
          {
            foreignKeyName: "storefront_config_current_drop_id_fkey"
            columns: ["current_drop_id"]
            isOneToOne: false
            referencedRelation: "drops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefront_config_next_drop_id_fkey"
            columns: ["next_drop_id"]
            isOneToOne: false
            referencedRelation: "drop_inventory"
            referencedColumns: ["drop_id"]
          },
          {
            foreignKeyName: "storefront_config_next_drop_id_fkey"
            columns: ["next_drop_id"]
            isOneToOne: false
            referencedRelation: "drops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      drop_inventory: {
        Row: {
          available: number | null
          capacity: number | null
          drop_id: string | null
          held_units: number | null
          online_sold_units: number | null
          prelaunch_sold_units: number | null
          sold_fraction: number | null
          total_sold: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_storefront_state: { Args: never; Returns: Json }
      publish_drop: { Args: { p_drop_id: string }; Returns: undefined }
      record_prelaunch_sale: {
        Args: {
          p_confirmed_at?: string
          p_drop_id: string
          p_note?: string
          p_quantity: number
          p_source: string
        }
        Returns: string
      }
      set_storefront_drop: {
        Args: { p_drop_id: string; p_slot: string }
        Returns: undefined
      }
      void_prelaunch_sale: {
        Args: { p_reason: string; p_sale_id: string }
        Returns: undefined
      }
    }
    Enums: {
      admin_role: "founder" | "admin" | "operator"
      customer_availability_status:
        | "upcoming"
        | "active"
        | "low_stock"
        | "sales_closed"
        | "sold_out"
      drop_item_type: "included" | "extra"
      drop_lifecycle_status:
        | "draft"
        | "scheduled"
        | "published"
        | "archived"
        | "cancelled"
      drop_media_kind: "hero" | "packaging_frame" | "gallery"
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
    Enums: {
      admin_role: ["founder", "admin", "operator"],
      customer_availability_status: [
        "upcoming",
        "active",
        "low_stock",
        "sales_closed",
        "sold_out",
      ],
      drop_item_type: ["included", "extra"],
      drop_lifecycle_status: [
        "draft",
        "scheduled",
        "published",
        "archived",
        "cancelled",
      ],
      drop_media_kind: ["hero", "packaging_frame", "gallery"],
    },
  },
} as const
