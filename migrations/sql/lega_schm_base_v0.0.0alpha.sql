--
-- PostgreSQL database dump
--

\restrict imlLf2yBIJvHpzyx5PsBh97ZiWWGsDVmcR2jCz9CqZZaaIfAlHv5gzp5xAMgvmI

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: stripe; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA "stripe";

--
-- Name: invoice_status; Type: TYPE; Schema: stripe; Owner: -
--

CREATE TYPE "stripe"."invoice_status" AS ENUM (
    'draft',
    'open',
    'paid',
    'uncollectible',
    'void',
    'deleted'
);

--
-- Name: pricing_tiers; Type: TYPE; Schema: stripe; Owner: -
--

CREATE TYPE "stripe"."pricing_tiers" AS ENUM (
    'graduated',
    'volume'
);

--
-- Name: pricing_type; Type: TYPE; Schema: stripe; Owner: -
--

CREATE TYPE "stripe"."pricing_type" AS ENUM (
    'one_time',
    'recurring'
);

--
-- Name: subscription_schedule_status; Type: TYPE; Schema: stripe; Owner: -
--

CREATE TYPE "stripe"."subscription_schedule_status" AS ENUM (
    'not_started',
    'active',
    'completed',
    'released',
    'canceled'
);

--
-- Name: subscription_status; Type: TYPE; Schema: stripe; Owner: -
--

CREATE TYPE "stripe"."subscription_status" AS ENUM (
    'trialing',
    'active',
    'canceled',
    'incomplete',
    'incomplete_expired',
    'past_due',
    'unpaid',
    'paused'
);

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new._updated_at = now();
  return NEW;
end;
$$;

--
-- Name: set_updated_at_metadata(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_updated_at_metadata"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return NEW;
end;
$$;

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: a0p_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."a0p_events" (
    "id" integer NOT NULL,
    "task_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "prev_hash" "text" NOT NULL,
    "hash" "text" NOT NULL,
    "hmmm" "jsonb" NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: a0p_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."a0p_events_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: a0p_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."a0p_events_id_seq" OWNED BY "public"."a0p_events"."id";

--
-- Name: a0p_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."a0p_settings" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

--
-- Name: admin_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admin_emails" (
    "id" integer NOT NULL,
    "email" character varying(255) NOT NULL,
    "added_at" timestamp without time zone DEFAULT "now"() NOT NULL
);

--
-- Name: admin_emails_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."admin_emails_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: admin_emails_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."admin_emails_id_seq" OWNED BY "public"."admin_emails"."id";

--
-- Name: agent_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."agent_instances" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "slot" "text" DEFAULT 'zfae'::"text" NOT NULL,
    "directives" "text" DEFAULT ''::"text" NOT NULL,
    "tools" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "text" DEFAULT 'idle'::"text" NOT NULL,
    "seeds" "jsonb" DEFAULT '[]'::"jsonb",
    "sentinel_seed_indices" "jsonb" DEFAULT '[10, 11, 12]'::"jsonb",
    "zfae_observations" "jsonb" DEFAULT '[]'::"jsonb",
    "last_output" "text",
    "last_tick_at" timestamp without time zone,
    "is_persistent" boolean DEFAULT false NOT NULL,
    "bandit_arm_id" integer,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "archetype" "text",
    "model_id" "text",
    "provider" "text",
    "enabled_tools" "jsonb" DEFAULT '[]'::"jsonb",
    "system_prompt" "text",
    "personality" "jsonb",
    "owner_id" "text",
    "is_template" boolean DEFAULT false NOT NULL,
    "parent_id" integer,
    "merged_at" timestamp without time zone,
    "level" integer DEFAULT 1 NOT NULL,
    "xp" integer DEFAULT 0 NOT NULL,
    "hp" integer DEFAULT 100 NOT NULL,
    "wins" integer DEFAULT 0 NOT NULL,
    "losses" integer DEFAULT 0 NOT NULL,
    "draws" integer DEFAULT 0 NOT NULL,
    "stats" "jsonb",
    "loadout" "jsonb" DEFAULT '[]'::"jsonb",
    "avatar_url" "text",
    "backstory" "text"
);

--
-- Name: agent_instances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."agent_instances_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: agent_instances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."agent_instances_id_seq" OWNED BY "public"."agent_instances"."id";

