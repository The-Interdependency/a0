# 313:8
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, Float, DateTime, JSON,
    ARRAY, ForeignKey, UniqueConstraint, Index, text
)
from sqlalchemy.orm import declarative_base
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime

Base = declarative_base()


class Session(Base):
    __tablename__ = "sessions"
    sid = Column(String, primary_key=True)
    sess = Column(JSONB, nullable=False)
    expire = Column(DateTime, nullable=False)
    __table_args__ = (
        Index("IDX_session_expire", "expire"),
    )


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, server_default=text("gen_random_uuid()"))
    username = Column(String, unique=True)
    email = Column(String, unique=True)
    passphrase_hash = Column(String)
    display_name = Column(String)
    role = Column(String, nullable=False, server_default="user")
    is_active = Column(Boolean, nullable=False, server_default="true")
    login_count = Column(Integer, nullable=False, server_default="0")
    last_login_at = Column(DateTime)
    subscription_tier = Column(String(50), nullable=False, server_default="free")
    stripe_customer_id = Column(String)
    stripe_subscription_id = Column(String)
    subscription_status = Column(String(50), nullable=False, server_default="active")
    byok_enabled = Column(Boolean, nullable=False, server_default="false")
    founder_slot = Column(Integer)
    created_at = Column(DateTime, server_default=text("CURRENT_TIMESTAMP"))
    updated_at = Column(DateTime, server_default=text("CURRENT_TIMESTAMP"))


