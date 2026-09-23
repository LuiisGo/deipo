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
          max_quantity_per_order: number | null
          name: string
          number: number
          online_ordering_enabled: boolean
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
          max_quantity_per_order?: number | null
          name: string
          number: number
          online_ordering_enabled?: boolean
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
          max_quantity_per_order?: number | null
          name?: string
          number?: number
          online_ordering_enabled?: boolean
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
      inventory_holds: {
        Row: {
          checkout_session_hash: string
          converted_at: string | null
          created_at: string
          drop_id: string
          expires_at: string
          id: string
          quantity: number
          released_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          checkout_session_hash: string
          converted_at?: string | null
          created_at?: string
          drop_id: string
          expires_at: string
          id?: string
          quantity: number
          released_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          checkout_session_hash?: string
          converted_at?: string | null
          created_at?: string
          drop_id?: string
          expires_at?: string
          id?: string
          quantity?: number
          released_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_holds_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "drop_inventory"
            referencedColumns: ["drop_id"]
          },
          {
            foreignKeyName: "inventory_holds_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "drops"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor_kind: string
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: number
          metadata: Json
          order_id: string
        }
        Insert: {
          actor_kind: string
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: never
          metadata?: Json
          order_id: string
        }
        Update: {
          actor_kind?: string
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: never
          metadata?: Json
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_order_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          drop_id: string
          id: string
          line_total_minor: number | null
          order_id: string
          quantity: number
          snapshot_drop_number: number
          snapshot_name: string
          unit_price_minor: number
        }
        Insert: {
          created_at?: string
          drop_id: string
          id?: string
          line_total_minor?: number | null
          order_id: string
          quantity: number
          snapshot_drop_number: number
          snapshot_name: string
          unit_price_minor: number
        }
        Update: {
          created_at?: string
          drop_id?: string
          id?: string
          line_total_minor?: number | null
          order_id?: string
          quantity?: number
          snapshot_drop_number?: number
          snapshot_name?: string
          unit_price_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "drop_inventory"
            referencedColumns: ["drop_id"]
          },
          {
            foreignKeyName: "order_items_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "drops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "admin_order_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          currency: string
          customer_email: string | null
          customer_name: string
          customer_phone: string
          delivery_address: string | null
          delivery_fee_minor: number
          delivery_notes: string | null
          delivery_zone_id: string | null
          delivery_zone_label: string | null
          fulfillment_date: string
          fulfillment_method: string
          hold_id: string
          id: string
          inventory_committed_at: string | null
          inventory_released_at: string | null
          order_code: string
          paid_at: string | null
          pickup_label: string | null
          slot_end: string | null
          slot_id: string | null
          slot_start: string | null
          status: string
          subtotal_minor: number
          total_minor: number | null
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          currency: string
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          delivery_address?: string | null
          delivery_fee_minor: number
          delivery_notes?: string | null
          delivery_zone_id?: string | null
          delivery_zone_label?: string | null
          fulfillment_date: string
          fulfillment_method: string
          hold_id: string
          id?: string
          inventory_committed_at?: string | null
          inventory_released_at?: string | null
          order_code?: string
          paid_at?: string | null
          pickup_label?: string | null
          slot_end?: string | null
          slot_id?: string | null
          slot_start?: string | null
          status?: string
          subtotal_minor: number
          total_minor?: number | null
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          delivery_address?: string | null
          delivery_fee_minor?: number
          delivery_notes?: string | null
          delivery_zone_id?: string | null
          delivery_zone_label?: string | null
          fulfillment_date?: string
          fulfillment_method?: string
          hold_id?: string
          id?: string
          inventory_committed_at?: string | null
          inventory_released_at?: string | null
          order_code?: string
          paid_at?: string | null
          pickup_label?: string | null
          slot_end?: string | null
          slot_id?: string | null
          slot_start?: string | null
          status?: string
          subtotal_minor?: number
          total_minor?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "drop_delivery_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_hold_id_fkey"
            columns: ["hold_id"]
            isOneToOne: true
            referencedRelation: "inventory_holds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "drop_slots"
            referencedColumns: ["id"]
          },
        ]
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
          hold_ttl_seconds: number
          next_drop_id: string | null
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          current_drop_id?: string | null
          hold_ttl_seconds?: number
          next_drop_id?: string | null
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          current_drop_id?: string | null
          hold_ttl_seconds?: number
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
      admin_order_state: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string | null
          currency: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          delivery_address: string | null
          delivery_fee_minor: number | null
          delivery_notes: string | null
          delivery_zone_id: string | null
          delivery_zone_label: string | null
          drop_id: string | null
          effective_status: string | null
          expires_at: string | null
          fulfillment_date: string | null
          fulfillment_method: string | null
          hold_id: string | null
          hold_status: string | null
          id: string | null
          inventory_committed_at: string | null
          inventory_released_at: string | null
          order_code: string | null
          paid_at: string | null
          pickup_label: string | null
          quantity: number | null
          slot_end: string | null
          slot_id: string | null
          slot_start: string | null
          status: string | null
          subtotal_minor: number | null
          total_minor: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_holds_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "drop_inventory"
            referencedColumns: ["drop_id"]
          },
          {
            foreignKeyName: "inventory_holds_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "drops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "drop_delivery_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_hold_id_fkey"
            columns: ["hold_id"]
            isOneToOne: true
            referencedRelation: "inventory_holds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "drop_slots"
            referencedColumns: ["id"]
          },
        ]
      }
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
      admin_cancel_pending_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      cancel_pending_order: {
        Args: { p_checkout_session_hash: string }
        Returns: Json
      }
      create_inventory_hold: {
        Args: {
          p_checkout_session_hash: string
          p_drop_id: string
          p_quantity: number
        }
        Returns: Json
      }
      create_pending_order_from_hold: {
        Args: { p_checkout_session_hash: string; p_details: Json }
        Returns: Json
      }
      get_checkout_state: {
        Args: { p_checkout_session_hash: string }
        Returns: Json
      }
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
      release_inventory_hold: {
        Args: { p_checkout_session_hash: string }
        Returns: Json
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
        | "temporarily_unavailable"
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
        "temporarily_unavailable",
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