--
-- Name: agent_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."agent_logs" (
    "id" character varying DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" character varying NOT NULL,
    "depth" integer DEFAULT 0 NOT NULL,
    "parent_run_id" character varying,
    "level" character varying(8) DEFAULT 'INFO'::character varying NOT NULL,
    "event" character varying(32) NOT NULL,
    "payload" "jsonb",
    "ts" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: agent_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."agent_matches" (
    "id" integer NOT NULL,
    "attacker_id" integer NOT NULL,
    "defender_id" integer NOT NULL,
    "mode" "text" DEFAULT 'duel'::"text" NOT NULL,
    "rounds" "jsonb" DEFAULT '[]'::"jsonb",
    "winner_id" integer,
    "xp_awarded" "jsonb",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "started_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finished_at" timestamp without time zone
);

--
-- Name: agent_matches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."agent_matches_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: agent_matches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."agent_matches_id_seq" OWNED BY "public"."agent_matches"."id";

--
-- Name: agent_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."agent_runs" (
    "id" character varying DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_run_id" character varying,
    "root_run_id" character varying,
    "depth" integer DEFAULT 0 NOT NULL,
    "status" character varying(16) DEFAULT 'running'::character varying NOT NULL,
    "orchestration_mode" character varying(32) DEFAULT 'single'::character varying NOT NULL,
    "cut_mode" character varying(8) DEFAULT 'soft'::character varying NOT NULL,
    "providers" "jsonb" DEFAULT '[]'::"jsonb",
    "spawned_by_tool" character varying,
    "task_summary" "text",
    "started_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "ended_at" timestamp without time zone,
    "total_tokens" integer DEFAULT 0 NOT NULL,
    "total_cost_usd" real DEFAULT 0 NOT NULL,
    "bandit_pull" "jsonb",
    "last_heartbeat_at" timestamp without time zone,
    "retry_policy" character varying(40) DEFAULT 'none'::character varying NOT NULL,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "failure_reason" character varying(120),
    "worker_id" character varying(120)
);

--
-- Name: approval_scopes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."approval_scopes" (
    "id" integer NOT NULL,
    "user_id" character varying NOT NULL,
    "scope" character varying(100) NOT NULL,
    "granted_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: approval_scopes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."approval_scopes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: approval_scopes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."approval_scopes_id_seq" OWNED BY "public"."approval_scopes"."id";

--
-- Name: artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."artifacts" (
    "id" character varying DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" character varying NOT NULL,
    "tool_name" character varying,
    "agent_run_id" character varying,
    "storage_path" "text" NOT NULL,
    "filename" character varying NOT NULL,
    "mime" character varying NOT NULL,
    "size_bytes" integer NOT NULL,
    "sha256" character varying NOT NULL,
    "provenance" "jsonb",
    "public" boolean DEFAULT false NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

--
-- Name: automation_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."automation_tasks" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "spec_content" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "result" "text",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: automation_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."automation_tasks_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: automation_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."automation_tasks_id_seq" OWNED BY "public"."automation_tasks"."id";

--
-- Name: bandit_correlations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."bandit_correlations" (
    "id" integer NOT NULL,
    "tool_arm" "text",
    "model_arm" "text",
    "ptca_arm" "text",
    "pcna_arm" "text",
    "joint_reward" real DEFAULT 0 NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: bandit_correlations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."bandit_correlations_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: bandit_correlations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."bandit_correlations_id_seq" OWNED BY "public"."bandit_correlations"."id";

--
-- Name: bandit_pulls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."bandit_pulls" (
    "id" integer NOT NULL,
    "spawn_id" character varying NOT NULL,
    "parent_pcna_id" character varying NOT NULL,
    "domain" character varying(40) NOT NULL,
    "arm_id" "text" NOT NULL,
    "reward" real NOT NULL,
    "reward_shape" character varying(40) DEFAULT 'coherence_per_dollar'::character varying NOT NULL,
    "cost_usd" real DEFAULT 0 NOT NULL,
    "ts" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: bandit_pulls_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."bandit_pulls_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: bandit_pulls_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."bandit_pulls_id_seq" OWNED BY "public"."bandit_pulls"."id";

--
-- Name: byok_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."byok_keys" (
    "id" integer NOT NULL,
    "user_id" character varying NOT NULL,
    "provider" character varying(50) NOT NULL,
    "key_hash" character varying(256) NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: byok_keys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."byok_keys_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: byok_keys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."byok_keys_id_seq" OWNED BY "public"."byok_keys"."id";

--
-- Name: challenge_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."challenge_responses" (
    "id" integer NOT NULL,
    "user_id" character varying NOT NULL,
    "question" "text" NOT NULL,
    "answer_hash" character varying NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);

--
-- Name: challenge_responses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."challenge_responses" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."challenge_responses_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: command_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."command_history" (
    "id" integer NOT NULL,
    "command" "text" NOT NULL,
    "output" "text",
    "exit_code" integer,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: command_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."command_history_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: command_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."command_history_id_seq" OWNED BY "public"."command_history"."id";

--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."conversations" (
    "id" integer NOT NULL,
    "title" "text" DEFAULT 'New Chat'::"text" NOT NULL,
    "model" "text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "user_id" character varying,
    "context_boost" "text",
    "parent_conv_id" integer,
    "subagent_status" character varying(20),
    "subagent_error" "text",
    "archived" boolean DEFAULT false NOT NULL,
    "agent_id" integer,
    "enabled_tools" "jsonb",
    "max_tool_rounds" integer,
    "inference_mode" character varying(20)
);

--
-- Name: conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."conversations_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."conversations_id_seq" OWNED BY "public"."conversations"."id";

--
-- Name: cost_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."cost_metrics" (
    "id" integer NOT NULL,
    "user_id" character varying,
    "model" "text" NOT NULL,
    "prompt_tokens" integer DEFAULT 0 NOT NULL,
    "completion_tokens" integer DEFAULT 0 NOT NULL,
    "estimated_cost" real DEFAULT 0 NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "cache_tokens" integer DEFAULT 0 NOT NULL,
    "conversation_id" integer,
    "stage" "text",
    "pipeline_preset" "text"
);

--
-- Name: cost_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."cost_metrics_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: cost_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."cost_metrics_id_seq" OWNED BY "public"."cost_metrics"."id";

--
-- Name: custom_tools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."custom_tools" (
    "id" integer NOT NULL,
    "user_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "parameters_schema" "jsonb",
    "target_models" "text"[],
    "handler_type" "text" NOT NULL,
    "handler_code" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "is_generated" boolean DEFAULT false NOT NULL
);

--
-- Name: custom_tools_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."custom_tools_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: custom_tools_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."custom_tools_id_seq" OWNED BY "public"."custom_tools"."id";

--
-- Name: deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."deals" (
    "id" integer NOT NULL,
    "user_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "ceiling" real,
    "walk_away" real,
    "my_goals" "jsonb" DEFAULT '[]'::"jsonb",
    "current_terms" "jsonb" DEFAULT '{}'::"jsonb",
    "counter_history" "jsonb" DEFAULT '[]'::"jsonb",
    "outcome" "text",
    "final_terms" "jsonb",
    "conversation_id" integer,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: deals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."deals_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: deals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."deals_id_seq" OWNED BY "public"."deals"."id";

--
-- Name: discovery_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."discovery_drafts" (
    "id" integer NOT NULL,
    "source_task" "text" NOT NULL,
    "title" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "relevance_score" real DEFAULT 0 NOT NULL,
    "source_data" "jsonb",
    "promoted_to_conversation" boolean DEFAULT false NOT NULL,
    "conversation_id" integer,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: discovery_drafts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."discovery_drafts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: discovery_drafts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."discovery_drafts_id_seq" OWNED BY "public"."discovery_drafts"."id";

--
-- Name: edcm_metric_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."edcm_metric_snapshots" (
    "id" integer NOT NULL,
    "conversation_id" integer,
    "source" "text" NOT NULL,
    "cm" real DEFAULT 0 NOT NULL,
    "da" real DEFAULT 0 NOT NULL,
    "drift" real DEFAULT 0 NOT NULL,
    "dvg" real DEFAULT 0 NOT NULL,
    "int_val" real DEFAULT 0 NOT NULL,
    "tbf" real DEFAULT 0 NOT NULL,
    "directives_fired" "text"[],
    "context_snippet" "text",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: edcm_metric_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."edcm_metric_snapshots_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: edcm_metric_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."edcm_metric_snapshots_id_seq" OWNED BY "public"."edcm_metric_snapshots"."id";

--
-- Name: edcm_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."edcm_snapshots" (
    "id" integer NOT NULL,
    "task_id" "text",
    "operator_grok" "jsonb",
    "operator_gemini" "jsonb",
    "operator_user" "jsonb",
    "delta_bone" real,
    "delta_align_grok" real,
    "delta_align_gemini" real,
    "decision" "text",
    "ptca_state" "jsonb",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: edcm_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."edcm_snapshots_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: edcm_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."edcm_snapshots_id_seq" OWNED BY "public"."edcm_snapshots"."id";

--
-- Name: explanation_credits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."explanation_credits" (
    "user_id" character varying(120) NOT NULL,
    "free_remaining" integer DEFAULT 3 NOT NULL,
    "paid_remaining" integer DEFAULT 0 NOT NULL,
    "lifetime_purchased" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: fleet_benchmark_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."fleet_benchmark_runs" (
    "id" character varying NOT NULL,
    "benchmark_id" integer NOT NULL,
    "user_id" character varying NOT NULL,
    "prompt_snapshot" "text" NOT NULL,
    "status" character varying(20) DEFAULT 'running'::character varying NOT NULL,
    "started_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finished_at" timestamp without time zone
);

--
-- Name: fleet_benchmarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."fleet_benchmarks" (
    "id" integer NOT NULL,
    "user_id" character varying NOT NULL,
    "name" "text" NOT NULL,
    "prompt" "text" DEFAULT ''::"text" NOT NULL,
    "mode" character varying(20) DEFAULT 'one_shot'::character varying NOT NULL,
    "judge_enabled" boolean DEFAULT false NOT NULL,
    "judge_model" character varying(80),
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: fleet_benchmarks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."fleet_benchmarks_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: fleet_benchmarks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."fleet_benchmarks_id_seq" OWNED BY "public"."fleet_benchmarks"."id";

--
-- Name: fleet_contestant_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."fleet_contestant_runs" (
    "id" character varying NOT NULL,
    "run_id" character varying NOT NULL,
    "contestant_id" integer NOT NULL,
    "slot" integer NOT NULL,
    "conversation_id" integer,
    "status" character varying(20) DEFAULT 'running'::character varying NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "error" "text",
    "latency_ms" integer DEFAULT 0 NOT NULL,
    "prompt_tokens" integer DEFAULT 0 NOT NULL,
    "completion_tokens" integer DEFAULT 0 NOT NULL,
    "cost_usd" numeric(12,6) DEFAULT 0 NOT NULL,
    "started_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finished_at" timestamp without time zone
);

--
-- Name: fleet_contestants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."fleet_contestants" (
    "id" integer NOT NULL,
    "benchmark_id" integer NOT NULL,
    "slot" integer NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "provider_id" character varying(80) NOT NULL,
    "model_id" character varying(120) DEFAULT ''::character varying NOT NULL,
    "agent_id" integer,
    "orchestration_mode" character varying(40) DEFAULT 'single'::character varying NOT NULL,
    "providers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: fleet_contestants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."fleet_contestants_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: fleet_contestants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."fleet_contestants_id_seq" OWNED BY "public"."fleet_contestants"."id";

--
-- Name: fleet_judgments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."fleet_judgments" (
    "id" integer NOT NULL,
    "run_id" character varying NOT NULL,
    "judge_model" character varying(120) NOT NULL,
    "scores" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "winner_contestant_id" integer,
    "rationale" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: fleet_judgments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."fleet_judgments_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: fleet_judgments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."fleet_judgments_id_seq" OWNED BY "public"."fleet_judgments"."id";

--
-- Name: founders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."founders" (
    "id" integer NOT NULL,
    "user_id" character varying NOT NULL,
    "display_name" character varying(200) NOT NULL,
    "listed" boolean DEFAULT false NOT NULL,
    "subscribed_since" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tier" character varying(50) DEFAULT 'patron'::character varying NOT NULL
);

--
-- Name: founders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."founders_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: founders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."founders_id_seq" OWNED BY "public"."founders"."id";

--
-- Name: generated_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."generated_images" (
    "id" integer NOT NULL,
    "owner_user_id" "text",
    "prompt" "text" NOT NULL,
    "model" "text" NOT NULL,
    "aspect_ratio" "text" DEFAULT '1:1'::"text" NOT NULL,
    "storage_url" "text" NOT NULL,
    "bytes" integer DEFAULT 0 NOT NULL,
    "public" boolean DEFAULT false NOT NULL,
    "featured" boolean DEFAULT false NOT NULL,
    "tags" "jsonb" DEFAULT '[]'::"jsonb",
    "skill_origin" "text",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: generated_images_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."generated_images_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: generated_images_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."generated_images_id_seq" OWNED BY "public"."generated_images"."id";

--
-- Name: guest_token_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."guest_token_usage" (
    "id" integer NOT NULL,
    "ip_hash" character varying NOT NULL,
    "tokens_used" integer DEFAULT 0 NOT NULL,
    "window_start" timestamp without time zone NOT NULL
);

--
-- Name: guest_token_usage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."guest_token_usage" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."guest_token_usage_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: heartbeat_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."heartbeat_logs" (
    "id" integer NOT NULL,
    "status" "text" NOT NULL,
    "hash_chain_valid" boolean,
    "details" "jsonb",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: heartbeat_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."heartbeat_logs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: heartbeat_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."heartbeat_logs_id_seq" OWNED BY "public"."heartbeat_logs"."id";

--
-- Name: heartbeat_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."heartbeat_tasks" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "task_type" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "weight" real DEFAULT 1 NOT NULL,
    "interval_seconds" integer DEFAULT 300 NOT NULL,
    "last_run" timestamp without time zone,
    "last_result" "text",
    "run_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "scheduled_at" timestamp without time zone,
    "one_shot" boolean DEFAULT false NOT NULL,
    "handler_code" "text"
);

--
-- Name: heartbeat_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."heartbeat_tasks_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: heartbeat_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."heartbeat_tasks_id_seq" OWNED BY "public"."heartbeat_tasks"."id";

--
-- Name: instance_chat_archives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."instance_chat_archives" (
    "id" character varying NOT NULL,
    "instance_id" character varying NOT NULL,
    "label" "text" NOT NULL,
    "archived_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "merge_status" character varying(20) DEFAULT 'pending'::character varying NOT NULL
);

--
-- Name: instance_chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."instance_chats" (
    "id" character varying NOT NULL,
    "instance_id" character varying NOT NULL,
    "role" character varying(20) NOT NULL,
    "content" "text" NOT NULL,
    "archive_id" character varying,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: instance_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."instance_memory" (
    "id" character varying NOT NULL,
    "instance_id" character varying NOT NULL,
    "tier" character varying(4) NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: instance_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."instance_tasks" (
    "id" character varying NOT NULL,
    "instance_id" character varying NOT NULL,
    "title" "text" NOT NULL,
    "status" character varying(20) DEFAULT 'open'::character varying NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: memory_projections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."memory_projections" (
    "id" integer NOT NULL,
    "projection_in" "jsonb",
    "projection_out" "jsonb",
    "request_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: memory_projections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."memory_projections_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: memory_projections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."memory_projections_id_seq" OWNED BY "public"."memory_projections"."id";

--
-- Name: memory_seeds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."memory_seeds" (
    "id" integer NOT NULL,
    "seed_index" integer NOT NULL,
    "label" "text" NOT NULL,
    "summary" "text" DEFAULT ''::"text" NOT NULL,
    "original_summary" "text" DEFAULT ''::"text" NOT NULL,
    "pinned" boolean DEFAULT false NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "weight" real DEFAULT 1 NOT NULL,
    "ptca_values" "jsonb",
    "pcna_weights" "jsonb",
    "sentinel_pass_count" integer DEFAULT 0 NOT NULL,
    "sentinel_fail_count" integer DEFAULT 0 NOT NULL,
    "last_sentinel_status" "text",
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: memory_seeds_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."memory_seeds_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: memory_seeds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."memory_seeds_id_seq" OWNED BY "public"."memory_seeds"."id";

--
-- Name: memory_tensor_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."memory_tensor_snapshots" (
    "id" integer NOT NULL,
    "seeds_state" "jsonb",
    "projection_in" "jsonb",
    "projection_out" "jsonb",
    "request_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: memory_tensor_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."memory_tensor_snapshots_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: memory_tensor_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."memory_tensor_snapshots_id_seq" OWNED BY "public"."memory_tensor_snapshots"."id";

--
-- Name: message_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."message_attachments" (
    "id" integer NOT NULL,
    "message_id" integer,
    "owner_user_id" character varying,
    "kind" "text" DEFAULT 'image'::"text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "storage_url" "text" NOT NULL,
    "width" integer,
    "height" integer,
    "bytes" integer,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: message_attachments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."message_attachments_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: message_attachments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."message_attachments_id_seq" OWNED BY "public"."message_attachments"."id";

--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."messages" (
    "id" integer NOT NULL,
    "conversation_id" integer NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "model" "text",
    "metadata" "jsonb",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "orchestration_mode" character varying(32) DEFAULT 'single'::character varying,
    "cut_mode" character varying(8) DEFAULT 'soft'::character varying,
    "parent_run_id" character varying
);

--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."messages_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."messages_id_seq" OWNED BY "public"."messages"."id";

--
-- Name: model_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."model_instances" (
    "id" character varying NOT NULL,
    "canonical_name" "text" NOT NULL,
    "kind" character varying(20) DEFAULT 'zfae'::character varying NOT NULL,
    "vendor" character varying(40) NOT NULL,
    "model_id" "text" NOT NULL,
    "swarm_context" "text",
    "remote_url" "text",
    "remote_secret_ref" "text",
    "role_slot" character varying(20),
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: processed_stripe_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."processed_stripe_events" (
    "event_id" character varying(255) NOT NULL,
    "event_type" character varying(120),
    "processed_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: prompt_contexts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."prompt_contexts" (
    "name" character varying(100) NOT NULL,
    "value" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_by" character varying
);

--
-- Name: recovery_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."recovery_attempts" (
    "user_id" character varying NOT NULL,
    "fail_count" integer DEFAULT 0 NOT NULL,
    "locked_until" timestamp without time zone,
    "updated_at" timestamp without time zone DEFAULT "now"() NOT NULL
);

--
-- Name: security_probes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."security_probes" (
    "id" integer NOT NULL,
    "probe_type" character varying(64) NOT NULL,
    "ip_hash" character varying(64),
    "account_hash" character varying(64),
    "detail" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL
);

--
-- Name: security_probes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."security_probes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: security_probes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."security_probes_id_seq" OWNED BY "public"."security_probes"."id";

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."sessions" (
    "sid" character varying NOT NULL,
    "sess" "jsonb" NOT NULL,
    "expire" timestamp without time zone NOT NULL
);

--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."settings" (
    "id" integer NOT NULL,
    "user_id" character varying DEFAULT ''::character varying NOT NULL,
    "key" character varying(100) NOT NULL,
    "value" "jsonb",
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."settings_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."settings_id_seq" OWNED BY "public"."settings"."id";

--
-- Name: system_toggles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."system_toggles" (
    "id" integer NOT NULL,
    "subsystem" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "parameters" "jsonb",
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: system_toggles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."system_toggles_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: system_toggles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."system_toggles_id_seq" OWNED BY "public"."system_toggles"."id";

--
-- Name: tool_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tool_results" (
    "id" integer NOT NULL,
    "call_id" character varying(64) NOT NULL,
    "tool_name" "text" NOT NULL,
    "arguments" "jsonb",
    "raw_result" "text" NOT NULL,
    "result_size_bytes" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: tool_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."tool_results_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: tool_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."tool_results_id_seq" OWNED BY "public"."tool_results"."id";

--
-- Name: transcript_explanations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."transcript_explanations" (
    "id" integer NOT NULL,
    "report_id" integer NOT NULL,
    "user_id" character varying(120) NOT NULL,
    "model_id" character varying(80) NOT NULL,
    "prompt_tokens" integer DEFAULT 0 NOT NULL,
    "completion_tokens" integer DEFAULT 0 NOT NULL,
    "cost_cents" integer DEFAULT 0 NOT NULL,
    "body" "text" NOT NULL,
    "citations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "paid_with" character varying(8) DEFAULT 'free'::character varying NOT NULL,
    "paid_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: transcript_explanations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."transcript_explanations_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: transcript_explanations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."transcript_explanations_id_seq" OWNED BY "public"."transcript_explanations"."id";

--
-- Name: transcript_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."transcript_messages" (
    "id" integer NOT NULL,
    "report_id" integer NOT NULL,
    "idx" integer DEFAULT 0 NOT NULL,
    "speaker" character varying(120),
    "content" "text",
    "cm" real DEFAULT 0,
    "da" real DEFAULT 0,
    "drift" real DEFAULT 0,
    "dvg" real DEFAULT 0,
    "int_val" real DEFAULT 0,
    "tbf" real DEFAULT 0,
    "directives_fired" "jsonb"
);

--
-- Name: transcript_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."transcript_messages_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: transcript_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."transcript_messages_id_seq" OWNED BY "public"."transcript_messages"."id";

--
-- Name: transcript_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."transcript_reports" (
    "id" integer NOT NULL,
    "source_slug" character varying(100) NOT NULL,
    "message_count" integer DEFAULT 0 NOT NULL,
    "avg_cm" real DEFAULT 0,
    "avg_da" real DEFAULT 0,
    "avg_drift" real DEFAULT 0,
    "avg_dvg" real DEFAULT 0,
    "avg_int" real DEFAULT 0,
    "avg_tbf" real DEFAULT 0,
    "peak_metric" real DEFAULT 0,
    "peak_metric_name" "text",
    "directives_fired" "jsonb",
    "top_snippets" "jsonb",
    "file_breakdown" "jsonb",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "risk_loop" real DEFAULT 0,
    "risk_fixation" real DEFAULT 0,
    "correction_fidelity" real DEFAULT 0,
    "edcmbone_version" character varying(40)
);

--
-- Name: transcript_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."transcript_reports_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: transcript_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."transcript_reports_id_seq" OWNED BY "public"."transcript_reports"."id";

--
-- Name: transcript_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."transcript_sources" (
    "id" integer NOT NULL,
    "slug" character varying(100) NOT NULL,
    "display_name" character varying(200) NOT NULL,
    "file_count" integer DEFAULT 0 NOT NULL,
    "last_scanned_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: transcript_sources_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."transcript_sources_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: transcript_sources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."transcript_sources_id_seq" OWNED BY "public"."transcript_sources"."id";

--
-- Name: transcript_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."transcript_uploads" (
    "id" integer NOT NULL,
    "user_id" character varying(120),
    "filename" "text" NOT NULL,
    "mime" character varying(120),
    "byte_size" integer DEFAULT 0 NOT NULL,
    "status" character varying(24) DEFAULT 'queued'::character varying NOT NULL,
    "error" "text",
    "source_slug" character varying(100),
    "report_id" integer,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finished_at" timestamp without time zone
);

--
-- Name: transcript_uploads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."transcript_uploads_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: transcript_uploads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."transcript_uploads_id_seq" OWNED BY "public"."transcript_uploads"."id";

--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."users" (
    "id" character varying DEFAULT "gen_random_uuid"() NOT NULL,
    "email" character varying,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "subscription_tier" character varying DEFAULT 'free'::character varying NOT NULL,
    "stripe_customer_id" character varying,
    "stripe_subscription_id" character varying,
    "subscription_status" character varying DEFAULT 'active'::character varying NOT NULL,
    "byok_enabled" boolean DEFAULT false NOT NULL,
    "founder_slot" integer,
    "username" character varying,
    "passphrase_hash" character varying,
    "display_name" character varying,
    "role" character varying DEFAULT 'user'::character varying NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "login_count" integer DEFAULT 0 NOT NULL,
    "last_login_at" timestamp without time zone,
    "transcripts_unlocked" boolean DEFAULT false NOT NULL
);

--
-- Name: ws_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ws_modules" (
    "id" integer NOT NULL,
    "slug" character varying(120) NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "owner_id" character varying NOT NULL,
    "status" character varying(20) DEFAULT 'inactive'::character varying NOT NULL,
    "handler_code" "text",
    "ui_meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "route_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_log" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "content_hash" character varying(64),
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "last_swapped_at" timestamp without time zone
);

--
-- Name: ws_modules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."ws_modules_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: ws_modules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."ws_modules_id_seq" OWNED BY "public"."ws_modules"."id";

--
-- Name: _managed_webhooks; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."_managed_webhooks" (
    "id" "text" NOT NULL,
    "object" "text",
    "url" "text" NOT NULL,
    "enabled_events" "jsonb" NOT NULL,
    "description" "text",
    "enabled" boolean,
    "livemode" boolean,
    "metadata" "jsonb",
    "secret" "text" NOT NULL,
    "status" "text",
    "api_version" "text",
    "created" integer,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "last_synced_at" timestamp with time zone,
    "account_id" "text" NOT NULL
);

--
-- Name: _migrations; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."_migrations" (
    "id" integer NOT NULL,
    "name" character varying(100) NOT NULL,
    "hash" character varying(40) NOT NULL,
    "executed_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

--
-- Name: _sync_status; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."_sync_status" (
    "id" integer NOT NULL,
    "resource" "text" NOT NULL,
    "status" "text" DEFAULT 'idle'::"text",
    "last_synced_at" timestamp with time zone DEFAULT "now"(),
    "last_incremental_cursor" timestamp with time zone,
    "error_message" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "account_id" "text" NOT NULL,
    CONSTRAINT "_sync_status_status_check" CHECK (("status" = ANY (ARRAY['idle'::"text", 'running'::"text", 'complete'::"text", 'error'::"text"])))
);

--
-- Name: _sync_status_id_seq; Type: SEQUENCE; Schema: stripe; Owner: -
--

CREATE SEQUENCE "stripe"."_sync_status_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: _sync_status_id_seq; Type: SEQUENCE OWNED BY; Schema: stripe; Owner: -
--

ALTER SEQUENCE "stripe"."_sync_status_id_seq" OWNED BY "stripe"."_sync_status"."id";

--
-- Name: accounts; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."accounts" (
    "_raw_data" "jsonb" NOT NULL,
    "first_synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "_last_synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "business_name" "text" GENERATED ALWAYS AS ((("_raw_data" -> 'business_profile'::"text") ->> 'name'::"text")) STORED,
    "email" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'email'::"text")) STORED,
    "type" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'type'::"text")) STORED,
    "charges_enabled" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'charges_enabled'::"text"))::boolean) STORED,
    "payouts_enabled" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'payouts_enabled'::"text"))::boolean) STORED,
    "details_submitted" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'details_submitted'::"text"))::boolean) STORED,
    "country" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'country'::"text")) STORED,
    "default_currency" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'default_currency'::"text")) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "api_key_hashes" "text"[] DEFAULT '{}'::"text"[],
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: active_entitlements; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."active_entitlements" (
    "_updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "livemode" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'livemode'::"text"))::boolean) STORED,
    "feature" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'feature'::"text")) STORED,
    "customer" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'customer'::"text")) STORED,
    "lookup_key" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'lookup_key'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: charges; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."charges" (
    "_updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "paid" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'paid'::"text"))::boolean) STORED,
    "order" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'order'::"text")) STORED,
    "amount" bigint GENERATED ALWAYS AS ((("_raw_data" ->> 'amount'::"text"))::bigint) STORED,
    "review" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'review'::"text")) STORED,
    "source" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'source'::"text")) STORED,
    "status" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'status'::"text")) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "dispute" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'dispute'::"text")) STORED,
    "invoice" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'invoice'::"text")) STORED,
    "outcome" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'outcome'::"text")) STORED,
    "refunds" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'refunds'::"text")) STORED,
    "updated" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'updated'::"text"))::integer) STORED,
    "captured" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'captured'::"text"))::boolean) STORED,
    "currency" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'currency'::"text")) STORED,
    "customer" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'customer'::"text")) STORED,
    "livemode" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'livemode'::"text"))::boolean) STORED,
    "metadata" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'metadata'::"text")) STORED,
    "refunded" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'refunded'::"text"))::boolean) STORED,
    "shipping" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'shipping'::"text")) STORED,
    "application" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'application'::"text")) STORED,
    "description" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'description'::"text")) STORED,
    "destination" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'destination'::"text")) STORED,
    "failure_code" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'failure_code'::"text")) STORED,
    "on_behalf_of" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'on_behalf_of'::"text")) STORED,
    "fraud_details" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'fraud_details'::"text")) STORED,
    "receipt_email" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'receipt_email'::"text")) STORED,
    "payment_intent" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'payment_intent'::"text")) STORED,
    "receipt_number" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'receipt_number'::"text")) STORED,
    "transfer_group" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'transfer_group'::"text")) STORED,
    "amount_refunded" bigint GENERATED ALWAYS AS ((("_raw_data" ->> 'amount_refunded'::"text"))::bigint) STORED,
    "application_fee" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'application_fee'::"text")) STORED,
    "failure_message" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'failure_message'::"text")) STORED,
    "source_transfer" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'source_transfer'::"text")) STORED,
    "balance_transaction" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'balance_transaction'::"text")) STORED,
    "statement_descriptor" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'statement_descriptor'::"text")) STORED,
    "payment_method_details" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'payment_method_details'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: checkout_session_line_items; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."checkout_session_line_items" (
    "_updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "amount_discount" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'amount_discount'::"text"))::integer) STORED,
    "amount_subtotal" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'amount_subtotal'::"text"))::integer) STORED,
    "amount_tax" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'amount_tax'::"text"))::integer) STORED,
    "amount_total" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'amount_total'::"text"))::integer) STORED,
    "currency" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'currency'::"text")) STORED,
    "description" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'description'::"text")) STORED,
    "price" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'price'::"text")) STORED,
    "quantity" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'quantity'::"text"))::integer) STORED,
    "checkout_session" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'checkout_session'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: checkout_sessions; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."checkout_sessions" (
    "_updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "adaptive_pricing" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'adaptive_pricing'::"text")) STORED,
    "after_expiration" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'after_expiration'::"text")) STORED,
    "allow_promotion_codes" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'allow_promotion_codes'::"text"))::boolean) STORED,
    "amount_subtotal" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'amount_subtotal'::"text"))::integer) STORED,
    "amount_total" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'amount_total'::"text"))::integer) STORED,
    "automatic_tax" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'automatic_tax'::"text")) STORED,
    "billing_address_collection" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'billing_address_collection'::"text")) STORED,
    "cancel_url" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'cancel_url'::"text")) STORED,
    "client_reference_id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'client_reference_id'::"text")) STORED,
    "client_secret" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'client_secret'::"text")) STORED,
    "collected_information" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'collected_information'::"text")) STORED,
    "consent" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'consent'::"text")) STORED,
    "consent_collection" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'consent_collection'::"text")) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "currency" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'currency'::"text")) STORED,
    "currency_conversion" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'currency_conversion'::"text")) STORED,
    "custom_fields" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'custom_fields'::"text")) STORED,
    "custom_text" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'custom_text'::"text")) STORED,
    "customer" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'customer'::"text")) STORED,
    "customer_creation" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'customer_creation'::"text")) STORED,
    "customer_details" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'customer_details'::"text")) STORED,
    "customer_email" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'customer_email'::"text")) STORED,
    "discounts" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'discounts'::"text")) STORED,
    "expires_at" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'expires_at'::"text"))::integer) STORED,
    "invoice" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'invoice'::"text")) STORED,
    "invoice_creation" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'invoice_creation'::"text")) STORED,
    "livemode" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'livemode'::"text"))::boolean) STORED,
    "locale" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'locale'::"text")) STORED,
    "metadata" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'metadata'::"text")) STORED,
    "mode" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'mode'::"text")) STORED,
    "optional_items" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'optional_items'::"text")) STORED,
    "payment_intent" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'payment_intent'::"text")) STORED,
    "payment_link" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'payment_link'::"text")) STORED,
    "payment_method_collection" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'payment_method_collection'::"text")) STORED,
    "payment_method_configuration_details" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'payment_method_configuration_details'::"text")) STORED,
    "payment_method_options" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'payment_method_options'::"text")) STORED,
    "payment_method_types" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'payment_method_types'::"text")) STORED,
    "payment_status" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'payment_status'::"text")) STORED,
    "permissions" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'permissions'::"text")) STORED,
    "phone_number_collection" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'phone_number_collection'::"text")) STORED,
    "presentment_details" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'presentment_details'::"text")) STORED,
    "recovered_from" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'recovered_from'::"text")) STORED,
    "redirect_on_completion" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'redirect_on_completion'::"text")) STORED,
    "return_url" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'return_url'::"text")) STORED,
    "saved_payment_method_options" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'saved_payment_method_options'::"text")) STORED,
    "setup_intent" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'setup_intent'::"text")) STORED,
    "shipping_address_collection" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'shipping_address_collection'::"text")) STORED,
    "shipping_cost" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'shipping_cost'::"text")) STORED,
    "shipping_details" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'shipping_details'::"text")) STORED,
    "shipping_options" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'shipping_options'::"text")) STORED,
    "status" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'status'::"text")) STORED,
    "submit_type" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'submit_type'::"text")) STORED,
    "subscription" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'subscription'::"text")) STORED,
    "success_url" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'success_url'::"text")) STORED,
    "tax_id_collection" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'tax_id_collection'::"text")) STORED,
    "total_details" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'total_details'::"text")) STORED,
    "ui_mode" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'ui_mode'::"text")) STORED,
    "url" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'url'::"text")) STORED,
    "wallet_options" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'wallet_options'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: coupons; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."coupons" (
    "_updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "name" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'name'::"text")) STORED,
    "valid" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'valid'::"text"))::boolean) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "updated" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'updated'::"text"))::integer) STORED,
    "currency" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'currency'::"text")) STORED,
    "duration" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'duration'::"text")) STORED,
    "livemode" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'livemode'::"text"))::boolean) STORED,
    "metadata" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'metadata'::"text")) STORED,
    "redeem_by" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'redeem_by'::"text"))::integer) STORED,
    "amount_off" bigint GENERATED ALWAYS AS ((("_raw_data" ->> 'amount_off'::"text"))::bigint) STORED,
    "percent_off" double precision GENERATED ALWAYS AS ((("_raw_data" ->> 'percent_off'::"text"))::double precision) STORED,
    "times_redeemed" bigint GENERATED ALWAYS AS ((("_raw_data" ->> 'times_redeemed'::"text"))::bigint) STORED,
    "max_redemptions" bigint GENERATED ALWAYS AS ((("_raw_data" ->> 'max_redemptions'::"text"))::bigint) STORED,
    "duration_in_months" bigint GENERATED ALWAYS AS ((("_raw_data" ->> 'duration_in_months'::"text"))::bigint) STORED,
    "percent_off_precise" double precision GENERATED ALWAYS AS ((("_raw_data" ->> 'percent_off_precise'::"text"))::double precision) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: credit_notes; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."credit_notes" (
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "amount" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'amount'::"text"))::integer) STORED,
    "amount_shipping" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'amount_shipping'::"text"))::integer) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "currency" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'currency'::"text")) STORED,
    "customer" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'customer'::"text")) STORED,
    "customer_balance_transaction" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'customer_balance_transaction'::"text")) STORED,
    "discount_amount" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'discount_amount'::"text"))::integer) STORED,
    "discount_amounts" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'discount_amounts'::"text")) STORED,
    "invoice" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'invoice'::"text")) STORED,
    "lines" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'lines'::"text")) STORED,
    "livemode" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'livemode'::"text"))::boolean) STORED,
    "memo" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'memo'::"text")) STORED,
    "metadata" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'metadata'::"text")) STORED,
    "number" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'number'::"text")) STORED,
    "out_of_band_amount" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'out_of_band_amount'::"text"))::integer) STORED,
    "pdf" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'pdf'::"text")) STORED,
    "reason" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'reason'::"text")) STORED,
    "refund" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'refund'::"text")) STORED,
    "shipping_cost" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'shipping_cost'::"text")) STORED,
    "status" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'status'::"text")) STORED,
    "subtotal" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'subtotal'::"text"))::integer) STORED,
    "subtotal_excluding_tax" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'subtotal_excluding_tax'::"text"))::integer) STORED,
    "tax_amounts" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'tax_amounts'::"text")) STORED,
    "total" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'total'::"text"))::integer) STORED,
    "total_excluding_tax" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'total_excluding_tax'::"text"))::integer) STORED,
    "type" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'type'::"text")) STORED,
    "voided_at" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'voided_at'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: customers; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."customers" (
    "_updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "address" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'address'::"text")) STORED,
    "description" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'description'::"text")) STORED,
    "email" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'email'::"text")) STORED,
    "metadata" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'metadata'::"text")) STORED,
    "name" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'name'::"text")) STORED,
    "phone" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'phone'::"text")) STORED,
    "shipping" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'shipping'::"text")) STORED,
    "balance" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'balance'::"text"))::integer) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "currency" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'currency'::"text")) STORED,
    "default_source" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'default_source'::"text")) STORED,
    "delinquent" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'delinquent'::"text"))::boolean) STORED,
    "discount" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'discount'::"text")) STORED,
    "invoice_prefix" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'invoice_prefix'::"text")) STORED,
    "invoice_settings" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'invoice_settings'::"text")) STORED,
    "livemode" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'livemode'::"text"))::boolean) STORED,
    "next_invoice_sequence" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'next_invoice_sequence'::"text"))::integer) STORED,
    "preferred_locales" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'preferred_locales'::"text")) STORED,
    "tax_exempt" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'tax_exempt'::"text")) STORED,
    "deleted" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'deleted'::"text"))::boolean) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: disputes; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."disputes" (
    "_updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "amount" bigint GENERATED ALWAYS AS ((("_raw_data" ->> 'amount'::"text"))::bigint) STORED,
    "charge" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'charge'::"text")) STORED,
    "reason" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'reason'::"text")) STORED,
    "status" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'status'::"text")) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "updated" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'updated'::"text"))::integer) STORED,
    "currency" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'currency'::"text")) STORED,
    "evidence" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'evidence'::"text")) STORED,
    "livemode" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'livemode'::"text"))::boolean) STORED,
    "metadata" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'metadata'::"text")) STORED,
    "evidence_details" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'evidence_details'::"text")) STORED,
    "balance_transactions" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'balance_transactions'::"text")) STORED,
    "is_charge_refundable" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'is_charge_refundable'::"text"))::boolean) STORED,
    "payment_intent" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'payment_intent'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: early_fraud_warnings; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."early_fraud_warnings" (
    "_updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "actionable" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'actionable'::"text"))::boolean) STORED,
    "charge" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'charge'::"text")) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "fraud_type" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'fraud_type'::"text")) STORED,
    "livemode" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'livemode'::"text"))::boolean) STORED,
    "payment_intent" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'payment_intent'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: events; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."events" (
    "_updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "data" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'data'::"text")) STORED,
    "type" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'type'::"text")) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "request" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'request'::"text")) STORED,
    "updated" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'updated'::"text"))::integer) STORED,
    "livemode" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'livemode'::"text"))::boolean) STORED,
    "api_version" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'api_version'::"text")) STORED,
    "pending_webhooks" bigint GENERATED ALWAYS AS ((("_raw_data" ->> 'pending_webhooks'::"text"))::bigint) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: features; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."features" (
    "_updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "livemode" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'livemode'::"text"))::boolean) STORED,
    "name" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'name'::"text")) STORED,
    "lookup_key" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'lookup_key'::"text")) STORED,
    "active" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'active'::"text"))::boolean) STORED,
    "metadata" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'metadata'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: invoices; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."invoices" (
    "_updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "auto_advance" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'auto_advance'::"text"))::boolean) STORED,
    "collection_method" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'collection_method'::"text")) STORED,
    "currency" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'currency'::"text")) STORED,
    "description" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'description'::"text")) STORED,
    "hosted_invoice_url" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'hosted_invoice_url'::"text")) STORED,
    "lines" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'lines'::"text")) STORED,
    "period_end" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'period_end'::"text"))::integer) STORED,
    "period_start" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'period_start'::"text"))::integer) STORED,
    "status" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'status'::"text")) STORED,
    "total" bigint GENERATED ALWAYS AS ((("_raw_data" ->> 'total'::"text"))::bigint) STORED,
    "account_country" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'account_country'::"text")) STORED,
    "account_name" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'account_name'::"text")) STORED,
    "account_tax_ids" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'account_tax_ids'::"text")) STORED,
    "amount_due" bigint GENERATED ALWAYS AS ((("_raw_data" ->> 'amount_due'::"text"))::bigint) STORED,
    "amount_paid" bigint GENERATED ALWAYS AS ((("_raw_data" ->> 'amount_paid'::"text"))::bigint) STORED,
    "amount_remaining" bigint GENERATED ALWAYS AS ((("_raw_data" ->> 'amount_remaining'::"text"))::bigint) STORED,
    "application_fee_amount" bigint GENERATED ALWAYS AS ((("_raw_data" ->> 'application_fee_amount'::"text"))::bigint) STORED,
    "attempt_count" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'attempt_count'::"text"))::integer) STORED,
    "attempted" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'attempted'::"text"))::boolean) STORED,
    "billing_reason" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'billing_reason'::"text")) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "custom_fields" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'custom_fields'::"text")) STORED,
    "customer_address" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'customer_address'::"text")) STORED,
    "customer_email" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'customer_email'::"text")) STORED,
    "customer_name" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'customer_name'::"text")) STORED,
    "customer_phone" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'customer_phone'::"text")) STORED,
    "customer_shipping" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'customer_shipping'::"text")) STORED,
    "customer_tax_exempt" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'customer_tax_exempt'::"text")) STORED,
    "customer_tax_ids" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'customer_tax_ids'::"text")) STORED,
    "default_tax_rates" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'default_tax_rates'::"text")) STORED,
    "discount" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'discount'::"text")) STORED,
    "discounts" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'discounts'::"text")) STORED,
    "due_date" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'due_date'::"text"))::integer) STORED,
    "ending_balance" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'ending_balance'::"text"))::integer) STORED,
    "footer" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'footer'::"text")) STORED,
    "invoice_pdf" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'invoice_pdf'::"text")) STORED,
    "last_finalization_error" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'last_finalization_error'::"text")) STORED,
    "livemode" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'livemode'::"text"))::boolean) STORED,
    "next_payment_attempt" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'next_payment_attempt'::"text"))::integer) STORED,
    "number" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'number'::"text")) STORED,
    "paid" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'paid'::"text"))::boolean) STORED,
    "payment_settings" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'payment_settings'::"text")) STORED,
    "post_payment_credit_notes_amount" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'post_payment_credit_notes_amount'::"text"))::integer) STORED,
    "pre_payment_credit_notes_amount" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'pre_payment_credit_notes_amount'::"text"))::integer) STORED,
    "receipt_number" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'receipt_number'::"text")) STORED,
    "starting_balance" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'starting_balance'::"text"))::integer) STORED,
    "statement_descriptor" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'statement_descriptor'::"text")) STORED,
    "status_transitions" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'status_transitions'::"text")) STORED,
    "subtotal" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'subtotal'::"text"))::integer) STORED,
    "tax" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'tax'::"text"))::integer) STORED,
    "total_discount_amounts" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'total_discount_amounts'::"text")) STORED,
    "total_tax_amounts" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'total_tax_amounts'::"text")) STORED,
    "transfer_data" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'transfer_data'::"text")) STORED,
    "webhooks_delivered_at" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'webhooks_delivered_at'::"text"))::integer) STORED,
    "customer" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'customer'::"text")) STORED,
    "subscription" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'subscription'::"text")) STORED,
    "payment_intent" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'payment_intent'::"text")) STORED,
    "default_payment_method" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'default_payment_method'::"text")) STORED,
    "default_source" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'default_source'::"text")) STORED,
    "on_behalf_of" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'on_behalf_of'::"text")) STORED,
    "charge" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'charge'::"text")) STORED,
    "metadata" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'metadata'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: payment_intents; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."payment_intents" (
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "amount" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'amount'::"text"))::integer) STORED,
    "amount_capturable" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'amount_capturable'::"text"))::integer) STORED,
    "amount_details" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'amount_details'::"text")) STORED,
    "amount_received" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'amount_received'::"text"))::integer) STORED,
    "application" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'application'::"text")) STORED,
    "application_fee_amount" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'application_fee_amount'::"text"))::integer) STORED,
    "automatic_payment_methods" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'automatic_payment_methods'::"text")) STORED,
    "canceled_at" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'canceled_at'::"text"))::integer) STORED,
    "cancellation_reason" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'cancellation_reason'::"text")) STORED,
    "capture_method" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'capture_method'::"text")) STORED,
    "client_secret" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'client_secret'::"text")) STORED,
    "confirmation_method" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'confirmation_method'::"text")) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "currency" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'currency'::"text")) STORED,
    "customer" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'customer'::"text")) STORED,
    "description" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'description'::"text")) STORED,
    "invoice" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'invoice'::"text")) STORED,
    "last_payment_error" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'last_payment_error'::"text")) STORED,
    "livemode" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'livemode'::"text"))::boolean) STORED,
    "metadata" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'metadata'::"text")) STORED,
    "next_action" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'next_action'::"text")) STORED,
    "on_behalf_of" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'on_behalf_of'::"text")) STORED,
    "payment_method" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'payment_method'::"text")) STORED,
    "payment_method_options" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'payment_method_options'::"text")) STORED,
    "payment_method_types" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'payment_method_types'::"text")) STORED,
    "processing" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'processing'::"text")) STORED,
    "receipt_email" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'receipt_email'::"text")) STORED,
    "review" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'review'::"text")) STORED,
    "setup_future_usage" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'setup_future_usage'::"text")) STORED,
    "shipping" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'shipping'::"text")) STORED,
    "statement_descriptor" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'statement_descriptor'::"text")) STORED,
    "statement_descriptor_suffix" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'statement_descriptor_suffix'::"text")) STORED,
    "status" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'status'::"text")) STORED,
    "transfer_data" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'transfer_data'::"text")) STORED,
    "transfer_group" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'transfer_group'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: payment_methods; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."payment_methods" (
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "customer" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'customer'::"text")) STORED,
    "type" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'type'::"text")) STORED,
    "billing_details" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'billing_details'::"text")) STORED,
    "metadata" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'metadata'::"text")) STORED,
    "card" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'card'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: payouts; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."payouts" (
    "_updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "date" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'date'::"text")) STORED,
    "type" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'type'::"text")) STORED,
    "amount" bigint GENERATED ALWAYS AS ((("_raw_data" ->> 'amount'::"text"))::bigint) STORED,
    "method" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'method'::"text")) STORED,
    "status" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'status'::"text")) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "updated" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'updated'::"text"))::integer) STORED,
    "currency" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'currency'::"text")) STORED,
    "livemode" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'livemode'::"text"))::boolean) STORED,
    "metadata" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'metadata'::"text")) STORED,
    "automatic" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'automatic'::"text"))::boolean) STORED,
    "recipient" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'recipient'::"text")) STORED,
    "description" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'description'::"text")) STORED,
    "destination" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'destination'::"text")) STORED,
    "source_type" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'source_type'::"text")) STORED,
    "arrival_date" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'arrival_date'::"text")) STORED,
    "bank_account" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'bank_account'::"text")) STORED,
    "failure_code" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'failure_code'::"text")) STORED,
    "transfer_group" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'transfer_group'::"text")) STORED,
    "amount_reversed" bigint GENERATED ALWAYS AS ((("_raw_data" ->> 'amount_reversed'::"text"))::bigint) STORED,
    "failure_message" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'failure_message'::"text")) STORED,
    "source_transaction" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'source_transaction'::"text")) STORED,
    "balance_transaction" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'balance_transaction'::"text")) STORED,
    "statement_descriptor" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'statement_descriptor'::"text")) STORED,
    "statement_description" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'statement_description'::"text")) STORED,
    "failure_balance_transaction" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'failure_balance_transaction'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: plans; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."plans" (
    "_updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "name" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'name'::"text")) STORED,
    "tiers" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'tiers'::"text")) STORED,
    "active" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'active'::"text"))::boolean) STORED,
    "amount" bigint GENERATED ALWAYS AS ((("_raw_data" ->> 'amount'::"text"))::bigint) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "product" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'product'::"text")) STORED,
    "updated" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'updated'::"text"))::integer) STORED,
    "currency" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'currency'::"text")) STORED,
    "interval" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'interval'::"text")) STORED,
    "livemode" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'livemode'::"text"))::boolean) STORED,
    "metadata" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'metadata'::"text")) STORED,
    "nickname" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'nickname'::"text")) STORED,
    "tiers_mode" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'tiers_mode'::"text")) STORED,
    "usage_type" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'usage_type'::"text")) STORED,
    "billing_scheme" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'billing_scheme'::"text")) STORED,
    "interval_count" bigint GENERATED ALWAYS AS ((("_raw_data" ->> 'interval_count'::"text"))::bigint) STORED,
    "aggregate_usage" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'aggregate_usage'::"text")) STORED,
    "transform_usage" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'transform_usage'::"text")) STORED,
    "trial_period_days" bigint GENERATED ALWAYS AS ((("_raw_data" ->> 'trial_period_days'::"text"))::bigint) STORED,
    "statement_descriptor" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'statement_descriptor'::"text")) STORED,
    "statement_description" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'statement_description'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: prices; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."prices" (
    "_updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "active" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'active'::"text"))::boolean) STORED,
    "currency" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'currency'::"text")) STORED,
    "metadata" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'metadata'::"text")) STORED,
    "nickname" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'nickname'::"text")) STORED,
    "recurring" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'recurring'::"text")) STORED,
    "type" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'type'::"text")) STORED,
    "unit_amount" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'unit_amount'::"text"))::integer) STORED,
    "billing_scheme" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'billing_scheme'::"text")) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "livemode" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'livemode'::"text"))::boolean) STORED,
    "lookup_key" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'lookup_key'::"text")) STORED,
    "tiers_mode" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'tiers_mode'::"text")) STORED,
    "transform_quantity" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'transform_quantity'::"text")) STORED,
    "unit_amount_decimal" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'unit_amount_decimal'::"text")) STORED,
    "product" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'product'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: products; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."products" (
    "_updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "active" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'active'::"text"))::boolean) STORED,
    "default_price" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'default_price'::"text")) STORED,
    "description" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'description'::"text")) STORED,
    "metadata" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'metadata'::"text")) STORED,
    "name" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'name'::"text")) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "images" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'images'::"text")) STORED,
    "marketing_features" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'marketing_features'::"text")) STORED,
    "livemode" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'livemode'::"text"))::boolean) STORED,
    "package_dimensions" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'package_dimensions'::"text")) STORED,
    "shippable" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'shippable'::"text"))::boolean) STORED,
    "statement_descriptor" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'statement_descriptor'::"text")) STORED,
    "unit_label" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'unit_label'::"text")) STORED,
    "updated" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'updated'::"text"))::integer) STORED,
    "url" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'url'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: refunds; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."refunds" (
    "_updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "amount" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'amount'::"text"))::integer) STORED,
    "balance_transaction" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'balance_transaction'::"text")) STORED,
    "charge" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'charge'::"text")) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "currency" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'currency'::"text")) STORED,
    "destination_details" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'destination_details'::"text")) STORED,
    "metadata" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'metadata'::"text")) STORED,
    "payment_intent" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'payment_intent'::"text")) STORED,
    "reason" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'reason'::"text")) STORED,
    "receipt_number" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'receipt_number'::"text")) STORED,
    "source_transfer_reversal" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'source_transfer_reversal'::"text")) STORED,
    "status" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'status'::"text")) STORED,
    "transfer_reversal" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'transfer_reversal'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: reviews; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."reviews" (
    "_updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "billing_zip" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'billing_zip'::"text")) STORED,
    "charge" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'charge'::"text")) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "closed_reason" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'closed_reason'::"text")) STORED,
    "livemode" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'livemode'::"text"))::boolean) STORED,
    "ip_address" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'ip_address'::"text")) STORED,
    "ip_address_location" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'ip_address_location'::"text")) STORED,
    "open" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'open'::"text"))::boolean) STORED,
    "opened_reason" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'opened_reason'::"text")) STORED,
    "payment_intent" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'payment_intent'::"text")) STORED,
    "reason" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'reason'::"text")) STORED,
    "session" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'session'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: setup_intents; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."setup_intents" (
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "customer" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'customer'::"text")) STORED,
    "description" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'description'::"text")) STORED,
    "payment_method" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'payment_method'::"text")) STORED,
    "status" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'status'::"text")) STORED,
    "usage" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'usage'::"text")) STORED,
    "cancellation_reason" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'cancellation_reason'::"text")) STORED,
    "latest_attempt" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'latest_attempt'::"text")) STORED,
    "mandate" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'mandate'::"text")) STORED,
    "single_use_mandate" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'single_use_mandate'::"text")) STORED,
    "on_behalf_of" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'on_behalf_of'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: subscription_items; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."subscription_items" (
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "billing_thresholds" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'billing_thresholds'::"text")) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "deleted" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'deleted'::"text"))::boolean) STORED,
    "metadata" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'metadata'::"text")) STORED,
    "quantity" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'quantity'::"text"))::integer) STORED,
    "price" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'price'::"text")) STORED,
    "subscription" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'subscription'::"text")) STORED,
    "tax_rates" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'tax_rates'::"text")) STORED,
    "current_period_end" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'current_period_end'::"text"))::integer) STORED,
    "current_period_start" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'current_period_start'::"text"))::integer) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: subscription_schedules; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."subscription_schedules" (
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "application" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'application'::"text")) STORED,
    "canceled_at" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'canceled_at'::"text"))::integer) STORED,
    "completed_at" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'completed_at'::"text"))::integer) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "current_phase" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'current_phase'::"text")) STORED,
    "customer" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'customer'::"text")) STORED,
    "default_settings" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'default_settings'::"text")) STORED,
    "end_behavior" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'end_behavior'::"text")) STORED,
    "livemode" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'livemode'::"text"))::boolean) STORED,
    "metadata" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'metadata'::"text")) STORED,
    "phases" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'phases'::"text")) STORED,
    "released_at" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'released_at'::"text"))::integer) STORED,
    "released_subscription" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'released_subscription'::"text")) STORED,
    "status" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'status'::"text")) STORED,
    "subscription" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'subscription'::"text")) STORED,
    "test_clock" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'test_clock'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: subscriptions; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."subscriptions" (
    "_updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "cancel_at_period_end" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'cancel_at_period_end'::"text"))::boolean) STORED,
    "current_period_end" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'current_period_end'::"text"))::integer) STORED,
    "current_period_start" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'current_period_start'::"text"))::integer) STORED,
    "default_payment_method" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'default_payment_method'::"text")) STORED,
    "items" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'items'::"text")) STORED,
    "metadata" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'metadata'::"text")) STORED,
    "pending_setup_intent" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'pending_setup_intent'::"text")) STORED,
    "pending_update" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'pending_update'::"text")) STORED,
    "status" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'status'::"text")) STORED,
    "application_fee_percent" double precision GENERATED ALWAYS AS ((("_raw_data" ->> 'application_fee_percent'::"text"))::double precision) STORED,
    "billing_cycle_anchor" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'billing_cycle_anchor'::"text"))::integer) STORED,
    "billing_thresholds" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'billing_thresholds'::"text")) STORED,
    "cancel_at" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'cancel_at'::"text"))::integer) STORED,
    "canceled_at" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'canceled_at'::"text"))::integer) STORED,
    "collection_method" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'collection_method'::"text")) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "days_until_due" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'days_until_due'::"text"))::integer) STORED,
    "default_source" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'default_source'::"text")) STORED,
    "default_tax_rates" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'default_tax_rates'::"text")) STORED,
    "discount" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'discount'::"text")) STORED,
    "ended_at" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'ended_at'::"text"))::integer) STORED,
    "livemode" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'livemode'::"text"))::boolean) STORED,
    "next_pending_invoice_item_invoice" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'next_pending_invoice_item_invoice'::"text"))::integer) STORED,
    "pause_collection" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'pause_collection'::"text")) STORED,
    "pending_invoice_item_interval" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'pending_invoice_item_interval'::"text")) STORED,
    "start_date" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'start_date'::"text"))::integer) STORED,
    "transfer_data" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'transfer_data'::"text")) STORED,
    "trial_end" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'trial_end'::"text")) STORED,
    "trial_start" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'trial_start'::"text")) STORED,
    "schedule" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'schedule'::"text")) STORED,
    "customer" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'customer'::"text")) STORED,
    "latest_invoice" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'latest_invoice'::"text")) STORED,
    "plan" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'plan'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: tax_ids; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE "stripe"."tax_ids" (
    "_last_synced_at" timestamp with time zone,
    "_raw_data" "jsonb",
    "_account_id" "text" NOT NULL,
    "object" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'object'::"text")) STORED,
    "country" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'country'::"text")) STORED,
    "customer" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'customer'::"text")) STORED,
    "type" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'type'::"text")) STORED,
    "value" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'value'::"text")) STORED,
    "created" integer GENERATED ALWAYS AS ((("_raw_data" ->> 'created'::"text"))::integer) STORED,
    "livemode" boolean GENERATED ALWAYS AS ((("_raw_data" ->> 'livemode'::"text"))::boolean) STORED,
    "owner" "jsonb" GENERATED ALWAYS AS (("_raw_data" -> 'owner'::"text")) STORED,
    "id" "text" GENERATED ALWAYS AS (("_raw_data" ->> 'id'::"text")) STORED NOT NULL
);