class Conversation(Base):
    __tablename__ = "conversations"
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(Text, nullable=False, server_default="New Chat")
    model = Column(Text, nullable=False, server_default="gemini")
    user_id = Column(String)
    context_boost = Column(Text, nullable=True)
    parent_conv_id = Column(Integer, ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True)
    subagent_status = Column(String(20), nullable=True)
    subagent_error = Column(Text, nullable=True)
    archived = Column(Boolean, nullable=False, server_default="false")
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    role = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    model = Column(Text)
    metadata_ = Column("metadata", JSONB)
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class AutomationTask(Base):
    __tablename__ = "automation_tasks"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False)
    spec_content = Column(Text, nullable=False)
    status = Column(Text, nullable=False, server_default="pending")
    result = Column(Text)
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class CommandHistory(Base):
    __tablename__ = "command_history"
    id = Column(Integer, primary_key=True, autoincrement=True)
    command = Column(Text, nullable=False)
    output = Column(Text)
    exit_code = Column(Integer)
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class A0pEvent(Base):
    __tablename__ = "a0p_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(Text, nullable=False)
    event_type = Column(Text, nullable=False)
    payload = Column(JSONB, nullable=False)
    prev_hash = Column(Text, nullable=False)
    hash = Column(Text, nullable=False)
    hmmm = Column(JSONB, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class HeartbeatLog(Base):
    __tablename__ = "heartbeat_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    status = Column(Text, nullable=False)
    hash_chain_valid = Column(Boolean)
    details = Column(JSONB)
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class CostMetric(Base):
    __tablename__ = "cost_metrics"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String)
    model = Column(Text, nullable=False)
    prompt_tokens = Column(Integer, nullable=False, server_default="0")
    completion_tokens = Column(Integer, nullable=False, server_default="0")
    cache_tokens = Column(Integer, nullable=False, server_default="0")
    estimated_cost = Column(Float, nullable=False, server_default="0")
    conversation_id = Column(Integer)
    stage = Column(Text)
    pipeline_preset = Column(Text)
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class EdcmSnapshot(Base):
    __tablename__ = "edcm_snapshots"
    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(Text)
    operator_grok = Column(JSONB)
    operator_gemini = Column(JSONB)
    operator_user = Column(JSONB)
    delta_bone = Column(Float)
    delta_align_grok = Column(Float)
    delta_align_gemini = Column(Float)
    decision = Column(Text)
    ptca_state = Column(JSONB)
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class BanditArm(Base):
    __tablename__ = "bandit_arms"
    id = Column(Integer, primary_key=True, autoincrement=True)
    domain = Column(Text, nullable=False)
    arm_name = Column(Text, nullable=False)
    pulls = Column(Integer, nullable=False, server_default="0")
    total_reward = Column(Float, nullable=False, server_default="0")
    avg_reward = Column(Float, nullable=False, server_default="0")
    ema_reward = Column(Float, nullable=False, server_default="0")
    ucb_score = Column(Float, nullable=False, server_default="0")
    enabled = Column(Boolean, nullable=False, server_default="true")
    last_pulled = Column(DateTime)
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class CustomTool(Base):
    __tablename__ = "custom_tools"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Text, nullable=False)
    name = Column(Text, nullable=False)
    description = Column(Text, nullable=False)
    parameters_schema = Column(JSONB)
    target_models = Column(ARRAY(Text))
    handler_type = Column(Text, nullable=False)
    handler_code = Column(Text, nullable=False)
    enabled = Column(Boolean, nullable=False, server_default="true")
    is_generated = Column(Boolean, nullable=False, server_default="false")
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class HeartbeatTask(Base):
    __tablename__ = "heartbeat_tasks"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False, unique=True)
    description = Column(Text)
    task_type = Column(Text, nullable=False)
    enabled = Column(Boolean, nullable=False, server_default="true")
    weight = Column(Float, nullable=False, server_default="1.0")
    interval_seconds = Column(Integer, nullable=False, server_default="300")
    last_run = Column(DateTime)
    last_result = Column(Text)
    handler_code = Column(Text)
    run_count = Column(Integer, nullable=False, server_default="0")
    scheduled_at = Column(DateTime)
    one_shot = Column(Boolean, nullable=False, server_default="false")
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class Deal(Base):
    __tablename__ = "deals"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Text, nullable=False)
    title = Column(Text, nullable=False)
    status = Column(Text, nullable=False, server_default="active")
    ceiling = Column(Float)
    walk_away = Column(Float)
    my_goals = Column(JSONB, server_default=text("'[]'::jsonb"))
    current_terms = Column(JSONB, server_default=text("'{}'::jsonb"))
    counter_history = Column(JSONB, server_default=text("'[]'::jsonb"))
    outcome = Column(Text)
    final_terms = Column(JSONB)
    conversation_id = Column(Integer)
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class EdcmMetricSnapshot(Base):
    __tablename__ = "edcm_metric_snapshots"
    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer)
    source = Column(Text, nullable=False)
    cm = Column(Float, nullable=False, server_default="0")
    da = Column(Float, nullable=False, server_default="0")
    drift = Column(Float, nullable=False, server_default="0")
    dvg = Column(Float, nullable=False, server_default="0")
    int_val = Column(Float, nullable=False, server_default="0")
    tbf = Column(Float, nullable=False, server_default="0")
    directives_fired = Column(ARRAY(Text))
    context_snippet = Column(Text)
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class MemorySeed(Base):
    __tablename__ = "memory_seeds"
    id = Column(Integer, primary_key=True, autoincrement=True)
    seed_index = Column(Integer, nullable=False, unique=True)
    label = Column(Text, nullable=False)
    summary = Column(Text, nullable=False, server_default="")
    original_summary = Column(Text, nullable=False, server_default="")
    pinned = Column(Boolean, nullable=False, server_default="false")
    enabled = Column(Boolean, nullable=False, server_default="true")
    weight = Column(Float, nullable=False, server_default="1.0")
    ptca_values = Column(JSONB)
    pcna_weights = Column(JSONB)
    sentinel_pass_count = Column(Integer, nullable=False, server_default="0")
    sentinel_fail_count = Column(Integer, nullable=False, server_default="0")
    last_sentinel_status = Column(Text)
    updated_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class MemoryProjection(Base):
    __tablename__ = "memory_projections"
    id = Column(Integer, primary_key=True, autoincrement=True)
    projection_in = Column(JSONB)
    projection_out = Column(JSONB)
    request_count = Column(Integer, nullable=False, server_default="0")
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class MemoryTensorSnapshot(Base):
    __tablename__ = "memory_tensor_snapshots"
    id = Column(Integer, primary_key=True, autoincrement=True)
    seeds_state = Column(JSONB)
    projection_in = Column(JSONB)
    projection_out = Column(JSONB)
    request_count = Column(Integer, nullable=False, server_default="0")
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class BanditCorrelation(Base):
    __tablename__ = "bandit_correlations"
    id = Column(Integer, primary_key=True, autoincrement=True)
    tool_arm = Column(Text)
    model_arm = Column(Text)
    ptca_arm = Column(Text)
    pcna_arm = Column(Text)
    joint_reward = Column(Float, nullable=False, server_default="0")
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SystemToggle(Base):
    __tablename__ = "system_toggles"
    id = Column(Integer, primary_key=True, autoincrement=True)
    subsystem = Column(Text, nullable=False, unique=True)
    enabled = Column(Boolean, nullable=False, server_default="true")
    parameters = Column(JSONB)
    updated_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class DiscoveryDraft(Base):
    __tablename__ = "discovery_drafts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    source_task = Column(Text, nullable=False)
    title = Column(Text, nullable=False)
    summary = Column(Text, nullable=False)
    relevance_score = Column(Float, nullable=False, server_default="0")
    source_data = Column(JSONB)
    promoted_to_conversation = Column(Boolean, nullable=False, server_default="false")
    conversation_id = Column(Integer)
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class TranscriptSource(Base):
    __tablename__ = "transcript_sources"
    id = Column(Integer, primary_key=True, autoincrement=True)
    slug = Column(String(100), nullable=False, unique=True)
    display_name = Column(String(200), nullable=False)
    file_count = Column(Integer, nullable=False, server_default="0")
    last_scanned_at = Column(DateTime)
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class TranscriptReport(Base):
    __tablename__ = "transcript_reports"
    id = Column(Integer, primary_key=True, autoincrement=True)
    source_slug = Column(String(100), nullable=False)
    message_count = Column(Integer, nullable=False, server_default="0")
    avg_cm = Column(Float, server_default="0")
    avg_da = Column(Float, server_default="0")
    avg_drift = Column(Float, server_default="0")
    avg_dvg = Column(Float, server_default="0")
    avg_int = Column(Float, server_default="0")
    avg_tbf = Column(Float, server_default="0")
    peak_metric = Column(Float, server_default="0")
    peak_metric_name = Column(Text)
    directives_fired = Column(JSONB)
    top_snippets = Column(JSONB)
    file_breakdown = Column(JSONB)
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class Founder(Base):
    __tablename__ = "founders"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, unique=True)
    display_name = Column(String(200), nullable=False)
    listed = Column(Boolean, nullable=False, server_default="false")
    subscribed_since = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    tier = Column(String(50), nullable=False, server_default="patron")


