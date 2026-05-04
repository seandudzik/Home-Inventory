export type HouseholdRole = "owner" | "member";
export type RecurrenceType = "one_time" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
export type MaintenanceStatus = "pending" | "completed" | "skipped" | "overdue";

// ── Row types ────────────────────────────────────────────────────────────────

export interface Household {
  id: string;
  name: string;
  created_at: string;
}

export interface HouseholdMember {
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  display_name: string;
  joined_at: string;
}

export interface Room {
  id: string;
  household_id: string;
  name: string;
  floor: number | null;
  icon: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  household_id: string;
  parent_category_id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  household_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface Item {
  id: string;
  household_id: string;
  room_id: string | null;
  category_id: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  warranty_expires_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ItemTag {
  item_id: string;
  tag_id: string;
}

export interface ItemAttachment {
  id: string;
  item_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  is_primary_image: boolean;
  uploaded_by: string;
  created_at: string;
}

export interface MaintenanceSchedule {
  id: string;
  item_id: string;
  name: string;
  description: string | null;
  recurrence_type: RecurrenceType;
  recurrence_interval: number | null;
  start_date: string;
  end_date: string | null;
  estimated_duration_minutes: number | null;
  estimated_cost: number | null;
  assigned_to: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceEvent {
  id: string;
  schedule_id: string;
  item_id: string;
  scheduled_date: string;
  status: MaintenanceStatus;
  completed_at: string | null;
  completed_by: string | null;
  actual_cost: number | null;
  notes: string | null;
  calendar_event_id: string | null;
  created_at: string;
  updated_at: string;
}

// ── Supabase Database generic ─────────────────────────────────────────────────
// Must include Relationships, Views, Enums, CompositeTypes for the client
// generic to resolve Insert/Update types correctly (supabase-js v2 requirement).

export type Database = {
  public: {
    Tables: {
      households: {
        Row: Household;
        Insert: { id?: string; name: string; created_at?: string };
        Update: { name?: string };
        Relationships: [];
      };
      household_members: {
        Row: HouseholdMember;
        Insert: { household_id: string; user_id: string; role?: HouseholdRole; display_name: string; joined_at?: string };
        Update: { role?: HouseholdRole; display_name?: string };
        Relationships: [];
      };
      rooms: {
        Row: Room;
        Insert: { id?: string; household_id: string; name: string; floor?: number | null; icon?: string | null; created_at?: string; updated_at?: string };
        Update: { name?: string; floor?: number | null; icon?: string | null };
        Relationships: [];
      };
      categories: {
        Row: Category;
        Insert: { id?: string; household_id: string; parent_category_id?: string | null; name: string; icon?: string | null; color?: string | null; created_at?: string; updated_at?: string };
        Update: { parent_category_id?: string | null; name?: string; icon?: string | null; color?: string | null };
        Relationships: [];
      };
      tags: {
        Row: Tag;
        Insert: { id?: string; household_id: string; name: string; color?: string | null; created_at?: string };
        Update: { name?: string; color?: string | null };
        Relationships: [];
      };
      items: {
        Row: Item;
        Insert: { id?: string; household_id: string; room_id?: string | null; category_id?: string | null; name: string; description?: string | null; brand?: string | null; model?: string | null; serial_number?: string | null; purchase_date?: string | null; purchase_price?: number | null; warranty_expires_at?: string | null; notes?: string | null; created_by: string; created_at?: string; updated_at?: string };
        Update: { room_id?: string | null; category_id?: string | null; name?: string; description?: string | null; brand?: string | null; model?: string | null; serial_number?: string | null; purchase_date?: string | null; purchase_price?: number | null; warranty_expires_at?: string | null; notes?: string | null };
        Relationships: [];
      };
      item_tags: {
        Row: ItemTag;
        Insert: ItemTag;
        Update: Partial<ItemTag>;
        Relationships: [];
      };
      item_attachments: {
        Row: ItemAttachment;
        Insert: { id?: string; item_id: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number; is_primary_image?: boolean; uploaded_by: string; created_at?: string };
        Update: { is_primary_image?: boolean; file_name?: string };
        Relationships: [];
      };
      maintenance_schedules: {
        Row: MaintenanceSchedule;
        Insert: { id?: string; item_id: string; name: string; description?: string | null; recurrence_type: RecurrenceType; recurrence_interval?: number | null; start_date: string; end_date?: string | null; estimated_duration_minutes?: number | null; estimated_cost?: number | null; assigned_to?: string | null; is_active?: boolean; created_at?: string; updated_at?: string };
        Update: { name?: string; description?: string | null; recurrence_type?: RecurrenceType; recurrence_interval?: number | null; start_date?: string; end_date?: string | null; estimated_duration_minutes?: number | null; estimated_cost?: number | null; assigned_to?: string | null; is_active?: boolean };
        Relationships: [];
      };
      maintenance_events: {
        Row: MaintenanceEvent;
        Insert: { id?: string; schedule_id: string; item_id: string; scheduled_date: string; status?: MaintenanceStatus; completed_at?: string | null; completed_by?: string | null; actual_cost?: number | null; notes?: string | null; calendar_event_id?: string | null; created_at?: string; updated_at?: string };
        Update: { scheduled_date?: string; status?: MaintenanceStatus; completed_at?: string | null; completed_by?: string | null; actual_cost?: number | null; notes?: string | null; calendar_event_id?: string | null };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_household_member: {
        Args: { hid: string };
        Returns: boolean;
      };
    };
  };
};