--
-- Name: a0p_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."a0p_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."a0p_events_id_seq"'::"regclass");

--
-- Name: admin_emails id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_emails" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."admin_emails_id_seq"'::"regclass");

--
-- Name: agent_instances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."agent_instances" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."agent_instances_id_seq"'::"regclass");

--
-- Name: agent_matches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."agent_matches" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."agent_matches_id_seq"'::"regclass");

--
-- Name: approval_scopes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."approval_scopes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."approval_scopes_id_seq"'::"regclass");

--
-- Name: automation_tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."automation_tasks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."automation_tasks_id_seq"'::"regclass");

--
-- Name: bandit_correlations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bandit_correlations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."bandit_correlations_id_seq"'::"regclass");

--
-- Name: bandit_pulls id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bandit_pulls" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."bandit_pulls_id_seq"'::"regclass");

--
-- Name: byok_keys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."byok_keys" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."byok_keys_id_seq"'::"regclass");

--
-- Name: command_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."command_history" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."command_history_id_seq"'::"regclass");

--
-- Name: conversations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."conversations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."conversations_id_seq"'::"regclass");

--
-- Name: cost_metrics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cost_metrics" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."cost_metrics_id_seq"'::"regclass");

--
-- Name: custom_tools id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."custom_tools" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."custom_tools_id_seq"'::"regclass");