class PromptContext(Base):
    __tablename__ = "prompt_contexts"
    name = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False, server_default="")
    updated_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_by = Column(String)


class ByokKey(Base):
    __tablename__ = "byok_keys"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False)
    provider = Column(String(50), nullable=False)
    key_hash = Column(String(256), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    __table_args__ = (UniqueConstraint("user_id", "provider", name="uq_byok_user_provider"),)


class ApprovalScope(Base):
    __tablename__ = "approval_scopes"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False)
    scope = Column(String(100), nullable=False)
    granted_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    __table_args__ = (UniqueConstraint("user_id", "scope", name="uq_approval_scope_user_scope"),)


class WsModule(Base):
    """A user-defined or system-shadow console module.

    status values:
      system   — shadow record for a hardcoded route module; visible, immutable via API
      active   — user module mounted and live
      inactive — user module persisted but not mounted
      locked   — active/inactive module write-protected by its owner
      error    — compilation or mount failed; error_log has details
    """
    __tablename__ = "ws_modules"
    id = Column(Integer, primary_key=True, autoincrement=True)
    slug = Column(String(120), unique=True, nullable=False)
    name = Column(Text, nullable=False)
    description = Column(Text, nullable=False, server_default="")
    owner_id = Column(String, nullable=False)
    status = Column(String(20), nullable=False, server_default="inactive")
    handler_code = Column(Text)
    ui_meta = Column(JSONB, nullable=False, server_default="{}")
    route_config = Column(JSONB, nullable=False, server_default="{}")
    error_log = Column(Text)
    version = Column(Integer, nullable=False, server_default="1")
    content_hash = Column(String(64))
    last_swapped_at = Column(DateTime)
    created_at = Column(DateTime, server_default=text("CURRENT_TIMESTAMP"))
    updated_at = Column(DateTime, server_default=text("CURRENT_TIMESTAMP"))
# 313:8
