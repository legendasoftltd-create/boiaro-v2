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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      accounting_ledger: {
        Row: {
          amount: number
          book_id: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          entry_date: string
          id: string
          order_id: string | null
          reference_id: string | null
          reference_type: string | null
          source: string
          type: string
          updated_at: string
        }
        Insert: {
          amount?: number
          book_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          id?: string
          order_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          source?: string
          type?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          book_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          id?: string
          order_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          source?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_ledger_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_banners: {
        Row: {
          clicks: number | null
          created_at: string
          destination_url: string | null
          device: string | null
          display_order: number | null
          end_date: string | null
          id: string
          image_url: string | null
          impressions: number | null
          placement_key: string
          start_date: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          clicks?: number | null
          created_at?: string
          destination_url?: string | null
          device?: string | null
          display_order?: number | null
          end_date?: string | null
          id?: string
          image_url?: string | null
          impressions?: number | null
          placement_key: string
          start_date?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          clicks?: number | null
          created_at?: string
          destination_url?: string | null
          device?: string | null
          display_order?: number | null
          end_date?: string | null
          id?: string
          image_url?: string | null
          impressions?: number | null
          placement_key?: string
          start_date?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ad_campaigns: {
        Row: {
          ad_type: string
          created_at: string
          end_date: string | null
          id: string
          name: string
          notes: string | null
          placement_key: string | null
          start_date: string | null
          status: string
          target_page: string | null
          updated_at: string
        }
        Insert: {
          ad_type?: string
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          notes?: string | null
          placement_key?: string | null
          start_date?: string | null
          status?: string
          target_page?: string | null
          updated_at?: string
        }
        Update: {
          ad_type?: string
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          placement_key?: string | null
          start_date?: string | null
          status?: string
          target_page?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ad_placements: {
        Row: {
          ad_type: string
          created_at: string
          device_visibility: string | null
          display_priority: number | null
          frequency: string | null
          id: string
          is_enabled: boolean
          label: string
          notes: string | null
          placement_key: string
          updated_at: string
        }
        Insert: {
          ad_type?: string
          created_at?: string
          device_visibility?: string | null
          display_priority?: number | null
          frequency?: string | null
          id?: string
          is_enabled?: boolean
          label: string
          notes?: string | null
          placement_key: string
          updated_at?: string
        }
        Update: {
          ad_type?: string
          created_at?: string
          device_visibility?: string | null
          display_priority?: number | null
          frequency?: string | null
          id?: string
          is_enabled?: boolean
          label?: string
          notes?: string | null
          placement_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_activity_logs: {
        Row: {
          action: string
          action_type: string | null
          actor_role: string | null
          created_at: string
          details: string | null
          id: string
          ip_address: string | null
          module: string | null
          new_value: string | null
          old_value: string | null
          risk_level: string
          status: string
          target_id: string | null
          target_type: string | null
          user_agent: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          action_type?: string | null
          actor_role?: string | null
          created_at?: string
          details?: string | null
          id?: string
          ip_address?: string | null
          module?: string | null
          new_value?: string | null
          old_value?: string | null
          risk_level?: string
          status?: string
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          action_type?: string | null
          actor_role?: string | null
          created_at?: string
          details?: string | null
          id?: string
          ip_address?: string | null
          module?: string | null
          new_value?: string | null
          old_value?: string | null
          risk_level?: string
          status?: string
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      admin_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          label: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          label: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          label?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_user_roles: {
        Row: {
          admin_role_id: string
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_role_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_role_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_user_roles_admin_role_id_fkey"
            columns: ["admin_role_id"]
            isOneToOne: false
            referencedRelation: "admin_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      audiobook_tracks: {
        Row: {
          audio_url: string | null
          book_format_id: string
          chapter_price: number | null
          created_at: string
          created_by: string | null
          duration: string | null
          id: string
          is_preview: boolean | null
          media_type: string
          status: string
          title: string
          track_number: number
        }
        Insert: {
          audio_url?: string | null
          book_format_id: string
          chapter_price?: number | null
          created_at?: string
          created_by?: string | null
          duration?: string | null
          id?: string
          is_preview?: boolean | null
          media_type?: string
          status?: string
          title: string
          track_number: number
        }
        Update: {
          audio_url?: string | null
          book_format_id?: string
          chapter_price?: number | null
          created_at?: string
          created_by?: string | null
          duration?: string | null
          id?: string
          is_preview?: boolean | null
          media_type?: string
          status?: string
          title?: string
          track_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "audiobook_tracks_book_format_id_fkey"
            columns: ["book_format_id"]
            isOneToOne: false
            referencedRelation: "book_formats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audiobook_tracks_book_format_id_fkey"
            columns: ["book_format_id"]
            isOneToOne: false
            referencedRelation: "book_formats_public"
            referencedColumns: ["id"]
          },
        ]
      }
      authors: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          email: string | null
          genre: string | null
          id: string
          is_featured: boolean | null
          is_trending: boolean | null
          linked_at: string | null
          name: string
          name_en: string | null
          phone: string | null
          priority: number
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string | null
          genre?: string | null
          id?: string
          is_featured?: boolean | null
          is_trending?: boolean | null
          linked_at?: string | null
          name: string
          name_en?: string | null
          phone?: string | null
          priority?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string | null
          genre?: string | null
          id?: string
          is_featured?: boolean | null
          is_trending?: boolean | null
          linked_at?: string | null
          name?: string
          name_en?: string | null
          phone?: string | null
          priority?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      badge_definitions: {
        Row: {
          category: string
          coin_reward: number | null
          condition_type: string
          condition_value: number | null
          created_at: string | null
          description: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          key: string
          sort_order: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string
          coin_reward?: number | null
          condition_type?: string
          condition_value?: number | null
          created_at?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          key: string
          sort_order?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          coin_reward?: number | null
          condition_type?: string
          condition_value?: number | null
          created_at?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          key?: string
          sort_order?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author_name: string | null
          category: string | null
          content: string
          cover_image: string | null
          created_at: string
          excerpt: string | null
          id: string
          is_featured: boolean | null
          publish_date: string | null
          seo_description: string | null
          seo_keywords: string | null
          seo_title: string | null
          slug: string
          status: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          author_name?: string | null
          category?: string | null
          content?: string
          cover_image?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          is_featured?: boolean | null
          publish_date?: string | null
          seo_description?: string | null
          seo_keywords?: string | null
          seo_title?: string | null
          slug: string
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          author_name?: string | null
          category?: string | null
          content?: string
          cover_image?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          is_featured?: boolean | null
          publish_date?: string | null
          seo_description?: string | null
          seo_keywords?: string | null
          seo_title?: string | null
          slug?: string
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      book_comments: {
        Row: {
          book_id: string
          comment: string
          created_at: string
          id: string
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          comment: string
          created_at?: string
          id?: string
          parent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          comment?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_comments_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "book_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      book_contributors: {
        Row: {
          book_id: string
          created_at: string
          format: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          format?: string | null
          id?: string
          role: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          format?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_contributors_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      book_formats: {
        Row: {
          audio_quality: Database["public"]["Enums"]["audio_quality"] | null
          binding: Database["public"]["Enums"]["binding_type"] | null
          book_id: string
          chapters_count: number | null
          coin_price: number | null
          created_at: string
          default_packaging_cost: number | null
          delivery_days: number | null
          dimensions: string | null
          discount: number | null
          duration: string | null
          file_size: string | null
          file_url: string | null
          format: Database["public"]["Enums"]["book_format_type"]
          id: string
          in_stock: boolean | null
          is_available: boolean | null
          isbn: string | null
          narrator_id: string | null
          original_price: number | null
          pages: number | null
          payout_model: string
          preview_chapters: number | null
          preview_percentage: number | null
          price: number | null
          printing_cost: number | null
          publisher_commission_percent: number | null
          publisher_id: string | null
          stock_count: number | null
          submission_status: string
          submitted_by: string | null
          unit_cost: number | null
          updated_at: string
          weight: string | null
          weight_kg_per_copy: number | null
        }
        Insert: {
          audio_quality?: Database["public"]["Enums"]["audio_quality"] | null
          binding?: Database["public"]["Enums"]["binding_type"] | null
          book_id: string
          chapters_count?: number | null
          coin_price?: number | null
          created_at?: string
          default_packaging_cost?: number | null
          delivery_days?: number | null
          dimensions?: string | null
          discount?: number | null
          duration?: string | null
          file_size?: string | null
          file_url?: string | null
          format: Database["public"]["Enums"]["book_format_type"]
          id?: string
          in_stock?: boolean | null
          is_available?: boolean | null
          isbn?: string | null
          narrator_id?: string | null
          original_price?: number | null
          pages?: number | null
          payout_model?: string
          preview_chapters?: number | null
          preview_percentage?: number | null
          price?: number | null
          printing_cost?: number | null
          publisher_commission_percent?: number | null
          publisher_id?: string | null
          stock_count?: number | null
          submission_status?: string
          submitted_by?: string | null
          unit_cost?: number | null
          updated_at?: string
          weight?: string | null
          weight_kg_per_copy?: number | null
        }
        Update: {
          audio_quality?: Database["public"]["Enums"]["audio_quality"] | null
          binding?: Database["public"]["Enums"]["binding_type"] | null
          book_id?: string
          chapters_count?: number | null
          coin_price?: number | null
          created_at?: string
          default_packaging_cost?: number | null
          delivery_days?: number | null
          dimensions?: string | null
          discount?: number | null
          duration?: string | null
          file_size?: string | null
          file_url?: string | null
          format?: Database["public"]["Enums"]["book_format_type"]
          id?: string
          in_stock?: boolean | null
          is_available?: boolean | null
          isbn?: string | null
          narrator_id?: string | null
          original_price?: number | null
          pages?: number | null
          payout_model?: string
          preview_chapters?: number | null
          preview_percentage?: number | null
          price?: number | null
          printing_cost?: number | null
          publisher_commission_percent?: number | null
          publisher_id?: string | null
          stock_count?: number | null
          submission_status?: string
          submitted_by?: string | null
          unit_cost?: number | null
          updated_at?: string
          weight?: string | null
          weight_kg_per_copy?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "book_formats_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_formats_narrator_id_fkey"
            columns: ["narrator_id"]
            isOneToOne: false
            referencedRelation: "narrators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_formats_narrator_id_fkey"
            columns: ["narrator_id"]
            isOneToOne: false
            referencedRelation: "narrators_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_formats_publisher_id_fkey"
            columns: ["publisher_id"]
            isOneToOne: false
            referencedRelation: "publishers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_formats_publisher_id_fkey"
            columns: ["publisher_id"]
            isOneToOne: false
            referencedRelation: "publishers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      book_reads: {
        Row: {
          book_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_reads_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmarks: {
        Row: {
          book_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          author_id: string | null
          category_id: string | null
          coin_price: number | null
          cover_url: string | null
          created_at: string
          description: string | null
          description_bn: string | null
          id: string
          is_bestseller: boolean | null
          is_featured: boolean | null
          is_free: boolean | null
          is_new: boolean | null
          is_premium: boolean | null
          language: string | null
          published_date: string | null
          publisher_id: string | null
          rating: number | null
          reviews_count: number | null
          slug: string
          submission_status: string
          submitted_by: string | null
          tags: string[] | null
          title: string
          title_en: string | null
          total_reads: number | null
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          category_id?: string | null
          coin_price?: number | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          description_bn?: string | null
          id?: string
          is_bestseller?: boolean | null
          is_featured?: boolean | null
          is_free?: boolean | null
          is_new?: boolean | null
          is_premium?: boolean | null
          language?: string | null
          published_date?: string | null
          publisher_id?: string | null
          rating?: number | null
          reviews_count?: number | null
          slug: string
          submission_status?: string
          submitted_by?: string | null
          tags?: string[] | null
          title: string
          title_en?: string | null
          total_reads?: number | null
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          category_id?: string | null
          coin_price?: number | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          description_bn?: string | null
          id?: string
          is_bestseller?: boolean | null
          is_featured?: boolean | null
          is_free?: boolean | null
          is_new?: boolean | null
          is_premium?: boolean | null
          language?: string | null
          published_date?: string | null
          publisher_id?: string | null
          rating?: number | null
          reviews_count?: number | null
          slug?: string
          submission_status?: string
          submitted_by?: string | null
          tags?: string[] | null
          title?: string
          title_en?: string | null
          total_reads?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "books_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "books_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "books_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "books_publisher_id_fkey"
            columns: ["publisher_id"]
            isOneToOne: false
            referencedRelation: "publishers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "books_publisher_id_fkey"
            columns: ["publisher_id"]
            isOneToOne: false
            referencedRelation: "publishers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_featured: boolean | null
          is_trending: boolean | null
          name: string
          name_bn: string | null
          name_en: string | null
          priority: number
          slug: string | null
          status: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_featured?: boolean | null
          is_trending?: boolean | null
          name: string
          name_bn?: string | null
          name_en?: string | null
          priority?: number
          slug?: string | null
          status?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_featured?: boolean | null
          is_trending?: boolean | null
          name?: string
          name_bn?: string | null
          name_en?: string | null
          priority?: number
          slug?: string | null
          status?: string
        }
        Relationships: []
      }
      cms_pages: {
        Row: {
          content: string
          created_at: string
          featured_image: string | null
          id: string
          seo_description: string | null
          seo_keywords: string | null
          seo_title: string | null
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          featured_image?: string | null
          id?: string
          seo_description?: string | null
          seo_keywords?: string | null
          seo_title?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          featured_image?: string | null
          id?: string
          seo_description?: string | null
          seo_keywords?: string | null
          seo_title?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      coin_packages: {
        Row: {
          bonus_coins: number
          coins: number
          created_at: string
          id: string
          is_active: boolean
          is_featured: boolean
          name: string
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          bonus_coins?: number
          coins: number
          created_at?: string
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name: string
          price: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          bonus_coins?: number
          coins?: number
          created_at?: string
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name?: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      coin_purchases: {
        Row: {
          coins_amount: number
          created_at: string
          id: string
          package_id: string | null
          payment_method: string
          payment_status: string
          price: number
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          coins_amount: number
          created_at?: string
          id?: string
          package_id?: string | null
          payment_method?: string
          payment_status?: string
          price: number
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          coins_amount?: number
          created_at?: string
          id?: string
          package_id?: string | null
          payment_method?: string
          payment_status?: string
          price?: number
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coin_purchases_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "coin_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      coin_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          reference_id: string | null
          source: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          reference_id?: string | null
          source?: string | null
          type?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          reference_id?: string | null
          source?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "book_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      content_access_logs: {
        Row: {
          access_granted: boolean
          book_id: string
          content_type: string
          created_at: string
          denial_reason: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          access_granted?: boolean
          book_id: string
          content_type?: string
          created_at?: string
          denial_reason?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          access_granted?: boolean
          book_id?: string
          content_type?: string
          created_at?: string
          denial_reason?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_access_logs_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      content_access_tokens: {
        Row: {
          book_id: string
          content_type: string
          created_at: string
          expires_at: string
          id: string
          token: string
          used: boolean
          user_id: string
        }
        Insert: {
          book_id: string
          content_type?: string
          created_at?: string
          expires_at: string
          id?: string
          token: string
          used?: boolean
          user_id: string
        }
        Update: {
          book_id?: string
          content_type?: string
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
          used?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_access_tokens_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      content_consumption_time: {
        Row: {
          book_id: string
          created_at: string
          duration_seconds: number
          format: string
          id: string
          session_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          duration_seconds?: number
          format: string
          id?: string
          session_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          duration_seconds?: number
          format?: string
          id?: string
          session_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_consumption_time_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      content_edit_requests: {
        Row: {
          admin_notes: string | null
          content_id: string
          content_type: string
          created_at: string
          id: string
          proposed_changes: Json
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          content_id: string
          content_type: string
          created_at?: string
          id?: string
          proposed_changes?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          content_id?: string
          content_type?: string
          created_at?: string
          id?: string
          proposed_changes?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string
          updated_at?: string
        }
        Relationships: []
      }
      content_unlocks: {
        Row: {
          book_id: string
          coins_spent: number | null
          created_at: string
          format: string
          id: string
          status: string
          unlock_method: string
          user_id: string
        }
        Insert: {
          book_id: string
          coins_spent?: number | null
          created_at?: string
          format: string
          id?: string
          status?: string
          unlock_method?: string
          user_id: string
        }
        Update: {
          book_id?: string
          coins_spent?: number | null
          created_at?: string
          format?: string
          id?: string
          status?: string
          unlock_method?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_unlocks_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      contributor_earnings: {
        Row: {
          book_id: string
          created_at: string
          earned_amount: number
          format: string
          fulfillment_amount: number
          id: string
          order_id: string
          order_item_id: string
          percentage: number
          role: string
          sale_amount: number
          status: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          earned_amount?: number
          format: string
          fulfillment_amount?: number
          id?: string
          order_id: string
          order_item_id: string
          percentage?: number
          role: string
          sale_amount?: number
          status?: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          earned_amount?: number
          format?: string
          fulfillment_amount?: number
          id?: string
          order_id?: string
          order_item_id?: string
          percentage?: number
          role?: string
          sale_amount?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contributor_earnings_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributor_earnings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributor_earnings_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_usage: {
        Row: {
          coupon_id: string
          created_at: string
          discount_amount: number
          id: string
          order_id: string | null
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          discount_amount?: number
          id?: string
          order_id?: string | null
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          discount_amount?: number
          id?: string
          order_id?: string | null
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_usage_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          applies_to: string
          code: string
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          end_date: string | null
          first_order_only: boolean
          id: string
          min_order_amount: number | null
          per_user_limit: number | null
          start_date: string
          status: string
          updated_at: string
          usage_limit: number | null
          used_count: number
        }
        Insert: {
          applies_to?: string
          code: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          end_date?: string | null
          first_order_only?: boolean
          id?: string
          min_order_amount?: number | null
          per_user_limit?: number | null
          start_date?: string
          status?: string
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
        }
        Update: {
          applies_to?: string
          code?: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          end_date?: string | null
          first_order_only?: boolean
          id?: string
          min_order_amount?: number | null
          per_user_limit?: number | null
          start_date?: string
          status?: string
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
        }
        Relationships: []
      }
      daily_bandwidth_stats: {
        Row: {
          alert_level: string
          avg_session_bytes: number
          cache_hits: number
          cache_misses: number
          created_at: string
          id: string
          signed_urls_generated: number
          stat_date: string
          top_books_by_bandwidth: Json | null
          total_bytes_served: number
          total_requests: number
          updated_at: string
        }
        Insert: {
          alert_level?: string
          avg_session_bytes?: number
          cache_hits?: number
          cache_misses?: number
          created_at?: string
          id?: string
          signed_urls_generated?: number
          stat_date?: string
          top_books_by_bandwidth?: Json | null
          total_bytes_served?: number
          total_requests?: number
          updated_at?: string
        }
        Update: {
          alert_level?: string
          avg_session_bytes?: number
          cache_hits?: number
          cache_misses?: number
          created_at?: string
          id?: string
          signed_urls_generated?: number
          stat_date?: string
          top_books_by_bandwidth?: Json | null
          total_bytes_served?: number
          total_requests?: number
          updated_at?: string
        }
        Relationships: []
      }
      daily_book_stats: {
        Row: {
          book_id: string
          created_at: string
          id: string
          purchases: number
          reads: number
          stat_date: string
          unique_readers: number
          views: number
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          purchases?: number
          reads?: number
          stat_date?: string
          unique_readers?: number
          views?: number
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          purchases?: number
          reads?: number
          stat_date?: string
          unique_readers?: number
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_book_stats_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      default_revenue_rules: {
        Row: {
          created_at: string
          format: string
          fulfillment_cost_percentage: number
          id: string
          narrator_percentage: number
          platform_percentage: number
          publisher_percentage: number
          updated_at: string
          writer_percentage: number
        }
        Insert: {
          created_at?: string
          format: string
          fulfillment_cost_percentage?: number
          id?: string
          narrator_percentage?: number
          platform_percentage?: number
          publisher_percentage?: number
          updated_at?: string
          writer_percentage?: number
        }
        Update: {
          created_at?: string
          format?: string
          fulfillment_cost_percentage?: number
          id?: string
          narrator_percentage?: number
          platform_percentage?: number
          publisher_percentage?: number
          updated_at?: string
          writer_percentage?: number
        }
        Relationships: []
      }
      ebook_chapters: {
        Row: {
          book_format_id: string
          chapter_order: number
          chapter_title: string
          content: string | null
          created_at: string
          created_by: string | null
          file_url: string | null
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          book_format_id: string
          chapter_order: number
          chapter_title: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          file_url?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          book_format_id?: string
          chapter_order?: number
          chapter_title?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          file_url?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ebook_chapters_book_format_id_fkey"
            columns: ["book_format_id"]
            isOneToOne: false
            referencedRelation: "book_formats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebook_chapters_book_format_id_fkey"
            columns: ["book_format_id"]
            isOneToOne: false
            referencedRelation: "book_formats_public"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          recipient_email: string
          sent_at: string | null
          status: string
          subject: string
          template_type: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          recipient_email: string
          sent_at?: string | null
          status?: string
          subject?: string
          template_type: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          recipient_email?: string
          sent_at?: string | null
          status?: string
          subject?: string
          template_type?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body_html: string
          body_text: string
          created_at: string
          id: string
          name: string
          status: string
          subject: string
          template_type: string
          updated_at: string
          variables: string[] | null
        }
        Insert: {
          body_html?: string
          body_text?: string
          created_at?: string
          id?: string
          name: string
          status?: string
          subject?: string
          template_type: string
          updated_at?: string
          variables?: string[] | null
        }
        Update: {
          body_html?: string
          body_text?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
          subject?: string
          template_type?: string
          updated_at?: string
          variables?: string[] | null
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          profile_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          profile_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          profile_type?: string
          user_id?: string
        }
        Relationships: []
      }
      format_revenue_splits: {
        Row: {
          book_id: string
          created_at: string
          format: string
          fulfillment_cost_percentage: number
          id: string
          narrator_percentage: number
          platform_percentage: number
          publisher_percentage: number
          updated_at: string
          writer_percentage: number
        }
        Insert: {
          book_id: string
          created_at?: string
          format: string
          fulfillment_cost_percentage?: number
          id?: string
          narrator_percentage?: number
          platform_percentage?: number
          publisher_percentage?: number
          updated_at?: string
          writer_percentage?: number
        }
        Update: {
          book_id?: string
          created_at?: string
          format?: string
          fulfillment_cost_percentage?: number
          id?: string
          narrator_percentage?: number
          platform_percentage?: number
          publisher_percentage?: number
          updated_at?: string
          writer_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "format_revenue_splits_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      free_shipping_campaigns: {
        Row: {
          area_type: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          min_order_amount: number
          name: string
          updated_at: string
        }
        Insert: {
          area_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          min_order_amount?: number
          name: string
          updated_at?: string
        }
        Update: {
          area_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          min_order_amount?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      gamification_points: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          points: number
          reference_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          points?: number
          reference_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          points?: number
          reference_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      hero_banners: {
        Row: {
          created_at: string
          cta_link: string | null
          cta_text: string | null
          id: string
          image_url: string | null
          is_active: boolean
          sort_order: number
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          sort_order?: number
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          sort_order?: number
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      homepage_sections: {
        Row: {
          created_at: string
          display_source: string | null
          id: string
          is_enabled: boolean
          section_key: string
          sort_order: number
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_source?: string | null
          id?: string
          is_enabled?: boolean
          section_key: string
          sort_order?: number
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_source?: string | null
          id?: string
          is_enabled?: boolean
          section_key?: string
          sort_order?: number
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      listening_progress: {
        Row: {
          book_id: string
          created_at: string
          current_position: number | null
          current_track: number | null
          id: string
          last_listened_at: string | null
          percentage: number | null
          total_duration: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          current_position?: number | null
          current_track?: number | null
          id?: string
          last_listened_at?: string | null
          percentage?: number | null
          total_duration?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          current_position?: number | null
          current_track?: number | null
          id?: string
          last_listened_at?: string | null
          percentage?: number | null
          total_duration?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listening_progress_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      live_sessions: {
        Row: {
          created_at: string
          disconnect_reason: string | null
          ended_at: string | null
          id: string
          rj_user_id: string
          show_title: string | null
          started_at: string
          station_id: string | null
          status: string
          stream_url: string | null
        }
        Insert: {
          created_at?: string
          disconnect_reason?: string | null
          ended_at?: string | null
          id?: string
          rj_user_id: string
          show_title?: string | null
          started_at?: string
          station_id?: string | null
          status?: string
          stream_url?: string | null
        }
        Update: {
          created_at?: string
          disconnect_reason?: string | null
          ended_at?: string | null
          id?: string
          rj_user_id?: string
          show_title?: string | null
          started_at?: string
          station_id?: string | null
          status?: string
          stream_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_sessions_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "radio_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      narrators: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          email: string | null
          id: string
          is_featured: boolean | null
          is_trending: boolean | null
          linked_at: string | null
          name: string
          name_en: string | null
          phone: string | null
          priority: number
          rating: number | null
          specialty: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_featured?: boolean | null
          is_trending?: boolean | null
          linked_at?: string | null
          name: string
          name_en?: string | null
          phone?: string | null
          priority?: number
          rating?: number | null
          specialty?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_featured?: boolean | null
          is_trending?: boolean | null
          linked_at?: string | null
          name?: string
          name_en?: string | null
          phone?: string | null
          priority?: number
          rating?: number | null
          specialty?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_enabled: boolean
          id: string
          order_enabled: boolean
          promotional_enabled: boolean
          push_enabled: boolean
          reminder_enabled: boolean
          support_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_enabled?: boolean
          id?: string
          order_enabled?: boolean
          promotional_enabled?: boolean
          push_enabled?: boolean
          reminder_enabled?: boolean
          support_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_enabled?: boolean
          id?: string
          order_enabled?: boolean
          promotional_enabled?: boolean
          push_enabled?: boolean
          reminder_enabled?: boolean
          support_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          channel: string
          created_at: string
          cta_link: string | null
          cta_text: string | null
          id: string
          message: string
          name: string
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          id?: string
          message?: string
          name: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          id?: string
          message?: string
          name?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          audience: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          link: string | null
          message: string
          priority: string
          scheduled_at: string | null
          sent_at: string | null
          status: string
          target_user_id: string | null
          template_id: string | null
          title: string
          type: string
        }
        Insert: {
          audience?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          link?: string | null
          message: string
          priority?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          target_user_id?: string | null
          template_id?: string | null
          title: string
          type?: string
        }
        Update: {
          audience?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          link?: string | null
          message?: string
          priority?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          target_user_id?: string | null
          template_id?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          book_id: string | null
          created_at: string
          format: Database["public"]["Enums"]["book_format_type"]
          id: string
          order_id: string
          quantity: number | null
          unit_price: number
        }
        Insert: {
          book_id?: string | null
          created_at?: string
          format: Database["public"]["Enums"]["book_format_type"]
          id?: string
          order_id: string
          quantity?: number | null
          unit_price: number
        }
        Update: {
          book_id?: string | null
          created_at?: string
          format?: Database["public"]["Enums"]["book_format_type"]
          id?: string
          order_id?: string
          quantity?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          changed_by_name: string | null
          created_at: string
          id: string
          new_status: string
          notes: string | null
          old_status: string | null
          order_id: string
        }
        Insert: {
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          id?: string
          new_status: string
          notes?: string | null
          old_status?: string | null
          order_id: string
        }
        Update: {
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          id?: string
          new_status?: string
          notes?: string | null
          old_status?: string | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cod_collected_amount: number | null
          cod_payment_status: string
          cod_settled_at: string | null
          cod_settlement_reference: string | null
          coupon_code: string | null
          created_at: string
          discount_amount: number | null
          estimated_delivery_days: string | null
          fulfillment_cost: number | null
          id: string
          is_purchased: boolean | null
          notes: string | null
          order_number: string
          packaging_cost: number | null
          payment_method: string | null
          purchase_cost_per_unit: number | null
          shipping_address: string | null
          shipping_area: string | null
          shipping_carrier: string | null
          shipping_city: string | null
          shipping_cost: number | null
          shipping_district: string | null
          shipping_method_id: string | null
          shipping_method_name: string | null
          shipping_name: string | null
          shipping_phone: string | null
          shipping_zip: string | null
          status: string | null
          total_amount: number | null
          total_weight: number | null
          updated_at: string
          updated_by_admin: boolean | null
          user_id: string
        }
        Insert: {
          cod_collected_amount?: number | null
          cod_payment_status?: string
          cod_settled_at?: string | null
          cod_settlement_reference?: string | null
          coupon_code?: string | null
          created_at?: string
          discount_amount?: number | null
          estimated_delivery_days?: string | null
          fulfillment_cost?: number | null
          id?: string
          is_purchased?: boolean | null
          notes?: string | null
          order_number: string
          packaging_cost?: number | null
          payment_method?: string | null
          purchase_cost_per_unit?: number | null
          shipping_address?: string | null
          shipping_area?: string | null
          shipping_carrier?: string | null
          shipping_city?: string | null
          shipping_cost?: number | null
          shipping_district?: string | null
          shipping_method_id?: string | null
          shipping_method_name?: string | null
          shipping_name?: string | null
          shipping_phone?: string | null
          shipping_zip?: string | null
          status?: string | null
          total_amount?: number | null
          total_weight?: number | null
          updated_at?: string
          updated_by_admin?: boolean | null
          user_id: string
        }
        Update: {
          cod_collected_amount?: number | null
          cod_payment_status?: string
          cod_settled_at?: string | null
          cod_settlement_reference?: string | null
          coupon_code?: string | null
          created_at?: string
          discount_amount?: number | null
          estimated_delivery_days?: string | null
          fulfillment_cost?: number | null
          id?: string
          is_purchased?: boolean | null
          notes?: string | null
          order_number?: string
          packaging_cost?: number | null
          payment_method?: string | null
          purchase_cost_per_unit?: number | null
          shipping_address?: string | null
          shipping_area?: string | null
          shipping_carrier?: string | null
          shipping_city?: string | null
          shipping_cost?: number | null
          shipping_district?: string | null
          shipping_method_id?: string | null
          shipping_method_name?: string | null
          shipping_name?: string | null
          shipping_phone?: string | null
          shipping_zip?: string | null
          status?: string | null
          total_amount?: number | null
          total_weight?: number | null
          updated_at?: string
          updated_by_admin?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          event_type: string
          gateway: string
          id: string
          order_id: string | null
          raw_response: Json | null
          status: string
          transaction_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          event_type?: string
          gateway?: string
          id?: string
          order_id?: string | null
          raw_response?: Json | null
          status?: string
          transaction_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          event_type?: string
          gateway?: string
          id?: string
          order_id?: string | null
          raw_response?: Json | null
          status?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateways: {
        Row: {
          config: Json
          created_at: string
          gateway_key: string
          id: string
          is_enabled: boolean
          label: string
          mode: string | null
          notes: string | null
          sort_priority: number
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          gateway_key: string
          id?: string
          is_enabled?: boolean
          label: string
          mode?: string | null
          notes?: string | null
          sort_priority?: number
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          gateway_key?: string
          id?: string
          is_enabled?: boolean
          label?: string
          mode?: string | null
          notes?: string | null
          sort_priority?: number
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string | null
          order_id: string
          status: string | null
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method?: string | null
          order_id: string
          status?: string | null
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string | null
          order_id?: string
          status?: string | null
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          daily_reward_last_claimed: string | null
          deleted_at: string | null
          deleted_reason: string | null
          display_name: string | null
          experience: string | null
          facebook_url: string | null
          full_name: string | null
          genre: string | null
          id: string
          instagram_url: string | null
          is_active: boolean
          phone: string | null
          portfolio_url: string | null
          preferred_language: string | null
          referral_code: string | null
          referred_by: string | null
          specialty: string | null
          updated_at: string
          user_id: string
          website_url: string | null
          youtube_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          daily_reward_last_claimed?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          display_name?: string | null
          experience?: string | null
          facebook_url?: string | null
          full_name?: string | null
          genre?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          phone?: string | null
          portfolio_url?: string | null
          preferred_language?: string | null
          referral_code?: string | null
          referred_by?: string | null
          specialty?: string | null
          updated_at?: string
          user_id: string
          website_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          daily_reward_last_claimed?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          display_name?: string | null
          experience?: string | null
          facebook_url?: string | null
          full_name?: string | null
          genre?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          phone?: string | null
          portfolio_url?: string | null
          preferred_language?: string | null
          referral_code?: string | null
          referred_by?: string | null
          specialty?: string | null
          updated_at?: string
          user_id?: string
          website_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      publishers: {
        Row: {
          created_at: string
          description: string | null
          email: string | null
          id: string
          is_featured: boolean | null
          is_trending: boolean | null
          is_verified: boolean | null
          linked_at: string | null
          logo_url: string | null
          name: string
          name_en: string | null
          phone: string | null
          priority: number
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          is_featured?: boolean | null
          is_trending?: boolean | null
          is_verified?: boolean | null
          linked_at?: string | null
          logo_url?: string | null
          name: string
          name_en?: string | null
          phone?: string | null
          priority?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          is_featured?: boolean | null
          is_trending?: boolean | null
          is_verified?: boolean | null
          linked_at?: string | null
          logo_url?: string | null
          name?: string
          name_en?: string | null
          phone?: string | null
          priority?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      r2_retry_queue: {
        Row: {
          attempts: number | null
          book_id: string | null
          content_type: string
          created_at: string | null
          error_message: string | null
          id: string
          max_attempts: number | null
          resolved_at: string | null
          status: string | null
          track_number: number | null
          type: string
          updated_at: string | null
        }
        Insert: {
          attempts?: number | null
          book_id?: string | null
          content_type?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          max_attempts?: number | null
          resolved_at?: string | null
          status?: string | null
          track_number?: number | null
          type?: string
          updated_at?: string | null
        }
        Update: {
          attempts?: number | null
          book_id?: string | null
          content_type?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          max_attempts?: number | null
          resolved_at?: string | null
          status?: string | null
          track_number?: number | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "r2_retry_queue_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      r2_rollout_config: {
        Row: {
          auto_scale_enabled: boolean
          created_at: string
          current_percent: number
          id: number
          last_adjusted_at: string | null
          last_adjustment_reason: string | null
          max_percent: number
          min_percent: number
          scale_down_threshold: number
          scale_up_threshold: number
          step_size: number
          updated_at: string
        }
        Insert: {
          auto_scale_enabled?: boolean
          created_at?: string
          current_percent?: number
          id?: number
          last_adjusted_at?: string | null
          last_adjustment_reason?: string | null
          max_percent?: number
          min_percent?: number
          scale_down_threshold?: number
          scale_up_threshold?: number
          step_size?: number
          updated_at?: string
        }
        Update: {
          auto_scale_enabled?: boolean
          created_at?: string
          current_percent?: number
          id?: number
          last_adjusted_at?: string | null
          last_adjustment_reason?: string | null
          max_percent?: number
          min_percent?: number
          scale_down_threshold?: number
          scale_up_threshold?: number
          step_size?: number
          updated_at?: string
        }
        Relationships: []
      }
      r2_rollout_metrics: {
        Row: {
          auto_adjusted: boolean
          circuit_breaker_safe_percent: number | null
          circuit_breaker_tripped: boolean | null
          created_at: string
          error_rate_r2: number
          error_rate_supabase: number
          fallback_count: number
          id: string
          playback_failures: number
          playback_successes: number
          r2_errors: number
          r2_requests: number
          r2_signed_url_failures: number
          rollout_percent: number
          stat_date: string
          supabase_errors: number
          supabase_requests: number
          updated_at: string
        }
        Insert: {
          auto_adjusted?: boolean
          circuit_breaker_safe_percent?: number | null
          circuit_breaker_tripped?: boolean | null
          created_at?: string
          error_rate_r2?: number
          error_rate_supabase?: number
          fallback_count?: number
          id?: string
          playback_failures?: number
          playback_successes?: number
          r2_errors?: number
          r2_requests?: number
          r2_signed_url_failures?: number
          rollout_percent?: number
          stat_date?: string
          supabase_errors?: number
          supabase_requests?: number
          updated_at?: string
        }
        Update: {
          auto_adjusted?: boolean
          circuit_breaker_safe_percent?: number | null
          circuit_breaker_tripped?: boolean | null
          created_at?: string
          error_rate_r2?: number
          error_rate_supabase?: number
          fallback_count?: number
          id?: string
          playback_failures?: number
          playback_successes?: number
          r2_errors?: number
          r2_requests?: number
          r2_signed_url_failures?: number
          rollout_percent?: number
          stat_date?: string
          supabase_errors?: number
          supabase_requests?: number
          updated_at?: string
        }
        Relationships: []
      }
      radio_stations: {
        Row: {
          artwork_url: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          stream_url: string
          updated_at: string
        }
        Insert: {
          artwork_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          stream_url: string
          updated_at?: string
        }
        Update: {
          artwork_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          stream_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      reading_progress: {
        Row: {
          book_id: string
          created_at: string
          current_page: number | null
          id: string
          last_read_at: string | null
          percentage: number | null
          total_pages: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          current_page?: number | null
          id?: string
          last_read_at?: string | null
          percentage?: number | null
          total_pages?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          current_page?: number | null
          id?: string
          last_read_at?: string | null
          percentage?: number | null
          total_pages?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_progress_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          ip_address: string | null
          referral_code: string
          referred_user_id: string | null
          referrer_id: string
          reward_amount: number
          reward_status: string
          source: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          referral_code: string
          referred_user_id?: string | null
          referrer_id: string
          reward_amount?: number
          reward_status?: string
          source?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          referral_code?: string
          referred_user_id?: string | null
          referrer_id?: string
          reward_amount?: number
          reward_status?: string
          source?: string | null
          status?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          book_id: string
          comment: string | null
          created_at: string
          id: string
          rating: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      rewarded_ad_logs: {
        Row: {
          ad_event_id: string
          coins_rewarded: number
          created_at: string
          id: string
          placement_key: string | null
          status: string
          user_id: string
        }
        Insert: {
          ad_event_id: string
          coins_rewarded?: number
          created_at?: string
          id?: string
          placement_key?: string | null
          status?: string
          user_id: string
        }
        Update: {
          ad_event_id?: string
          coins_rewarded?: number
          created_at?: string
          id?: string
          placement_key?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      rj_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          is_approved: boolean
          phone: string | null
          specialty: string | null
          stage_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_approved?: boolean
          phone?: string | null
          specialty?: string | null
          stage_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_approved?: boolean
          phone?: string | null
          specialty?: string | null
          stage_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      role_applications: {
        Row: {
          admin_notes: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          email: string | null
          experience: string | null
          facebook_url: string | null
          full_name: string | null
          id: string
          instagram_url: string | null
          is_enabled: boolean | null
          message: string | null
          phone: string | null
          portfolio_url: string | null
          priority: number | null
          requested_role: Database["public"]["Enums"]["app_role"]
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
          verified: boolean | null
          website_url: string | null
          youtube_url: string | null
        }
        Insert: {
          admin_notes?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          experience?: string | null
          facebook_url?: string | null
          full_name?: string | null
          id?: string
          instagram_url?: string | null
          is_enabled?: boolean | null
          message?: string | null
          phone?: string | null
          portfolio_url?: string | null
          priority?: number | null
          requested_role: Database["public"]["Enums"]["app_role"]
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
          verified?: boolean | null
          website_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          admin_notes?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          experience?: string | null
          facebook_url?: string | null
          full_name?: string | null
          id?: string
          instagram_url?: string | null
          is_enabled?: boolean | null
          message?: string | null
          phone?: string | null
          portfolio_url?: string | null
          priority?: number | null
          requested_role?: Database["public"]["Enums"]["app_role"]
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          verified?: boolean | null
          website_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      role_change_logs: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string
          id: string
          new_role: string | null
          old_role: string | null
          user_id: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_role?: string | null
          old_role?: string | null
          user_id: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_role?: string | null
          old_role?: string | null
          user_id?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          module: string
          role_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module: string
          role_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "admin_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_events: {
        Row: {
          event_time: string
          id: string
          message: string | null
          raw_payload: Json | null
          shipment_id: string
          status: string
        }
        Insert: {
          event_time?: string
          id?: string
          message?: string | null
          raw_payload?: Json | null
          shipment_id: string
          status: string
        }
        Update: {
          event_time?: string
          id?: string
          message?: string | null
          raw_payload?: Json | null
          shipment_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          address: string | null
          area: string | null
          courier_name: string | null
          created_at: string
          delivery_charge: number
          district: string | null
          id: string
          order_id: string
          parcel_id: string | null
          postal_code: string | null
          provider_code: string | null
          recipient_name: string | null
          recipient_phone: string | null
          request_payload: Json | null
          response_payload: Json | null
          shipping_method_code: string | null
          status: string
          total_weight: number
          tracking_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          area?: string | null
          courier_name?: string | null
          created_at?: string
          delivery_charge?: number
          district?: string | null
          id?: string
          order_id: string
          parcel_id?: string | null
          postal_code?: string | null
          provider_code?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          shipping_method_code?: string | null
          status?: string
          total_weight?: number
          tracking_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          area?: string | null
          courier_name?: string | null
          created_at?: string
          delivery_charge?: number
          district?: string | null
          id?: string
          order_id?: string
          parcel_id?: string | null
          postal_code?: string | null
          provider_code?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          shipping_method_code?: string | null
          status?: string
          total_weight?: number
          tracking_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_methods: {
        Row: {
          area_type: string
          base_charge: number
          base_weight_kg: number
          code: string
          created_at: string
          delivery_time: string | null
          extra_charge_per_kg: number
          id: string
          is_active: boolean
          name: string
          provider_code: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          area_type?: string
          base_charge?: number
          base_weight_kg?: number
          code: string
          created_at?: string
          delivery_time?: string | null
          extra_charge_per_kg?: number
          id?: string
          is_active?: boolean
          name: string
          provider_code?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          area_type?: string
          base_charge?: number
          base_weight_kg?: number
          code?: string
          created_at?: string
          delivery_time?: string | null
          extra_charge_per_kg?: number
          id?: string
          is_active?: boolean
          name?: string
          provider_code?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      show_schedules: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          rj_user_id: string
          show_title: string
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          rj_user_id: string
          show_title: string
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          rj_user_id?: string
          show_title?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          category: string
          created_at: string
          id: string
          is_enabled: boolean
          label: string
          setting_key: string
          setting_type: string
          setting_value: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          label?: string
          setting_key: string
          setting_type?: string
          setting_value?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          label?: string
          setting_key?: string
          setting_type?: string
          setting_value?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      sms_logs: {
        Row: {
          api_response: Json | null
          created_at: string
          id: string
          message: string
          recipient_group: string | null
          recipient_name: string | null
          recipient_phone: string
          sent_by: string | null
          status: string
        }
        Insert: {
          api_response?: Json | null
          created_at?: string
          id?: string
          message: string
          recipient_group?: string | null
          recipient_name?: string | null
          recipient_phone: string
          sent_by?: string | null
          status?: string
        }
        Update: {
          api_response?: Json | null
          created_at?: string
          id?: string
          message?: string
          recipient_group?: string | null
          recipient_name?: string | null
          recipient_phone?: string
          sent_by?: string | null
          status?: string
        }
        Relationships: []
      }
      sms_templates: {
        Row: {
          content: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          access_type: string
          benefits: Json
          billing_type: string
          code: string
          created_at: string
          description: string | null
          id: string
          is_featured: boolean
          name: string
          price: number
          sort_order: number
          status: string
          trial_days: number | null
          updated_at: string
        }
        Insert: {
          access_type?: string
          benefits?: Json
          billing_type?: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_featured?: boolean
          name: string
          price?: number
          sort_order?: number
          status?: string
          trial_days?: number | null
          updated_at?: string
        }
        Update: {
          access_type?: string
          benefits?: Json
          billing_type?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_featured?: boolean
          name?: string
          price?: number
          sort_order?: number
          status?: string
          trial_days?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          attachment_url: string | null
          category: string
          created_at: string
          id: string
          message: string
          priority: string
          status: string
          subject: string
          ticket_number: string
          type: string
          updated_at: string
          user_email: string | null
          user_id: string
          user_name: string | null
          user_phone: string | null
        }
        Insert: {
          assigned_to?: string | null
          attachment_url?: string | null
          category?: string
          created_at?: string
          id?: string
          message: string
          priority?: string
          status?: string
          subject: string
          ticket_number?: string
          type?: string
          updated_at?: string
          user_email?: string | null
          user_id: string
          user_name?: string | null
          user_phone?: string | null
        }
        Update: {
          assigned_to?: string | null
          attachment_url?: string | null
          category?: string
          created_at?: string
          id?: string
          message?: string
          priority?: string
          status?: string
          subject?: string
          ticket_number?: string
          type?: string
          updated_at?: string
          user_email?: string | null
          user_id?: string
          user_name?: string | null
          user_phone?: string | null
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      system_alerts: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          is_resolved: boolean
          message: string | null
          metadata: Json | null
          metric_value: number | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          threshold: number | null
          title: string
        }
        Insert: {
          alert_type?: string
          created_at?: string
          id?: string
          is_resolved?: boolean
          message?: string | null
          metadata?: Json | null
          metric_value?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          threshold?: number | null
          title: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          is_resolved?: boolean
          message?: string | null
          metadata?: Json | null
          metric_value?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          threshold?: number | null
          title?: string
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          created_at: string | null
          fingerprint: string | null
          first_seen_at: string | null
          id: string
          last_seen_at: string | null
          level: string
          message: string
          metadata: Json | null
          module: string
          occurrence_count: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          fingerprint?: string | null
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          level?: string
          message: string
          metadata?: Json | null
          module?: string
          occurrence_count?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          fingerprint?: string | null
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          level?: string
          message?: string
          metadata?: Json | null
          module?: string
          occurrence_count?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      system_performance_logs: {
        Row: {
          created_at: string
          endpoint: string | null
          error_message: string | null
          function_name: string
          id: string
          metadata: Json | null
          response_time_ms: number | null
          status_code: number | null
        }
        Insert: {
          created_at?: string
          endpoint?: string | null
          error_message?: string | null
          function_name: string
          id?: string
          metadata?: Json | null
          response_time_ms?: number | null
          status_code?: number | null
        }
        Update: {
          created_at?: string
          endpoint?: string | null
          error_message?: string | null
          function_name?: string
          id?: string
          metadata?: Json | null
          response_time_ms?: number | null
          status_code?: number | null
        }
        Relationships: []
      }
      ticket_replies: {
        Row: {
          attachment_url: string | null
          created_at: string
          id: string
          is_admin: boolean
          is_internal: boolean
          message: string
          sender_name: string | null
          ticket_id: string
          user_id: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          id?: string
          is_admin?: boolean
          is_internal?: boolean
          message: string
          sender_name?: string | null
          ticket_id: string
          user_id: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          id?: string
          is_admin?: boolean
          is_internal?: boolean
          message?: string
          sender_name?: string | null
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_replies_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tts_audio: {
        Row: {
          audio_url: string | null
          chapter_id: string
          created_at: string
          duration_seconds: number | null
          error_message: string | null
          file_size_bytes: number | null
          id: string
          status: string
          updated_at: string
          voice_id: string
        }
        Insert: {
          audio_url?: string | null
          chapter_id: string
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string
          status?: string
          updated_at?: string
          voice_id: string
        }
        Update: {
          audio_url?: string | null
          chapter_id?: string
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string
          status?: string
          updated_at?: string
          voice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tts_audio_voice_id_fkey"
            columns: ["voice_id"]
            isOneToOne: false
            referencedRelation: "voices"
            referencedColumns: ["id"]
          },
        ]
      }
      tts_paragraph_cache: {
        Row: {
          audio_url: string | null
          book_id: string | null
          cache_key: string | null
          created_at: string
          error_message: string | null
          file_size_bytes: number | null
          id: string
          model_id: string | null
          status: string
          text_hash: string
          updated_at: string
          voice_id: string | null
        }
        Insert: {
          audio_url?: string | null
          book_id?: string | null
          cache_key?: string | null
          created_at?: string
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string
          model_id?: string | null
          status?: string
          text_hash: string
          updated_at?: string
          voice_id?: string | null
        }
        Update: {
          audio_url?: string | null
          book_id?: string | null
          cache_key?: string | null
          created_at?: string
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string
          model_id?: string | null
          status?: string
          text_hash?: string
          updated_at?: string
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tts_paragraph_cache_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_logs: {
        Row: {
          book_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          book_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          book_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_logs_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badge_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_coins: {
        Row: {
          balance: number
          created_at: string
          id: string
          total_earned: number
          total_spent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          total_earned?: number
          total_spent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          total_earned?: number
          total_spent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_goals: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_value: number | null
          goal_type: string
          id: string
          period: string
          started_at: string | null
          status: string
          target_value: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_value?: number | null
          goal_type?: string
          id?: string
          period?: string
          started_at?: string | null
          status?: string
          target_value?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_value?: number | null
          goal_type?: string
          id?: string
          period?: string
          started_at?: string | null
          status?: string
          target_value?: number
          user_id?: string
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          notification_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          notification_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          notification_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permission_overrides: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          is_allowed: boolean
          notes: string | null
          permission_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          is_allowed?: boolean
          notes?: string | null
          permission_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          is_allowed?: boolean
          notes?: string | null
          permission_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_presence: {
        Row: {
          activity_type: string
          created_at: string
          current_book_id: string | null
          current_page: string | null
          id: string
          last_seen: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          activity_type?: string
          created_at?: string
          current_book_id?: string | null
          current_page?: string | null
          id?: string
          last_seen?: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          current_book_id?: string | null
          current_page?: string | null
          id?: string
          last_seen?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_presence_current_book_id_fkey"
            columns: ["current_book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      user_purchases: {
        Row: {
          amount: number
          book_id: string
          created_at: string
          format: string
          id: string
          payment_method: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          book_id: string
          created_at?: string
          format?: string
          id?: string
          payment_method?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          book_id?: string
          created_at?: string
          format?: string
          id?: string
          payment_method?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_purchases_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_streaks: {
        Row: {
          best_streak: number | null
          created_at: string | null
          current_streak: number | null
          id: string
          last_activity_date: string | null
          streak_updated_at: string | null
          user_id: string
        }
        Insert: {
          best_streak?: number | null
          created_at?: string | null
          current_streak?: number | null
          id?: string
          last_activity_date?: string | null
          streak_updated_at?: string | null
          user_id: string
        }
        Update: {
          best_streak?: number | null
          created_at?: string | null
          current_streak?: number | null
          id?: string
          last_activity_date?: string | null
          streak_updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          amount_paid: number | null
          coupon_code: string | null
          created_at: string
          discount_amount: number | null
          end_date: string | null
          id: string
          plan_id: string
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_paid?: number | null
          coupon_code?: string | null
          created_at?: string
          discount_amount?: number | null
          end_date?: string | null
          id?: string
          plan_id: string
          start_date?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_paid?: number | null
          coupon_code?: string | null
          created_at?: string
          discount_amount?: number | null
          end_date?: string | null
          id?: string
          plan_id?: string
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      voices: {
        Row: {
          created_at: string
          gender: string | null
          id: string
          is_active: boolean
          language: string
          name: string
          provider_voice_id: string
          sample_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          gender?: string | null
          id?: string
          is_active?: boolean
          language?: string
          name: string
          provider_voice_id: string
          sample_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          gender?: string | null
          id?: string
          is_active?: boolean
          language?: string
          name?: string
          provider_voice_id?: string
          sample_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          account_info: string | null
          admin_notes: string | null
          amount: number
          created_at: string
          id: string
          method: string
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_info?: string | null
          admin_notes?: string | null
          amount: number
          created_at?: string
          id?: string
          method?: string
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_info?: string | null
          admin_notes?: string | null
          amount?: number
          created_at?: string
          id?: string
          method?: string
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      authors_public: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          genre: string | null
          id: string | null
          is_featured: boolean | null
          is_trending: boolean | null
          name: string | null
          name_en: string | null
          priority: number | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          genre?: string | null
          id?: string | null
          is_featured?: boolean | null
          is_trending?: boolean | null
          name?: string | null
          name_en?: string | null
          priority?: number | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          genre?: string | null
          id?: string | null
          is_featured?: boolean | null
          is_trending?: boolean | null
          name?: string | null
          name_en?: string | null
          priority?: number | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      book_formats_public: {
        Row: {
          audio_quality: Database["public"]["Enums"]["audio_quality"] | null
          binding: Database["public"]["Enums"]["binding_type"] | null
          book_id: string | null
          chapters_count: number | null
          created_at: string | null
          delivery_days: number | null
          dimensions: string | null
          discount: number | null
          duration: string | null
          file_size: string | null
          format: Database["public"]["Enums"]["book_format_type"] | null
          id: string | null
          in_stock: boolean | null
          is_available: boolean | null
          narrator_id: string | null
          original_price: number | null
          pages: number | null
          preview_chapters: number | null
          preview_percentage: number | null
          price: number | null
          stock_count: number | null
          submission_status: string | null
          updated_at: string | null
          weight: string | null
        }
        Insert: {
          audio_quality?: Database["public"]["Enums"]["audio_quality"] | null
          binding?: Database["public"]["Enums"]["binding_type"] | null
          book_id?: string | null
          chapters_count?: number | null
          created_at?: string | null
          delivery_days?: number | null
          dimensions?: string | null
          discount?: number | null
          duration?: string | null
          file_size?: string | null
          format?: Database["public"]["Enums"]["book_format_type"] | null
          id?: string | null
          in_stock?: boolean | null
          is_available?: boolean | null
          narrator_id?: string | null
          original_price?: number | null
          pages?: number | null
          preview_chapters?: number | null
          preview_percentage?: number | null
          price?: number | null
          stock_count?: number | null
          submission_status?: string | null
          updated_at?: string | null
          weight?: string | null
        }
        Update: {
          audio_quality?: Database["public"]["Enums"]["audio_quality"] | null
          binding?: Database["public"]["Enums"]["binding_type"] | null
          book_id?: string | null
          chapters_count?: number | null
          created_at?: string | null
          delivery_days?: number | null
          dimensions?: string | null
          discount?: number | null
          duration?: string | null
          file_size?: string | null
          format?: Database["public"]["Enums"]["book_format_type"] | null
          id?: string | null
          in_stock?: boolean | null
          is_available?: boolean | null
          narrator_id?: string | null
          original_price?: number | null
          pages?: number | null
          preview_chapters?: number | null
          preview_percentage?: number | null
          price?: number | null
          stock_count?: number | null
          submission_status?: string | null
          updated_at?: string | null
          weight?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "book_formats_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_formats_narrator_id_fkey"
            columns: ["narrator_id"]
            isOneToOne: false
            referencedRelation: "narrators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_formats_narrator_id_fkey"
            columns: ["narrator_id"]
            isOneToOne: false
            referencedRelation: "narrators_public"
            referencedColumns: ["id"]
          },
        ]
      }
      narrators_public: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          id: string | null
          is_featured: boolean | null
          is_trending: boolean | null
          name: string | null
          name_en: string | null
          priority: number | null
          rating: number | null
          specialty: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          id?: string | null
          is_featured?: boolean | null
          is_trending?: boolean | null
          name?: string | null
          name_en?: string | null
          priority?: number | null
          rating?: number | null
          specialty?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          id?: string | null
          is_featured?: boolean | null
          is_trending?: boolean | null
          name?: string | null
          name_en?: string | null
          priority?: number | null
          rating?: number | null
          specialty?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles_public: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          preferred_language: string | null
          referral_code: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          preferred_language?: string | null
          referral_code?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          preferred_language?: string | null
          referral_code?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      publishers_public: {
        Row: {
          created_at: string | null
          description: string | null
          id: string | null
          is_featured: boolean | null
          is_trending: boolean | null
          is_verified: boolean | null
          logo_url: string | null
          name: string | null
          name_en: string | null
          priority: number | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_featured?: boolean | null
          is_trending?: boolean | null
          is_verified?: boolean | null
          logo_url?: string | null
          name?: string | null
          name_en?: string | null
          priority?: number | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_featured?: boolean | null
          is_trending?: boolean | null
          is_verified?: boolean | null
          logo_url?: string | null
          name?: string | null
          name_en?: string | null
          priority?: number | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      adjust_user_coins:
        | {
            Args: {
              p_amount: number
              p_description?: string
              p_reference_id?: string
              p_type: string
              p_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_amount: number
              p_description?: string
              p_reference_id?: string
              p_source?: string
              p_type: string
              p_user_id: string
            }
            Returns: Json
          }
      admin_confirm_earnings: {
        Args: { p_earning_ids: string[] }
        Returns: Json
      }
      admin_get_all_profiles: {
        Args: never
        Returns: {
          avatar_url: string
          bio: string
          created_at: string
          deleted_at: string
          deleted_reason: string
          display_name: string
          full_name: string
          is_active: boolean
          phone: string
          user_id: string
        }[]
      }
      admin_get_authors: {
        Args: never
        Returns: {
          avatar_url: string
          bio: string
          created_at: string
          email: string
          genre: string
          id: string
          is_featured: boolean
          is_trending: boolean
          name: string
          name_en: string
          phone: string
          priority: number
          status: string
          updated_at: string
          user_id: string
        }[]
      }
      admin_get_narrators: {
        Args: never
        Returns: {
          avatar_url: string
          bio: string
          created_at: string
          email: string
          id: string
          is_featured: boolean
          is_trending: boolean
          name: string
          name_en: string
          phone: string
          priority: number
          rating: number
          specialty: string
          status: string
          updated_at: string
          user_id: string
        }[]
      }
      admin_get_payment_gateways: {
        Args: never
        Returns: {
          config: Json
          created_at: string
          gateway_key: string
          id: string
          is_enabled: boolean
          label: string
          mode: string
          notes: string
          sort_priority: number
          updated_at: string
        }[]
      }
      admin_get_publishers: {
        Args: never
        Returns: {
          created_at: string
          description: string
          email: string
          id: string
          is_featured: boolean
          is_trending: boolean
          is_verified: boolean
          logo_url: string
          name: string
          name_en: string
          phone: string
          priority: number
          status: string
          updated_at: string
          user_id: string
        }[]
      }
      admin_get_user_profile: { Args: { p_user_id: string }; Returns: Json }
      admin_restore_user: { Args: { p_user_id: string }; Returns: undefined }
      admin_soft_delete_user: {
        Args: { p_reason?: string; p_user_id: string }
        Returns: undefined
      }
      admin_update_profile: {
        Args: {
          p_bio?: string
          p_display_name?: string
          p_full_name?: string
          p_is_active?: boolean
          p_phone?: string
          p_user_id: string
        }
        Returns: Json
      }
      check_content_access: {
        Args: { p_book_id: string; p_format: string; p_user_id: string }
        Returns: Json
      }
      check_hybrid_access: {
        Args: { p_book_id: string; p_format: string; p_user_id: string }
        Returns: Json
      }
      check_stock: { Args: { p_items: Json }; Returns: Json }
      claim_ad_reward: { Args: { p_ad_placement?: string }; Returns: Json }
      claim_daily_login_reward: { Args: never; Returns: Json }
      cleanup_old_system_logs: { Args: never; Returns: number }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_active_connections: {
        Args: never
        Returns: {
          pid: number
          query_preview: string
          query_start: string
          state: string
          wait_event: string
        }[]
      }
      get_cache_hit_ratio: { Args: never; Returns: Json }
      get_connection_pool_stats: { Args: never; Returns: Json }
      get_db_size: { Args: never; Returns: Json }
      get_enabled_gateways: {
        Args: never
        Returns: {
          gateway_key: string
          label: string
          sort_priority: number
        }[]
      }
      get_index_usage: {
        Args: never
        Returns: {
          idx_scan: number
          idx_tup_fetch: number
          idx_tup_read: number
          index_name: string
          size: string
          table_name: string
        }[]
      }
      get_lock_info: {
        Args: never
        Returns: {
          granted: boolean
          lock_type: string
          mode: string
          pid: number
          relation_name: string
        }[]
      }
      get_slow_queries: {
        Args: never
        Returns: {
          duration_ms: number
          pid: number
          query_preview: string
          state: string
        }[]
      }
      get_table_stats: {
        Args: never
        Returns: {
          estimated_rows: number
          index_size: string
          table_name: string
          total_size: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_book_reads: { Args: { p_book_id: string }; Returns: undefined }
      log_consumption_time: {
        Args: { p_book_id: string; p_format: string; p_seconds: number }
        Returns: undefined
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      post_rating: {
        Args: { p_book_id: string; p_rating: number }
        Returns: Json
      }
      post_read_increment: { Args: { p_book_id: string }; Returns: Json }
      post_review: {
        Args: { p_book_id: string; p_rating: number; p_review_text: string }
        Returns: Json
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      refresh_book_review_stats: { Args: { p_book_id: string }; Returns: Json }
      reserve_stock: {
        Args: { p_book_id: string; p_format: string; p_quantity: number }
        Returns: boolean
      }
      sync_book_contributors: {
        Args: { p_book_id: string }
        Returns: undefined
      }
      upsert_system_log: {
        Args: {
          p_fingerprint?: string
          p_level: string
          p_message: string
          p_metadata?: Json
          p_module: string
          p_user_id?: string
        }
        Returns: string
      }
      user_has_book_access: {
        Args: { p_book_id: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "moderator"
        | "user"
        | "writer"
        | "publisher"
        | "narrator"
        | "rj"
      audio_quality: "standard" | "hd"
      binding_type: "paperback" | "hardcover"
      book_format_type: "ebook" | "audiobook" | "hardcopy"
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
    Enums: {
      app_role: [
        "admin",
        "moderator",
        "user",
        "writer",
        "publisher",
        "narrator",
        "rj",
      ],
      audio_quality: ["standard", "hd"],
      binding_type: ["paperback", "hardcover"],
      book_format_type: ["ebook", "audiobook", "hardcopy"],
    },
  },
} as const