--
-- Name: deals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."deals" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."deals_id_seq"'::"regclass");

--
-- Name: discovery_drafts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."discovery_drafts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."discovery_drafts_id_seq"'::"regclass");

--
-- Name: edcm_metric_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."edcm_metric_snapshots" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."edcm_metric_snapshots_id_seq"'::"regclass");

--
-- Name: edcm_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."edcm_snapshots" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."edcm_snapshots_id_seq"'::"regclass");

--
-- Name: fleet_benchmarks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fleet_benchmarks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fleet_benchmarks_id_seq"'::"regclass");

--
-- Name: fleet_contestants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fleet_contestants" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fleet_contestants_id_seq"'::"regclass");

--
-- Name: fleet_judgments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fleet_judgments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fleet_judgments_id_seq"'::"regclass");

--
-- Name: founders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."founders" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."founders_id_seq"'::"regclass");

--
-- Name: generated_images id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."generated_images" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."generated_images_id_seq"'::"regclass");

--
-- Name: heartbeat_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."heartbeat_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."heartbeat_logs_id_seq"'::"regclass");

--
-- Name: heartbeat_tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."heartbeat_tasks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."heartbeat_tasks_id_seq"'::"regclass");

--
-- Name: memory_projections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."memory_projections" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."memory_projections_id_seq"'::"regclass");

