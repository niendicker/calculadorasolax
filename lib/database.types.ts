export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      accessories: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          documents: Json
          id: string
          image_url: string | null
          model: string
          nickname: string | null
          warranty_years: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          documents?: Json
          id?: string
          image_url?: string | null
          model: string
          nickname?: string | null
          warranty_years?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          documents?: Json
          id?: string
          image_url?: string | null
          model?: string
          nickname?: string | null
          warranty_years?: number
        }
        Relationships: []
      }
      accessory_rules: {
        Row: {
          accessory_id: string
          active: boolean
          battery_model: string | null
          battery_topology: string | null
          bundled: boolean
          comment: string | null
          created_at: string
          desired_features: string[]
          excludes_accessory_models: string[] | null
          grid_topology: string | null
          id: string
          inclusion: string
          inverter_model: string | null
          inverter_models: string[]
          metric_divisor: number
          min_quantity: number
          name: string
          quantity_per_match: number
          scale_with_metric: boolean
          trigger_metric: string
        }
        Insert: {
          accessory_id: string
          active?: boolean
          battery_model?: string | null
          battery_topology?: string | null
          bundled?: boolean
          comment?: string | null
          created_at?: string
          desired_features?: string[]
          excludes_accessory_models?: string[] | null
          grid_topology?: string | null
          id?: string
          inclusion: string
          inverter_model?: string | null
          inverter_models?: string[]
          metric_divisor?: number
          min_quantity: number
          name: string
          quantity_per_match?: number
          scale_with_metric?: boolean
          trigger_metric: string
        }
        Update: {
          accessory_id?: string
          active?: boolean
          battery_model?: string | null
          battery_topology?: string | null
          bundled?: boolean
          comment?: string | null
          created_at?: string
          desired_features?: string[]
          excludes_accessory_models?: string[] | null
          grid_topology?: string | null
          id?: string
          inclusion?: string
          inverter_model?: string | null
          inverter_models?: string[]
          metric_divisor?: number
          min_quantity?: number
          name?: string
          quantity_per_match?: number
          scale_with_metric?: boolean
          trigger_metric?: string
        }
        Relationships: [
          {
            foreignKeyName: "accessory_rules_accessory_id_fkey"
            columns: ["accessory_id"]
            isOneToOne: false
            referencedRelation: "accessories"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_activity_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_type: string
          id: string
          summary: string
          target_id: string | null
          target_label: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_type: string
          id?: string
          summary: string
          target_id?: string | null
          target_label: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_type?: string
          id?: string
          summary?: string
          target_id?: string | null
          target_label?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          id: boolean
          max_quote_sends_24h: number
          max_quote_suppliers: number
          max_user_suppliers: number
          quote_cooldown_hours: number
          updated_at: string
        }
        Insert: {
          id?: boolean
          max_quote_sends_24h?: number
          max_quote_suppliers?: number
          max_user_suppliers?: number
          quote_cooldown_hours?: number
          updated_at?: string
        }
        Update: {
          id?: boolean
          max_quote_sends_24h?: number
          max_quote_suppliers?: number
          max_user_suppliers?: number
          quote_cooldown_hours?: number
          updated_at?: string
        }
        Relationships: []
      }
      app_simulations: {
        Row: {
          accessories: Json
          battery_model: string | null
          client_name: string | null
          created_at: string
          daily_kwh: number
          grid_type: string | null
          id: string
          inverter_model: string | null
          loads: Json
          peak_w: number
          project_name: string | null
          solution_code: string | null
          topology: string | null
          user_id: string | null
        }
        Insert: {
          accessories?: Json
          battery_model?: string | null
          client_name?: string | null
          created_at?: string
          daily_kwh?: number
          grid_type?: string | null
          id?: string
          inverter_model?: string | null
          loads?: Json
          peak_w?: number
          project_name?: string | null
          solution_code?: string | null
          topology?: string | null
          user_id?: string | null
        }
        Update: {
          accessories?: Json
          battery_model?: string | null
          client_name?: string | null
          created_at?: string
          daily_kwh?: number
          grid_type?: string | null
          id?: string
          inverter_model?: string | null
          loads?: Json
          peak_w?: number
          project_name?: string | null
          solution_code?: string | null
          topology?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      approved_solutions: {
        Row: {
          accessories: Json
          active: boolean
          available_energy_wh: number
          battery_model: string
          battery_ports_used: number
          battery_power_w: number
          battery_quantity: number
          battery_topology: string
          comments: Json
          created_at: string
          grid_topology: string
          id: string
          inverter_model: string
          inverter_quantity: number
          nominal_voltage_v: number
          peak_power_w: number
          rated_power_w: number
          raw_solution: Json
          schema_version: string
          solution_code: string
          source_file: string
        }
        Insert: {
          accessories?: Json
          active?: boolean
          available_energy_wh: number
          battery_model: string
          battery_ports_used: number
          battery_power_w: number
          battery_quantity: number
          battery_topology: string
          comments?: Json
          created_at?: string
          grid_topology: string
          id?: string
          inverter_model: string
          inverter_quantity: number
          nominal_voltage_v: number
          peak_power_w: number
          rated_power_w: number
          raw_solution: Json
          schema_version?: string
          solution_code: string
          source_file: string
        }
        Update: {
          accessories?: Json
          active?: boolean
          available_energy_wh?: number
          battery_model?: string
          battery_ports_used?: number
          battery_power_w?: number
          battery_quantity?: number
          battery_topology?: string
          comments?: Json
          created_at?: string
          grid_topology?: string
          id?: string
          inverter_model?: string
          inverter_quantity?: number
          nominal_voltage_v?: number
          peak_power_w?: number
          rated_power_w?: number
          raw_solution?: Json
          schema_version?: string
          solution_code?: string
          source_file?: string
        }
        Relationships: []
      }
      batteries: {
        Row: {
          annual_soh_loss_percent: number
          capacity_kwh: number
          created_at: string | null
          documents: Json
          expansion_model: string | null
          flags: string[]
          id: string
          image_url: string | null
          initial_soh_percent: number
          max_association_qty: number
          max_current_a: number
          min_soc_percent: number
          model: string
          nickname: string | null
          nominal_voltage_v: number
          peak_power_kw: number | null
          recommended_current_a: number
          round_trip_efficiency_percent: number
          standard_power_kw: number | null
          topology: string
          voltage_max_v: number
          voltage_min_v: number
          warranty_cycles: number
          warranty_end_soh_percent: number | null
          warranty_years: number
        }
        Insert: {
          annual_soh_loss_percent?: number
          capacity_kwh: number
          created_at?: string | null
          documents?: Json
          expansion_model?: string | null
          flags?: string[]
          id?: string
          image_url?: string | null
          initial_soh_percent?: number
          max_association_qty?: number
          max_current_a?: number
          min_soc_percent?: number
          model: string
          nickname?: string | null
          nominal_voltage_v?: number
          peak_power_kw?: number | null
          recommended_current_a?: number
          round_trip_efficiency_percent?: number
          standard_power_kw?: number | null
          topology: string
          voltage_max_v?: number
          voltage_min_v?: number
          warranty_cycles?: number
          warranty_end_soh_percent?: number | null
          warranty_years?: number
        }
        Update: {
          annual_soh_loss_percent?: number
          capacity_kwh?: number
          created_at?: string | null
          documents?: Json
          expansion_model?: string | null
          flags?: string[]
          id?: string
          image_url?: string | null
          initial_soh_percent?: number
          max_association_qty?: number
          max_current_a?: number
          min_soc_percent?: number
          model?: string
          nickname?: string | null
          nominal_voltage_v?: number
          peak_power_kw?: number | null
          recommended_current_a?: number
          round_trip_efficiency_percent?: number
          standard_power_kw?: number | null
          topology?: string
          voltage_max_v?: number
          voltage_min_v?: number
          warranty_cycles?: number
          warranty_end_soh_percent?: number | null
          warranty_years?: number
        }
        Relationships: []
      }
      clients: {
        Row: {
          created_at: string
          document: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ess_compatibility_rules: {
        Row: {
          active: boolean
          battery_configs: Json
          battery_model: string
          battery_topology: string | null
          comment: string | null
          created_at: string
          grid_topology: string | null
          id: string
          inverter_model: string
          max_battery_qty: number
          max_parallel_inverters: number
          min_battery_qty: number
          name: string | null
        }
        Insert: {
          active?: boolean
          battery_configs?: Json
          battery_model: string
          battery_topology?: string | null
          comment?: string | null
          created_at?: string
          grid_topology?: string | null
          id?: string
          inverter_model: string
          max_battery_qty?: number
          max_parallel_inverters?: number
          min_battery_qty?: number
          name?: string | null
        }
        Update: {
          active?: boolean
          battery_configs?: Json
          battery_model?: string
          battery_topology?: string | null
          comment?: string | null
          created_at?: string
          grid_topology?: string | null
          id?: string
          inverter_model?: string
          max_battery_qty?: number
          max_parallel_inverters?: number
          min_battery_qty?: number
          name?: string | null
        }
        Relationships: []
      }
      inverters: {
        Row: {
          battery_charge_efficiency_percent: number
          battery_current_max_a: number
          battery_discharge_efficiency_percent: number
          battery_ports: number
          battery_voltage_max_v: number
          battery_voltage_min_v: number
          created_at: string | null
          documents: Json
          flags: string[]
          grid_types: string[]
          id: string
          image_url: string | null
          max_battery_charge_power_w: number | null
          max_battery_discharge_power_w: number | null
          max_battery_qty: number
          max_power_per_phase_w: number | null
          model: string
          nickname: string | null
          peak_power_kva: number | null
          phases: number
          power_kw: number
          pv_oversizing_percent: number
          standard_power_kva: number | null
          standby_consumption_w: number
          topology: string
          warranty_years: number
        }
        Insert: {
          battery_charge_efficiency_percent?: number
          battery_current_max_a?: number
          battery_discharge_efficiency_percent?: number
          battery_ports?: number
          battery_voltage_max_v?: number
          battery_voltage_min_v?: number
          created_at?: string | null
          documents?: Json
          flags?: string[]
          grid_types?: string[]
          id?: string
          image_url?: string | null
          max_battery_charge_power_w?: number | null
          max_battery_discharge_power_w?: number | null
          max_battery_qty?: number
          max_power_per_phase_w?: number | null
          model: string
          nickname?: string | null
          peak_power_kva?: number | null
          phases: number
          power_kw: number
          pv_oversizing_percent?: number
          standard_power_kva?: number | null
          standby_consumption_w?: number
          topology: string
          warranty_years?: number
        }
        Update: {
          battery_charge_efficiency_percent?: number
          battery_current_max_a?: number
          battery_discharge_efficiency_percent?: number
          battery_ports?: number
          battery_voltage_max_v?: number
          battery_voltage_min_v?: number
          created_at?: string | null
          documents?: Json
          flags?: string[]
          grid_types?: string[]
          id?: string
          image_url?: string | null
          max_battery_charge_power_w?: number | null
          max_battery_discharge_power_w?: number | null
          max_battery_qty?: number
          max_power_per_phase_w?: number | null
          model?: string
          nickname?: string | null
          peak_power_kva?: number | null
          phases?: number
          power_kw?: number
          pv_oversizing_percent?: number
          standard_power_kva?: number | null
          standby_consumption_w?: number
          topology?: string
          warranty_years?: number
        }
        Relationships: []
      }
      load_catalog: {
        Row: {
          active: boolean
          category: string
          created_at: string | null
          id: string
          ip_in_ratio: number
          name_en: string
          name_pt: string
          name_zh: string
          power_w: number
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string | null
          id?: string
          ip_in_ratio?: number
          name_en: string
          name_pt: string
          name_zh: string
          power_w: number
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string | null
          id?: string
          ip_in_ratio?: number
          name_en?: string
          name_pt?: string
          name_zh?: string
          power_w?: number
        }
        Relationships: []
      }
      load_presets: {
        Row: {
          created_at: string
          description: string
          display_order: number
          id: string
          loads: Json
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          display_order?: number
          id?: string
          loads?: Json
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          display_order?: number
          id?: string
          loads?: Json
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_address: Json | null
          company_document: string | null
          company_logo_url: string
          company_name: string
          created_at: string
          email: string
          full_name: string
          id: string
          margin_accessory_percent: number
          margin_battery_percent: number
          margin_inverter_percent: number
          phone: string
          role: string
          terms_accepted_at: string | null
          terms_accepted_version: string | null
          updated_at: string
        }
        Insert: {
          company_address?: Json | null
          company_document?: string | null
          company_logo_url?: string
          company_name?: string
          created_at?: string
          email: string
          full_name?: string
          id: string
          margin_accessory_percent?: number
          margin_battery_percent?: number
          margin_inverter_percent?: number
          phone?: string
          role?: string
          terms_accepted_at?: string | null
          terms_accepted_version?: string | null
          updated_at?: string
        }
        Update: {
          company_address?: Json | null
          company_document?: string | null
          company_logo_url?: string
          company_name?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          margin_accessory_percent?: number
          margin_battery_percent?: number
          margin_inverter_percent?: number
          phone?: string
          role?: string
          terms_accepted_at?: string | null
          terms_accepted_version?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          message: string | null
          project_id: string
          to_status: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          message?: string | null
          project_id: string
          to_status?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          message?: string | null
          project_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_quote_requests: {
        Row: {
          attempt_started_at: string | null
          claim_token: string | null
          created_at: string
          error_message: string | null
          id: string
          idempotency_key: string
          last_attempt_at: string
          last_sent_at: string | null
          project_id: string
          send_count: number
          sent_at: string | null
          status: string
          supplier_id: string
          user_id: string
        }
        Insert: {
          attempt_started_at?: string | null
          claim_token?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key: string
          last_attempt_at?: string
          last_sent_at?: string | null
          project_id: string
          send_count?: number
          sent_at?: string | null
          status?: string
          supplier_id: string
          user_id: string
        }
        Update: {
          attempt_started_at?: string | null
          claim_token?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string
          last_attempt_at?: string
          last_sent_at?: string | null
          project_id?: string
          send_count?: number
          sent_at?: string | null
          status?: string
          supplier_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_quote_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quote_requests_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quote_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      projects: {
        Row: {
          address: Json | null
          client_id: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          residential_options: Json
          services: Json
          solution: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: Json | null
          client_id?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          residential_options?: Json
          services?: Json
          solution?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: Json | null
          client_id?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          residential_options?: Json
          services?: Json
          solution?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          message: string | null
          order_id: string
          to_status: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          message?: string | null
          order_id: string
          to_status?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          message?: string | null
          order_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          id: string
          line_total: number | null
          offer_id: string | null
          order_id: string
          product_model: string
          product_type: string
          quantity: number
          supplier_sku: string
          unit_price: number
        }
        Insert: {
          id?: string
          line_total?: number | null
          offer_id?: string | null
          order_id: string
          product_model: string
          product_type: string
          quantity: number
          supplier_sku: string
          unit_price: number
        }
        Update: {
          id?: string
          line_total?: number | null
          offer_id?: string | null
          order_id?: string
          product_model?: string
          product_type?: string
          quantity?: number
          supplier_sku?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "supplier_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          currency: string
          customer_notes: string | null
          delivery_address: Json
          external_order_id: string | null
          id: string
          idempotency_key: string
          project_id: string | null
          quoted_at: string | null
          request_type: string
          shipping_amount: number | null
          status: string
          submitted_at: string | null
          subtotal: number
          supplier_id: string
          supplier_notes: string | null
          tax_amount: number | null
          total_amount: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          currency: string
          customer_notes?: string | null
          delivery_address?: Json
          external_order_id?: string | null
          id?: string
          idempotency_key: string
          project_id?: string | null
          quoted_at?: string | null
          request_type: string
          shipping_amount?: number | null
          status?: string
          submitted_at?: string | null
          subtotal: number
          supplier_id: string
          supplier_notes?: string | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          customer_notes?: string | null
          delivery_address?: Json
          external_order_id?: string | null
          id?: string
          idempotency_key?: string
          project_id?: string | null
          quoted_at?: string | null
          request_type?: string
          shipping_amount?: number | null
          status?: string
          submitted_at?: string | null
          subtotal?: number
          supplier_id?: string
          supplier_notes?: string | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_shares: {
        Row: {
          created_at: string
          first_viewed_at: string | null
          id: string
          project_id: string
          responded_at: string | null
          snapshot: Json
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          first_viewed_at?: string | null
          id?: string
          project_id: string
          responded_at?: string | null
          snapshot: Json
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          first_viewed_at?: string | null
          id?: string
          project_id?: string
          responded_at?: string | null
          snapshot?: Json
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_shares_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_integrations: {
        Row: {
          api_key_header: string
          auth_type: string
          base_url: string | null
          connector_type: string
          created_at: string
          credential_env_key: string | null
          enabled: boolean
          last_sync_at: string | null
          last_sync_message: string | null
          last_sync_status: string | null
          mapping: Json
          products_path: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          api_key_header?: string
          auth_type?: string
          base_url?: string | null
          connector_type?: string
          created_at?: string
          credential_env_key?: string | null
          enabled?: boolean
          last_sync_at?: string | null
          last_sync_message?: string | null
          last_sync_status?: string | null
          mapping?: Json
          products_path?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          api_key_header?: string
          auth_type?: string
          base_url?: string | null
          connector_type?: string
          created_at?: string
          credential_env_key?: string | null
          enabled?: boolean
          last_sync_at?: string | null
          last_sync_message?: string | null
          last_sync_status?: string | null
          mapping?: Json
          products_path?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_integrations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: true
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_offers: {
        Row: {
          active: boolean
          fetched_at: string
          id: string
          lead_time_days: number | null
          mapping_id: string
          minimum_quantity: number
          stock_quantity: number | null
          supplier_id: string
          unit_price: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          fetched_at?: string
          id?: string
          lead_time_days?: number | null
          mapping_id: string
          minimum_quantity?: number
          stock_quantity?: number | null
          supplier_id: string
          unit_price: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          fetched_at?: string
          id?: string
          lead_time_days?: number | null
          mapping_id?: string
          minimum_quantity?: number
          stock_quantity?: number | null
          supplier_id?: string
          unit_price?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_offers_mapping_id_fkey"
            columns: ["mapping_id"]
            isOneToOne: true
            referencedRelation: "supplier_product_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_offers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_product_mappings: {
        Row: {
          active: boolean
          created_at: string
          external_product_id: string | null
          id: string
          pack_quantity: number
          product_model: string
          product_type: string
          supplier_id: string
          supplier_sku: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          external_product_id?: string | null
          id?: string
          pack_quantity?: number
          product_model: string
          product_type: string
          supplier_id: string
          supplier_sku: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          external_product_id?: string | null
          id?: string
          pack_quantity?: number
          product_model?: string
          product_type?: string
          supplier_id?: string
          supplier_sku?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_product_mappings_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_sync_runs: {
        Row: {
          finished_at: string | null
          id: string
          items_received: number
          items_updated: number
          message: string | null
          started_at: string
          status: string
          supplier_id: string
        }
        Insert: {
          finished_at?: string | null
          id?: string
          items_received?: number
          items_updated?: number
          message?: string | null
          started_at?: string
          status: string
          supplier_id: string
        }
        Update: {
          finished_at?: string | null
          id?: string
          items_received?: number
          items_updated?: number
          message?: string | null
          started_at?: string
          status?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_sync_runs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          description: string | null
          email: string | null
          id: string
          is_default_for_all: boolean
          logo_url: string | null
          minimum_order_value: number
          name: string
          order_mode: string
          ordering_enabled: boolean
          payment_terms: string | null
          shipping_terms: string | null
          slug: string
          supports_partner_orders: boolean
          updated_at: string
          website_url: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          email?: string | null
          id?: string
          is_default_for_all?: boolean
          logo_url?: string | null
          minimum_order_value?: number
          name: string
          order_mode?: string
          ordering_enabled?: boolean
          payment_terms?: string | null
          shipping_terms?: string | null
          slug: string
          supports_partner_orders?: boolean
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          email?: string | null
          id?: string
          is_default_for_all?: boolean
          logo_url?: string | null
          minimum_order_value?: number
          name?: string
          order_mode?: string
          ordering_enabled?: boolean
          payment_terms?: string | null
          shipping_terms?: string | null
          slug?: string
          supports_partner_orders?: boolean
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      user_load_catalog: {
        Row: {
          created_at: string
          id: string
          ip_in_ratio: number
          name: string
          power_w: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_in_ratio?: number
          name: string
          power_w: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_in_ratio?: number
          name?: string
          power_w?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_load_presets: {
        Row: {
          created_at: string
          description: string
          id: string
          loads: Json
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          loads?: Json
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          loads?: Json
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_services: {
        Row: {
          created_at: string
          id: string
          name: string
          pricing_unit: string
          unit_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          pricing_unit?: string
          unit_value: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          pricing_unit?: string
          unit_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_stock_items: {
        Row: {
          created_at: string
          id: string
          product_model: string
          product_type: string
          unit_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_model: string
          product_type: string
          unit_value: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_model?: string
          product_type?: string
          unit_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_supplier_preferences: {
        Row: {
          created_at: string
          supplier_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          supplier_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          supplier_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_supplier_preferences_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_supplier_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_transition_purchase_order: {
        Args: {
          p_external_order_id?: string
          p_message?: string
          p_order_id: string
          p_shipping_amount?: number
          p_status: string
          p_tax_amount?: number
        }
        Returns: undefined
      }
      cancel_purchase_order: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      create_purchase_order: {
        Args: {
          p_customer_notes?: string
          p_delivery_address?: Json
          p_idempotency_key: string
          p_items: Json
          p_project_id?: string
          p_request_type: string
          p_supplier_id: string
        }
        Returns: string
      }
      delete_own_account: { Args: never; Returns: undefined }
      ess_compatible_solution_ids: {
        Args: {
          p_battery_model: string
          p_battery_topology: string
          p_grid_topology: string
          p_solution_ids: string[]
        }
        Returns: string[]
      }
      is_admin: { Args: never; Returns: boolean }
      claim_supplier_quote_requests: {
        Args: {
          p_idempotency_key: string
          p_project_id: string
          p_supplier_ids: string[]
        }
        Returns: {
          claim_token: string | null
          claimed: boolean
          request_id: string
          retry_at: string | null
          status: string
          supplier_id: string
        }[]
      }
      submit_purchase_order_to_partner: {
        Args: {
          p_external_order_id: string
          p_message: string
          p_order_id: string
        }
        Returns: undefined
      }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
