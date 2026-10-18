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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      ai_capacity: {
        Row: {
          bench_reason: string | null
          benched_until: string | null
          day: string
          failures: number
          id: string
          key_label: string
          model: string
          observed_limit: number | null
          requests: number
          updated_at: string
        }
        Insert: {
          bench_reason?: string | null
          benched_until?: string | null
          day?: string
          failures?: number
          id?: string
          key_label: string
          model: string
          observed_limit?: number | null
          requests?: number
          updated_at?: string
        }
        Update: {
          bench_reason?: string | null
          benched_until?: string | null
          day?: string
          failures?: number
          id?: string
          key_label?: string
          model?: string
          observed_limit?: number | null
          requests?: number
          updated_at?: string
        }
        Relationships: []
      }
      feedback_submissions: {
        Row: {
          category: string
          contact_email: string | null
          created_at: string
          feature: string
          id: string
          message: string
          rating: number
          user_id: string
        }
        Insert: {
          category: string
          contact_email?: string | null
          created_at?: string
          feature: string
          id?: string
          message: string
          rating: number
          user_id: string
        }
        Update: {
          category?: string
          contact_email?: string | null
          created_at?: string
          feature?: string
          id?: string
          message?: string
          rating?: number
          user_id?: string
        }
        Relationships: []
      }
      interview_answers: {
        Row: {
          answer_quality: Json | null
          client_turn_id: string | null
          created_at: string
          evidence: Json | null
          follow_up_required: boolean
          id: string
          interview_id: string
          question_id: string
          response_duration: number | null
          transcript: string
        }
        Insert: {
          answer_quality?: Json | null
          client_turn_id?: string | null
          created_at?: string
          evidence?: Json | null
          follow_up_required?: boolean
          id?: string
          interview_id: string
          question_id: string
          response_duration?: number | null
          transcript: string
        }
        Update: {
          answer_quality?: Json | null
          client_turn_id?: string | null
          created_at?: string
          evidence?: Json | null
          follow_up_required?: boolean
          id?: string
          interview_id?: string
          question_id?: string
          response_duration?: number | null
          transcript?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_answers_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "interview_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_blueprints: {
        Row: {
          created_at: string
          difficulty: string
          id: string
          interview_id: string
          objective: string
          order_index: number
          stage: string
          status: string
          target_claim_id: string | null
          target_project: string | null
          target_skill: string | null
        }
        Insert: {
          created_at?: string
          difficulty?: string
          id?: string
          interview_id: string
          objective: string
          order_index: number
          stage: string
          status?: string
          target_claim_id?: string | null
          target_project?: string | null
          target_skill?: string | null
        }
        Update: {
          created_at?: string
          difficulty?: string
          id?: string
          interview_id?: string
          objective?: string
          order_index?: number
          stage?: string
          status?: string
          target_claim_id?: string | null
          target_project?: string | null
          target_skill?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_blueprints_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_blueprints_target_claim_id_fkey"
            columns: ["target_claim_id"]
            isOneToOne: false
            referencedRelation: "resume_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_claim_status: {
        Row: {
          claim_id: string
          confidence: number
          contradictions: Json
          id: string
          interview_id: string
          status: string
          unanswered: Json
          updated_at: string
        }
        Insert: {
          claim_id: string
          confidence?: number
          contradictions?: Json
          id?: string
          interview_id: string
          status?: string
          unanswered?: Json
          updated_at?: string
        }
        Update: {
          claim_id?: string
          confidence?: number
          contradictions?: Json
          id?: string
          interview_id?: string
          status?: string
          unanswered?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_claim_status_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "resume_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_claim_status_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_evidence: {
        Row: {
          claim_id: string | null
          created_at: string
          evidence: string
          evidence_strength: string
          id: string
          interview_id: string
          project: string | null
          skill: string | null
          source_question_id: string | null
        }
        Insert: {
          claim_id?: string | null
          created_at?: string
          evidence: string
          evidence_strength: string
          id?: string
          interview_id: string
          project?: string | null
          skill?: string | null
          source_question_id?: string | null
        }
        Update: {
          claim_id?: string | null
          created_at?: string
          evidence?: string
          evidence_strength?: string
          id?: string
          interview_id?: string
          project?: string | null
          skill?: string | null
          source_question_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_evidence_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "resume_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_evidence_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_evidence_source_question_id_fkey"
            columns: ["source_question_id"]
            isOneToOne: false
            referencedRelation: "interview_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_integrity_events: {
        Row: {
          client_event_id: string
          created_at: string
          detail: Json
          duration_ms: number
          id: string
          interview_id: string
          kind: string
          question_id: string | null
        }
        Insert: {
          client_event_id: string
          created_at?: string
          detail?: Json
          duration_ms?: number
          id?: string
          interview_id: string
          kind: string
          question_id?: string | null
        }
        Update: {
          client_event_id?: string
          created_at?: string
          detail?: Json
          duration_ms?: number
          id?: string
          interview_id?: string
          kind?: string
          question_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_integrity_events_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_integrity_events_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "interview_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_questions: {
        Row: {
          blueprint_id: string | null
          category: string
          created_at: string
          depth_level: number
          difficulty: string
          id: string
          interview_id: string
          objective: string | null
          parent_question_id: string | null
          question: string
          sequence_number: number
          target_claim_id: string | null
          target_skill: string | null
        }
        Insert: {
          blueprint_id?: string | null
          category: string
          created_at?: string
          depth_level?: number
          difficulty?: string
          id?: string
          interview_id: string
          objective?: string | null
          parent_question_id?: string | null
          question: string
          sequence_number: number
          target_claim_id?: string | null
          target_skill?: string | null
        }
        Update: {
          blueprint_id?: string | null
          category?: string
          created_at?: string
          depth_level?: number
          difficulty?: string
          id?: string
          interview_id?: string
          objective?: string | null
          parent_question_id?: string | null
          question?: string
          sequence_number?: number
          target_claim_id?: string | null
          target_skill?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_questions_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "interview_blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_questions_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_questions_parent_question_id_fkey"
            columns: ["parent_question_id"]
            isOneToOne: false
            referencedRelation: "interview_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_questions_target_claim_id_fkey"
            columns: ["target_claim_id"]
            isOneToOne: false
            referencedRelation: "resume_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_reports: {
        Row: {
          created_at: string
          data: Json | null
          error_message: string | null
          id: string
          interview_id: string
          share_token: string | null
          shared: boolean
          status: string
          summary: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          error_message?: string | null
          id?: string
          interview_id: string
          share_token?: string | null
          shared?: boolean
          status?: string
          summary?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          error_message?: string | null
          id?: string
          interview_id?: string
          share_token?: string | null
          shared?: boolean
          status?: string
          summary?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_reports_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: true
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_visual_events: {
        Row: {
          client_event_id: string
          confidence: number | null
          created_at: string
          details: Json
          duration_ms: number
          event_type: string
          id: string
          interview_id: string
          question_id: string | null
          session_state: string
          started_at: string
        }
        Insert: {
          client_event_id: string
          confidence?: number | null
          created_at?: string
          details?: Json
          duration_ms?: number
          event_type: string
          id?: string
          interview_id: string
          question_id?: string | null
          session_state: string
          started_at: string
        }
        Update: {
          client_event_id?: string
          confidence?: number | null
          created_at?: string
          details?: Json
          duration_ms?: number
          event_type?: string
          id?: string
          interview_id?: string
          question_id?: string | null
          session_state?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_visual_events_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_visual_events_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "interview_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_visual_summaries: {
        Row: {
          created_at: string
          id: string
          interview_id: string
          metrics: Json
          question_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          interview_id: string
          metrics?: Json
          question_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          interview_id?: string
          metrics?: Json
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_visual_summaries_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_visual_summaries_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "interview_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          camera_consent: string | null
          camera_state: string | null
          created_at: string
          current_stage: string | null
          ended_at: string | null
          error_message: string | null
          id: string
          job_description: string | null
          mode: string
          required_skills: string[]
          resume_id: string
          session_state: string
          session_updated_at: string | null
          started_at: string
          status: string
          target_role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          camera_consent?: string | null
          camera_state?: string | null
          created_at?: string
          current_stage?: string | null
          ended_at?: string | null
          error_message?: string | null
          id?: string
          job_description?: string | null
          mode?: string
          required_skills?: string[]
          resume_id: string
          session_state?: string
          session_updated_at?: string | null
          started_at?: string
          status?: string
          target_role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          camera_consent?: string | null
          camera_state?: string | null
          created_at?: string
          current_stage?: string | null
          ended_at?: string | null
          error_message?: string | null
          id?: string
          job_description?: string | null
          mode?: string
          required_skills?: string[]
          resume_id?: string
          session_state?: string
          session_updated_at?: string | null
          started_at?: string
          status?: string
          target_role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      resume_achievements: {
        Row: {
          created_at: string
          id: string
          resume_id: string
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          resume_id: string
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          resume_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_achievements_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_certifications: {
        Row: {
          created_at: string
          credential_id: string | null
          date: string | null
          id: string
          issuer: string | null
          name: string
          resume_id: string
        }
        Insert: {
          created_at?: string
          credential_id?: string | null
          date?: string | null
          id?: string
          issuer?: string | null
          name: string
          resume_id: string
        }
        Update: {
          created_at?: string
          credential_id?: string | null
          date?: string | null
          id?: string
          issuer?: string | null
          name?: string
          resume_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_certifications_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_claims: {
        Row: {
          claim: string
          claim_type: string
          created_at: string
          evidence: string | null
          id: string
          related_project: string | null
          related_skill: string | null
          resume_id: string
          verification_priority: string
        }
        Insert: {
          claim: string
          claim_type: string
          created_at?: string
          evidence?: string | null
          id?: string
          related_project?: string | null
          related_skill?: string | null
          resume_id: string
          verification_priority?: string
        }
        Update: {
          claim?: string
          claim_type?: string
          created_at?: string
          evidence?: string | null
          id?: string
          related_project?: string | null
          related_skill?: string | null
          resume_id?: string
          verification_priority?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_claims_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_education: {
        Row: {
          created_at: string
          degree: string | null
          description: string | null
          end_date: string | null
          field: string | null
          grade: string | null
          id: string
          institution: string
          resume_id: string
          start_date: string | null
        }
        Insert: {
          created_at?: string
          degree?: string | null
          description?: string | null
          end_date?: string | null
          field?: string | null
          grade?: string | null
          id?: string
          institution: string
          resume_id: string
          start_date?: string | null
        }
        Update: {
          created_at?: string
          degree?: string | null
          description?: string | null
          end_date?: string | null
          field?: string | null
          grade?: string | null
          id?: string
          institution?: string
          resume_id?: string
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resume_education_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_experience: {
        Row: {
          achievements: Json
          company: string
          created_at: string
          description: string | null
          employment_type: string | null
          end_date: string | null
          id: string
          responsibilities: Json
          resume_id: string
          role: string
          start_date: string | null
          technologies: Json
        }
        Insert: {
          achievements?: Json
          company: string
          created_at?: string
          description?: string | null
          employment_type?: string | null
          end_date?: string | null
          id?: string
          responsibilities?: Json
          resume_id: string
          role: string
          start_date?: string | null
          technologies?: Json
        }
        Update: {
          achievements?: Json
          company?: string
          created_at?: string
          description?: string | null
          employment_type?: string | null
          end_date?: string | null
          id?: string
          responsibilities?: Json
          resume_id?: string
          role?: string
          start_date?: string | null
          technologies?: Json
        }
        Relationships: [
          {
            foreignKeyName: "resume_experience_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_projects: {
        Row: {
          achievements: Json
          claims: Json
          created_at: string
          description: string | null
          id: string
          name: string
          responsibilities: Json
          resume_id: string
          technologies: Json
        }
        Insert: {
          achievements?: Json
          claims?: Json
          created_at?: string
          description?: string | null
          id?: string
          name: string
          responsibilities?: Json
          resume_id: string
          technologies?: Json
        }
        Update: {
          achievements?: Json
          claims?: Json
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          responsibilities?: Json
          resume_id?: string
          technologies?: Json
        }
        Relationships: [
          {
            foreignKeyName: "resume_projects_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_skills: {
        Row: {
          category: string
          created_at: string
          evidence: string | null
          id: string
          name: string
          proficiency_claim: string | null
          resume_id: string
        }
        Insert: {
          category: string
          created_at?: string
          evidence?: string | null
          id?: string
          name: string
          proficiency_claim?: string | null
          resume_id: string
        }
        Update: {
          category?: string
          created_at?: string
          evidence?: string | null
          id?: string
          name?: string
          proficiency_claim?: string | null
          resume_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_skills_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      resumes: {
        Row: {
          analysis_version: string
          created_at: string
          error_message: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          parsed_profile: Json | null
          raw_text: string | null
          stage: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_version?: string
          created_at?: string
          error_message?: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          parsed_profile?: Json | null
          raw_text?: string | null
          stage?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_version?: string
          created_at?: string
          error_message?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          parsed_profile?: Json | null
          raw_text?: string | null
          stage?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