--
-- Name: memory_seeds id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."memory_seeds" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."memory_seeds_id_seq"'::"regclass");

--
-- Name: memory_tensor_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."memory_tensor_snapshots" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."memory_tensor_snapshots_id_seq"'::"regclass");

--
-- Name: message_attachments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_attachments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."message_attachments_id_seq"'::"regclass");

--
-- Name: messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."messages" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."messages_id_seq"'::"regclass");

--
-- Name: security_probes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."security_probes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."security_probes_id_seq"'::"regclass");

--
-- Name: settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."settings" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."settings_id_seq"'::"regclass");

--
-- Name: system_toggles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."system_toggles" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."system_toggles_id_seq"'::"regclass");

--
-- Name: tool_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tool_results" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tool_results_id_seq"'::"regclass");

--
-- Name: transcript_explanations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transcript_explanations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transcript_explanations_id_seq"'::"regclass");

--
-- Name: transcript_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transcript_messages" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transcript_messages_id_seq"'::"regclass");

--
-- Name: transcript_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transcript_reports" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transcript_reports_id_seq"'::"regclass");

--
-- Name: transcript_sources id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transcript_sources" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transcript_sources_id_seq"'::"regclass");

--
-- Name: transcript_uploads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transcript_uploads" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transcript_uploads_id_seq"'::"regclass");

--
-- Name: ws_modules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ws_modules" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ws_modules_id_seq"'::"regclass");

--
-- Name: _sync_status id; Type: DEFAULT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."_sync_status" ALTER COLUMN "id" SET DEFAULT "nextval"('"stripe"."_sync_status_id_seq"'::"regclass");

--
-- Name: a0p_events a0p_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."a0p_events"
    ADD CONSTRAINT "a0p_events_pkey" PRIMARY KEY ("id");

--
-- Name: a0p_settings a0p_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."a0p_settings"
    ADD CONSTRAINT "a0p_settings_pkey" PRIMARY KEY ("key");

--
-- Name: admin_emails admin_emails_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_emails"
    ADD CONSTRAINT "admin_emails_email_unique" UNIQUE ("email");

--
-- Name: admin_emails admin_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_emails"
    ADD CONSTRAINT "admin_emails_pkey" PRIMARY KEY ("id");

--
-- Name: agent_instances agent_instances_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."agent_instances"
    ADD CONSTRAINT "agent_instances_name_unique" UNIQUE ("name");

--
-- Name: agent_instances agent_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."agent_instances"
    ADD CONSTRAINT "agent_instances_pkey" PRIMARY KEY ("id");

--
-- Name: agent_logs agent_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."agent_logs"
    ADD CONSTRAINT "agent_logs_pkey" PRIMARY KEY ("id");

--
-- Name: agent_matches agent_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."agent_matches"
    ADD CONSTRAINT "agent_matches_pkey" PRIMARY KEY ("id");

--
-- Name: agent_runs agent_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id");

--
-- Name: approval_scopes approval_scopes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."approval_scopes"
    ADD CONSTRAINT "approval_scopes_pkey" PRIMARY KEY ("id");

--
-- Name: artifacts artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."artifacts"
    ADD CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id");

--
-- Name: automation_tasks automation_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."automation_tasks"
    ADD CONSTRAINT "automation_tasks_pkey" PRIMARY KEY ("id");

--
-- Name: bandit_correlations bandit_correlations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bandit_correlations"
    ADD CONSTRAINT "bandit_correlations_pkey" PRIMARY KEY ("id");

--
-- Name: bandit_pulls bandit_pulls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bandit_pulls"
    ADD CONSTRAINT "bandit_pulls_pkey" PRIMARY KEY ("id");

--
-- Name: byok_keys byok_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."byok_keys"
    ADD CONSTRAINT "byok_keys_pkey" PRIMARY KEY ("id");

--
-- Name: challenge_responses challenge_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."challenge_responses"
    ADD CONSTRAINT "challenge_responses_pkey" PRIMARY KEY ("id");

--
-- Name: command_history command_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."command_history"
    ADD CONSTRAINT "command_history_pkey" PRIMARY KEY ("id");

--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");

--
-- Name: cost_metrics cost_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cost_metrics"
    ADD CONSTRAINT "cost_metrics_pkey" PRIMARY KEY ("id");

--
-- Name: custom_tools custom_tools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."custom_tools"
    ADD CONSTRAINT "custom_tools_pkey" PRIMARY KEY ("id");

--
-- Name: deals deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_pkey" PRIMARY KEY ("id");

--
-- Name: discovery_drafts discovery_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."discovery_drafts"
    ADD CONSTRAINT "discovery_drafts_pkey" PRIMARY KEY ("id");

--
-- Name: edcm_metric_snapshots edcm_metric_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."edcm_metric_snapshots"
    ADD CONSTRAINT "edcm_metric_snapshots_pkey" PRIMARY KEY ("id");

--
-- Name: edcm_snapshots edcm_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."edcm_snapshots"
    ADD CONSTRAINT "edcm_snapshots_pkey" PRIMARY KEY ("id");

--
-- Name: explanation_credits explanation_credits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."explanation_credits"
    ADD CONSTRAINT "explanation_credits_pkey" PRIMARY KEY ("user_id");

--
-- Name: fleet_benchmark_runs fleet_benchmark_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fleet_benchmark_runs"
    ADD CONSTRAINT "fleet_benchmark_runs_pkey" PRIMARY KEY ("id");

--
-- Name: fleet_benchmarks fleet_benchmarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fleet_benchmarks"
    ADD CONSTRAINT "fleet_benchmarks_pkey" PRIMARY KEY ("id");

--
-- Name: fleet_contestant_runs fleet_contestant_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fleet_contestant_runs"
    ADD CONSTRAINT "fleet_contestant_runs_pkey" PRIMARY KEY ("id");

--
-- Name: fleet_contestants fleet_contestants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fleet_contestants"
    ADD CONSTRAINT "fleet_contestants_pkey" PRIMARY KEY ("id");

--
-- Name: fleet_judgments fleet_judgments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fleet_judgments"
    ADD CONSTRAINT "fleet_judgments_pkey" PRIMARY KEY ("id");

--
-- Name: founders founders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."founders"
    ADD CONSTRAINT "founders_pkey" PRIMARY KEY ("id");

--
-- Name: founders founders_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."founders"
    ADD CONSTRAINT "founders_user_id_unique" UNIQUE ("user_id");

--
-- Name: generated_images generated_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."generated_images"
    ADD CONSTRAINT "generated_images_pkey" PRIMARY KEY ("id");

--
-- Name: guest_token_usage guest_token_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."guest_token_usage"
    ADD CONSTRAINT "guest_token_usage_pkey" PRIMARY KEY ("id");

--
-- Name: heartbeat_logs heartbeat_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."heartbeat_logs"
    ADD CONSTRAINT "heartbeat_logs_pkey" PRIMARY KEY ("id");

--
-- Name: heartbeat_tasks heartbeat_tasks_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."heartbeat_tasks"
    ADD CONSTRAINT "heartbeat_tasks_name_unique" UNIQUE ("name");

--
-- Name: heartbeat_tasks heartbeat_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."heartbeat_tasks"
    ADD CONSTRAINT "heartbeat_tasks_pkey" PRIMARY KEY ("id");

--
-- Name: instance_chat_archives instance_chat_archives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."instance_chat_archives"
    ADD CONSTRAINT "instance_chat_archives_pkey" PRIMARY KEY ("id");

--
-- Name: instance_chats instance_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."instance_chats"
    ADD CONSTRAINT "instance_chats_pkey" PRIMARY KEY ("id");

--
-- Name: instance_memory instance_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."instance_memory"
    ADD CONSTRAINT "instance_memory_pkey" PRIMARY KEY ("id");

--
-- Name: instance_tasks instance_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."instance_tasks"
    ADD CONSTRAINT "instance_tasks_pkey" PRIMARY KEY ("id");

--
-- Name: memory_projections memory_projections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."memory_projections"
    ADD CONSTRAINT "memory_projections_pkey" PRIMARY KEY ("id");

--
-- Name: memory_seeds memory_seeds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."memory_seeds"
    ADD CONSTRAINT "memory_seeds_pkey" PRIMARY KEY ("id");

--
-- Name: memory_seeds memory_seeds_seed_index_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."memory_seeds"
    ADD CONSTRAINT "memory_seeds_seed_index_unique" UNIQUE ("seed_index");

--
-- Name: memory_tensor_snapshots memory_tensor_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."memory_tensor_snapshots"
    ADD CONSTRAINT "memory_tensor_snapshots_pkey" PRIMARY KEY ("id");

--
-- Name: message_attachments message_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id");

--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");

--
-- Name: model_instances model_instances_canonical_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."model_instances"
    ADD CONSTRAINT "model_instances_canonical_name_key" UNIQUE ("canonical_name");

--
-- Name: model_instances model_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."model_instances"
    ADD CONSTRAINT "model_instances_pkey" PRIMARY KEY ("id");

--
-- Name: processed_stripe_events processed_stripe_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."processed_stripe_events"
    ADD CONSTRAINT "processed_stripe_events_pkey" PRIMARY KEY ("event_id");

--
-- Name: prompt_contexts prompt_contexts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prompt_contexts"
    ADD CONSTRAINT "prompt_contexts_pkey" PRIMARY KEY ("name");

--
-- Name: recovery_attempts recovery_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."recovery_attempts"
    ADD CONSTRAINT "recovery_attempts_pkey" PRIMARY KEY ("user_id");

--
-- Name: security_probes security_probes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."security_probes"
    ADD CONSTRAINT "security_probes_pkey" PRIMARY KEY ("id");

--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("sid");

--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("id");

--
-- Name: system_toggles system_toggles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."system_toggles"
    ADD CONSTRAINT "system_toggles_pkey" PRIMARY KEY ("id");

--
-- Name: system_toggles system_toggles_subsystem_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."system_toggles"
    ADD CONSTRAINT "system_toggles_subsystem_unique" UNIQUE ("subsystem");

--
-- Name: tool_results tool_results_call_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tool_results"
    ADD CONSTRAINT "tool_results_call_id_key" UNIQUE ("call_id");

--
-- Name: tool_results tool_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tool_results"
    ADD CONSTRAINT "tool_results_pkey" PRIMARY KEY ("id");

--
-- Name: transcript_explanations transcript_explanations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transcript_explanations"
    ADD CONSTRAINT "transcript_explanations_pkey" PRIMARY KEY ("id");

--
-- Name: transcript_explanations transcript_explanations_report_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transcript_explanations"
    ADD CONSTRAINT "transcript_explanations_report_id_key" UNIQUE ("report_id");

--
-- Name: transcript_messages transcript_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transcript_messages"
    ADD CONSTRAINT "transcript_messages_pkey" PRIMARY KEY ("id");

--
-- Name: transcript_reports transcript_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transcript_reports"
    ADD CONSTRAINT "transcript_reports_pkey" PRIMARY KEY ("id");

--
-- Name: transcript_sources transcript_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transcript_sources"
    ADD CONSTRAINT "transcript_sources_pkey" PRIMARY KEY ("id");

--
-- Name: transcript_sources transcript_sources_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transcript_sources"
    ADD CONSTRAINT "transcript_sources_slug_unique" UNIQUE ("slug");

--
-- Name: transcript_uploads transcript_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transcript_uploads"
    ADD CONSTRAINT "transcript_uploads_pkey" PRIMARY KEY ("id");

--
-- Name: model_instances uq_model_instance_slot; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."model_instances"
    ADD CONSTRAINT "uq_model_instance_slot" UNIQUE ("role_slot");

--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_unique" UNIQUE ("email");

--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_key" UNIQUE ("username");

--
-- Name: ws_modules ws_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ws_modules"
    ADD CONSTRAINT "ws_modules_pkey" PRIMARY KEY ("id");

--
-- Name: ws_modules ws_modules_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ws_modules"
    ADD CONSTRAINT "ws_modules_slug_key" UNIQUE ("slug");

--
-- Name: _migrations _migrations_name_key; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."_migrations"
    ADD CONSTRAINT "_migrations_name_key" UNIQUE ("name");

--
-- Name: _migrations _migrations_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."_migrations"
    ADD CONSTRAINT "_migrations_pkey" PRIMARY KEY ("id");

--
-- Name: _sync_status _sync_status_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."_sync_status"
    ADD CONSTRAINT "_sync_status_pkey" PRIMARY KEY ("id");

--
-- Name: _sync_status _sync_status_resource_account_key; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."_sync_status"
    ADD CONSTRAINT "_sync_status_resource_account_key" UNIQUE ("resource", "account_id");

--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");

--
-- Name: active_entitlements active_entitlements_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."active_entitlements"
    ADD CONSTRAINT "active_entitlements_pkey" PRIMARY KEY ("id");

--
-- Name: charges charges_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."charges"
    ADD CONSTRAINT "charges_pkey" PRIMARY KEY ("id");

--
-- Name: checkout_session_line_items checkout_session_line_items_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."checkout_session_line_items"
    ADD CONSTRAINT "checkout_session_line_items_pkey" PRIMARY KEY ("id");

--
-- Name: checkout_sessions checkout_sessions_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."checkout_sessions"
    ADD CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("id");

--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."coupons"
    ADD CONSTRAINT "coupons_pkey" PRIMARY KEY ("id");

--
-- Name: credit_notes credit_notes_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."credit_notes"
    ADD CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id");

--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");

--
-- Name: disputes disputes_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."disputes"
    ADD CONSTRAINT "disputes_pkey" PRIMARY KEY ("id");

--
-- Name: early_fraud_warnings early_fraud_warnings_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."early_fraud_warnings"
    ADD CONSTRAINT "early_fraud_warnings_pkey" PRIMARY KEY ("id");

--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");

--
-- Name: features features_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."features"
    ADD CONSTRAINT "features_pkey" PRIMARY KEY ("id");

--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");

--
-- Name: _managed_webhooks managed_webhooks_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."_managed_webhooks"
    ADD CONSTRAINT "managed_webhooks_pkey" PRIMARY KEY ("id");

--
-- Name: _managed_webhooks managed_webhooks_url_account_unique; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."_managed_webhooks"
    ADD CONSTRAINT "managed_webhooks_url_account_unique" UNIQUE ("url", "account_id");

--
-- Name: payment_intents payment_intents_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."payment_intents"
    ADD CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id");

--
-- Name: payment_methods payment_methods_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."payment_methods"
    ADD CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id");

--
-- Name: payouts payouts_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."payouts"
    ADD CONSTRAINT "payouts_pkey" PRIMARY KEY ("id");

--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");

--
-- Name: prices prices_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."prices"
    ADD CONSTRAINT "prices_pkey" PRIMARY KEY ("id");

--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");

--
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."refunds"
    ADD CONSTRAINT "refunds_pkey" PRIMARY KEY ("id");

--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");

--
-- Name: setup_intents setup_intents_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."setup_intents"
    ADD CONSTRAINT "setup_intents_pkey" PRIMARY KEY ("id");

--
-- Name: subscription_items subscription_items_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."subscription_items"
    ADD CONSTRAINT "subscription_items_pkey" PRIMARY KEY ("id");

--
-- Name: subscription_schedules subscription_schedules_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."subscription_schedules"
    ADD CONSTRAINT "subscription_schedules_pkey" PRIMARY KEY ("id");

--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");

--
-- Name: tax_ids tax_ids_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."tax_ids"
    ADD CONSTRAINT "tax_ids_pkey" PRIMARY KEY ("id");

--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_session_expire" ON "public"."sessions" USING "btree" ("expire");

--
-- Name: idx_agent_logs_event_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_agent_logs_event_ts" ON "public"."agent_logs" USING "btree" ("event", "ts" DESC NULLS LAST);

--
-- Name: idx_agent_logs_parent_depth_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_agent_logs_parent_depth_ts" ON "public"."agent_logs" USING "btree" ("parent_run_id", "depth", "ts");

--
-- Name: idx_agent_logs_run_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_agent_logs_run_ts" ON "public"."agent_logs" USING "btree" ("run_id", "ts");

--
-- Name: idx_agent_runs_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_agent_runs_parent" ON "public"."agent_runs" USING "btree" ("parent_run_id");

--
-- Name: idx_agent_runs_root_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_agent_runs_root_started" ON "public"."agent_runs" USING "btree" ("root_run_id", "started_at");

--
-- Name: idx_agent_runs_status_heartbeat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_agent_runs_status_heartbeat" ON "public"."agent_runs" USING "btree" ("status", "last_heartbeat_at");

--
-- Name: idx_agent_runs_status_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_agent_runs_status_started" ON "public"."agent_runs" USING "btree" ("status", "started_at" DESC NULLS LAST);

--
-- Name: idx_artifacts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_artifacts_created_at" ON "public"."artifacts" USING "btree" ("created_at" DESC NULLS LAST);

--
-- Name: idx_artifacts_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_artifacts_kind" ON "public"."artifacts" USING "btree" ("kind");

--
-- Name: idx_artifacts_public_kind_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_artifacts_public_kind_created" ON "public"."artifacts" USING "btree" ("public", "kind", "created_at" DESC NULLS LAST);

--
-- Name: idx_artifacts_sha256; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_artifacts_sha256" ON "public"."artifacts" USING "btree" ("sha256");

--
-- Name: idx_artifacts_tool_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_artifacts_tool_name" ON "public"."artifacts" USING "btree" ("tool_name");

--
-- Name: idx_bandit_pulls_arm_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_bandit_pulls_arm_ts" ON "public"."bandit_pulls" USING "btree" ("domain", "arm_id", "ts" DESC);

--
-- Name: idx_bandit_pulls_domain_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_bandit_pulls_domain_ts" ON "public"."bandit_pulls" USING "btree" ("domain", "ts" DESC);

--
-- Name: idx_bandit_pulls_spawn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_bandit_pulls_spawn" ON "public"."bandit_pulls" USING "btree" ("spawn_id");

--
-- Name: idx_conversations_user_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_conversations_user_updated" ON "public"."conversations" USING "btree" ("user_id", "updated_at" DESC NULLS LAST);

--
-- Name: idx_fleet_benchmarks_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_fleet_benchmarks_user" ON "public"."fleet_benchmarks" USING "btree" ("user_id", "updated_at" DESC);

--
-- Name: idx_fleet_contestant_runs_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_fleet_contestant_runs_run" ON "public"."fleet_contestant_runs" USING "btree" ("run_id", "slot");

--
-- Name: idx_fleet_contestants_bench; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_fleet_contestants_bench" ON "public"."fleet_contestants" USING "btree" ("benchmark_id", "slot");

--
-- Name: idx_fleet_runs_bench; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_fleet_runs_bench" ON "public"."fleet_benchmark_runs" USING "btree" ("benchmark_id", "started_at" DESC);

--
-- Name: idx_instance_memory_iid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_instance_memory_iid" ON "public"."instance_memory" USING "btree" ("instance_id");

--
-- Name: idx_message_attachments_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_message_attachments_message" ON "public"."message_attachments" USING "btree" ("message_id");

--
-- Name: idx_security_probes_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_security_probes_account" ON "public"."security_probes" USING "btree" ("account_hash", "created_at" DESC);

--
-- Name: idx_security_probes_type_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_security_probes_type_time" ON "public"."security_probes" USING "btree" ("probe_type", "created_at" DESC);

--
-- Name: idx_tool_results_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tool_results_created_at" ON "public"."tool_results" USING "btree" ("created_at");

--
-- Name: idx_transcript_explanations_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_transcript_explanations_user" ON "public"."transcript_explanations" USING "btree" ("user_id", "created_at" DESC);

--
-- Name: idx_transcript_messages_report; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_transcript_messages_report" ON "public"."transcript_messages" USING "btree" ("report_id", "idx");

--
-- Name: idx_transcript_uploads_report; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_transcript_uploads_report" ON "public"."transcript_uploads" USING "btree" ("report_id");

--
-- Name: idx_transcript_uploads_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_transcript_uploads_user" ON "public"."transcript_uploads" USING "btree" ("user_id", "created_at" DESC NULLS LAST);

--
-- Name: uq_approval_scope_user_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_approval_scope_user_scope" ON "public"."approval_scopes" USING "btree" ("user_id", "scope");

--
-- Name: uq_byok_user_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_byok_user_provider" ON "public"."byok_keys" USING "btree" ("user_id", "provider");

--
-- Name: uq_settings_user_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_settings_user_key" ON "public"."settings" USING "btree" ("user_id", "key");

--
-- Name: active_entitlements_lookup_key_key; Type: INDEX; Schema: stripe; Owner: -
--

CREATE UNIQUE INDEX "active_entitlements_lookup_key_key" ON "stripe"."active_entitlements" USING "btree" ("lookup_key") WHERE ("lookup_key" IS NOT NULL);

--
-- Name: features_lookup_key_key; Type: INDEX; Schema: stripe; Owner: -
--

CREATE UNIQUE INDEX "features_lookup_key_key" ON "stripe"."features" USING "btree" ("lookup_key") WHERE ("lookup_key" IS NOT NULL);

--
-- Name: idx_accounts_api_key_hashes; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "idx_accounts_api_key_hashes" ON "stripe"."accounts" USING "gin" ("api_key_hashes");

--
-- Name: idx_accounts_business_name; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "idx_accounts_business_name" ON "stripe"."accounts" USING "btree" ("business_name");

--
-- Name: idx_sync_status_resource_account; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "idx_sync_status_resource_account" ON "stripe"."_sync_status" USING "btree" ("resource", "account_id");

--
-- Name: stripe_active_entitlements_customer_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_active_entitlements_customer_idx" ON "stripe"."active_entitlements" USING "btree" ("customer");

--
-- Name: stripe_active_entitlements_feature_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_active_entitlements_feature_idx" ON "stripe"."active_entitlements" USING "btree" ("feature");

--
-- Name: stripe_checkout_session_line_items_price_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_checkout_session_line_items_price_idx" ON "stripe"."checkout_session_line_items" USING "btree" ("price");

--
-- Name: stripe_checkout_session_line_items_session_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_checkout_session_line_items_session_idx" ON "stripe"."checkout_session_line_items" USING "btree" ("checkout_session");

--
-- Name: stripe_checkout_sessions_customer_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_checkout_sessions_customer_idx" ON "stripe"."checkout_sessions" USING "btree" ("customer");

--
-- Name: stripe_checkout_sessions_invoice_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_checkout_sessions_invoice_idx" ON "stripe"."checkout_sessions" USING "btree" ("invoice");

--
-- Name: stripe_checkout_sessions_payment_intent_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_checkout_sessions_payment_intent_idx" ON "stripe"."checkout_sessions" USING "btree" ("payment_intent");

--
-- Name: stripe_checkout_sessions_subscription_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_checkout_sessions_subscription_idx" ON "stripe"."checkout_sessions" USING "btree" ("subscription");

--
-- Name: stripe_credit_notes_customer_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_credit_notes_customer_idx" ON "stripe"."credit_notes" USING "btree" ("customer");

--
-- Name: stripe_credit_notes_invoice_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_credit_notes_invoice_idx" ON "stripe"."credit_notes" USING "btree" ("invoice");

--
-- Name: stripe_dispute_created_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_dispute_created_idx" ON "stripe"."disputes" USING "btree" ("created");

--
-- Name: stripe_early_fraud_warnings_charge_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_early_fraud_warnings_charge_idx" ON "stripe"."early_fraud_warnings" USING "btree" ("charge");

--
-- Name: stripe_early_fraud_warnings_payment_intent_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_early_fraud_warnings_payment_intent_idx" ON "stripe"."early_fraud_warnings" USING "btree" ("payment_intent");

--
-- Name: stripe_invoices_customer_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_invoices_customer_idx" ON "stripe"."invoices" USING "btree" ("customer");

--
-- Name: stripe_invoices_subscription_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_invoices_subscription_idx" ON "stripe"."invoices" USING "btree" ("subscription");

--
-- Name: stripe_managed_webhooks_enabled_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_managed_webhooks_enabled_idx" ON "stripe"."_managed_webhooks" USING "btree" ("enabled");

--
-- Name: stripe_managed_webhooks_status_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_managed_webhooks_status_idx" ON "stripe"."_managed_webhooks" USING "btree" ("status");

--
-- Name: stripe_payment_intents_customer_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_payment_intents_customer_idx" ON "stripe"."payment_intents" USING "btree" ("customer");

--
-- Name: stripe_payment_intents_invoice_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_payment_intents_invoice_idx" ON "stripe"."payment_intents" USING "btree" ("invoice");

--
-- Name: stripe_payment_methods_customer_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_payment_methods_customer_idx" ON "stripe"."payment_methods" USING "btree" ("customer");

--
-- Name: stripe_refunds_charge_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_refunds_charge_idx" ON "stripe"."refunds" USING "btree" ("charge");

--
-- Name: stripe_refunds_payment_intent_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_refunds_payment_intent_idx" ON "stripe"."refunds" USING "btree" ("payment_intent");

--
-- Name: stripe_reviews_charge_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_reviews_charge_idx" ON "stripe"."reviews" USING "btree" ("charge");

--
-- Name: stripe_reviews_payment_intent_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_reviews_payment_intent_idx" ON "stripe"."reviews" USING "btree" ("payment_intent");

--
-- Name: stripe_setup_intents_customer_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_setup_intents_customer_idx" ON "stripe"."setup_intents" USING "btree" ("customer");

--
-- Name: stripe_tax_ids_customer_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX "stripe_tax_ids_customer_idx" ON "stripe"."tax_ids" USING "btree" ("customer");

--
-- Name: _managed_webhooks handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."_managed_webhooks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_metadata"();

--
-- Name: _sync_status handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."_sync_status" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_metadata"();

--
-- Name: accounts handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

--
-- Name: active_entitlements handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."active_entitlements" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

--
-- Name: charges handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."charges" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

--
-- Name: checkout_session_line_items handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."checkout_session_line_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

--
-- Name: checkout_sessions handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."checkout_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

--
-- Name: coupons handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."coupons" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

--
-- Name: customers handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

--
-- Name: disputes handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."disputes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

--
-- Name: early_fraud_warnings handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."early_fraud_warnings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

--
-- Name: events handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."events" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

--
-- Name: features handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."features" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

--
-- Name: invoices handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

--
-- Name: payouts handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."payouts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

--
-- Name: plans handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

--
-- Name: prices handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."prices" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

--
-- Name: products handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."products" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

--
-- Name: refunds handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."refunds" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

--
-- Name: reviews handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

--
-- Name: subscriptions handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "stripe"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

--
-- Name: challenge_responses challenge_responses_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."challenge_responses"
    ADD CONSTRAINT "challenge_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

--
-- Name: transcript_explanations fk_explanations_report; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transcript_explanations"
    ADD CONSTRAINT "fk_explanations_report" FOREIGN KEY ("report_id") REFERENCES "public"."transcript_reports"("id") ON DELETE CASCADE;

--
-- Name: transcript_messages fk_transcript_messages_report; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transcript_messages"
    ADD CONSTRAINT "fk_transcript_messages_report" FOREIGN KEY ("report_id") REFERENCES "public"."transcript_reports"("id") ON DELETE CASCADE;

--
-- Name: transcript_uploads fk_transcript_uploads_report; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transcript_uploads"
    ADD CONSTRAINT "fk_transcript_uploads_report" FOREIGN KEY ("report_id") REFERENCES "public"."transcript_reports"("id") ON DELETE SET NULL;

--
-- Name: message_attachments message_attachments_message_id_messages_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;

--
-- Name: messages messages_conversation_id_conversations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;

--
-- Name: active_entitlements fk_active_entitlements_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."active_entitlements"
    ADD CONSTRAINT "fk_active_entitlements_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: charges fk_charges_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."charges"
    ADD CONSTRAINT "fk_charges_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: checkout_session_line_items fk_checkout_session_line_items_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."checkout_session_line_items"
    ADD CONSTRAINT "fk_checkout_session_line_items_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: checkout_sessions fk_checkout_sessions_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."checkout_sessions"
    ADD CONSTRAINT "fk_checkout_sessions_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: credit_notes fk_credit_notes_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."credit_notes"
    ADD CONSTRAINT "fk_credit_notes_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: customers fk_customers_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."customers"
    ADD CONSTRAINT "fk_customers_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: disputes fk_disputes_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."disputes"
    ADD CONSTRAINT "fk_disputes_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: early_fraud_warnings fk_early_fraud_warnings_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."early_fraud_warnings"
    ADD CONSTRAINT "fk_early_fraud_warnings_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: features fk_features_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."features"
    ADD CONSTRAINT "fk_features_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: invoices fk_invoices_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."invoices"
    ADD CONSTRAINT "fk_invoices_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: _managed_webhooks fk_managed_webhooks_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."_managed_webhooks"
    ADD CONSTRAINT "fk_managed_webhooks_account" FOREIGN KEY ("account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: payment_intents fk_payment_intents_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."payment_intents"
    ADD CONSTRAINT "fk_payment_intents_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: payment_methods fk_payment_methods_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."payment_methods"
    ADD CONSTRAINT "fk_payment_methods_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: plans fk_plans_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."plans"
    ADD CONSTRAINT "fk_plans_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: prices fk_prices_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."prices"
    ADD CONSTRAINT "fk_prices_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: products fk_products_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."products"
    ADD CONSTRAINT "fk_products_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: refunds fk_refunds_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."refunds"
    ADD CONSTRAINT "fk_refunds_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: reviews fk_reviews_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."reviews"
    ADD CONSTRAINT "fk_reviews_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: setup_intents fk_setup_intents_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."setup_intents"
    ADD CONSTRAINT "fk_setup_intents_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: subscription_items fk_subscription_items_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."subscription_items"
    ADD CONSTRAINT "fk_subscription_items_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: subscription_schedules fk_subscription_schedules_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."subscription_schedules"
    ADD CONSTRAINT "fk_subscription_schedules_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: subscriptions fk_subscriptions_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."subscriptions"
    ADD CONSTRAINT "fk_subscriptions_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: _sync_status fk_sync_status_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."_sync_status"
    ADD CONSTRAINT "fk_sync_status_account" FOREIGN KEY ("account_id") REFERENCES "stripe"."accounts"("id");

--
-- Name: tax_ids fk_tax_ids_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY "stripe"."tax_ids"
    ADD CONSTRAINT "fk_tax_ids_account" FOREIGN KEY ("_account_id") REFERENCES "stripe"."accounts"("id");

--
-- PostgreSQL database dump complete
--

\unrestrict imlLf2yBIJvHpzyx5PsBh97ZiWWGsDVmcR2jCz9CqZZaaIfAlHv5gzp5xAMgvmI
