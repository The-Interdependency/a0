# 256:21 0:0 0:1
# === MODULE_BUILD ===
# id: test_a0_public_provider_policy
#   module_name: public provider policy tests
#   module_kind: experiment
#   summary: Proves the free-tier provider allowlist and multi-provider lane cap without touching network or storage.
#   owner: Erin Spencer
#   public_surface: none
#   internal_surface: test functions
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: self
#   rollout: CI
#   rollback: Remove this test with the public provider policy.
# === END MODULE_BUILD ===
import pytest

from python.services import public_access_policy


def test_public_allows_economical_single_provider(monkeypatch):
    monkeypatch.delenv("PUBLIC_PROVIDER_ALLOWLIST", raising=False)
    public_access_policy.enforce_public_provider_policy("free", "single", ["deepseek"])


def test_public_allows_two_economical_lanes(monkeypatch):
    monkeypatch.delenv("PUBLIC_MAX_PROVIDER_LANES", raising=False)
    public_access_policy.enforce_public_provider_policy(
        "free", "fan_out", ["deepseek", "gemini-lite"]
    )


def test_public_denies_premium_provider(monkeypatch):
    monkeypatch.delenv("PUBLIC_PROVIDER_ALLOWLIST", raising=False)
    with pytest.raises(public_access_policy.PublicAccessDenied):
        public_access_policy.enforce_public_provider_policy(
            "free", "single", ["openai-5.5-pro"]
        )


def test_public_denies_excess_lanes(monkeypatch):
    monkeypatch.setenv("PUBLIC_MAX_PROVIDER_LANES", "2")
    with pytest.raises(public_access_policy.PublicAccessDenied):
        public_access_policy.enforce_public_provider_policy(
            "free", "council", ["deepseek", "gemini-lite", "openai-nano"]
        )


def test_public_fleet_counts_calls_across_contestants(monkeypatch):
    monkeypatch.setenv("PUBLIC_MAX_PROVIDER_LANES", "2")
    contestants = [
        {"provider_id": "deepseek", "orchestration_mode": "single"},
        {"provider_id": "deepseek", "orchestration_mode": "single"},
        {"provider_id": "deepseek", "orchestration_mode": "single"},
    ]
    with pytest.raises(public_access_policy.PublicAccessDenied):
        public_access_policy.enforce_public_fleet_policy("free", contestants)


def test_ws_tier_is_not_subject_to_public_boundary():
    public_access_policy.enforce_public_provider_policy(
        "ws", "council", ["openai-5.5-pro"] * 6
    )
# 35:17 0:0 0:1

# Usage: DATABASE_URL=postgresql://localhost/a0p_check uv run pytest -q
# tests/test_publ_acce_poli_v0.0.0alpha.py. Providers/storage are faked below;
# these regression witnesses never call a paid model or mutate user data.
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock
from fastapi import HTTPException
from starlette.requests import Request


def request_for(uid="u1", role="user"):
    return Request({"type": "http", "headers": [
        (b"x-user-id", uid.encode()), (b"x-user-role", role.encode()),
    ]})


class FakeDatabase:
    def __init__(self, tier="free", mode="single"):
        self.tier, self.mode, self.statements = tier, mode, []

    @asynccontextmanager
    async def connect(self):
        yield self

    begin = connect

    async def execute(self, stmt, params=None):
        self.statements.append((str(stmt), params))
        rows = ([{"key": "orchestration_mode", "value": {"v": self.mode}}]
                if "SELECT key" in str(stmt) else [{"subscription_tier": self.tier}])
        return SimpleNamespace(mappings=lambda: SimpleNamespace(
            first=lambda: rows[0], all=lambda: rows))

    async def commit(self):
        pass


@pytest.mark.parametrize("mode,count,expected", [
    ("single", 1, 1), ("fan_out", 2, 2), ("council", 2, 4),
    ("room_synthesized", 1, 2), ("room_synthesized", 2, 2),
    ("room_synthesized", 3, 3), ("daisy_chain", 2, 2), ("room_all", 2, 2),
])
@pytest.mark.asyncio
async def test_actual_one_round_call_counts(monkeypatch, mode, count, expected):
    from aimmh_lib import MultiModelHub
    from python.services import inference_modes, inference
    calls = []
    async def fake_call(*args, **kwargs):
        calls.append((args, kwargs))
        return "reply"
    async def fake_provider(**kwargs):
        calls.append(kwargs)
        return "reply", {}
    monkeypatch.setattr(inference_modes, "resolve_providers", AsyncMock(side_effect=lambda values: values))
    monkeypatch.setattr(inference_modes, "get_multi_model_hub", lambda: MultiModelHub(fake_call))
    monkeypatch.setattr(inference, "call_provider", fake_provider)
    await inference_modes.run_inference_with_mode(
        [{"role": "user", "content": "test"}], orchestration_mode=mode,
        providers=["deepseek"] * count,
    )
    assert len(calls) == expected
    assert public_access_policy.orchestration_call_count(mode, count) == len(calls)


def test_council_and_fleet_cannot_amplify_two_call_budget(monkeypatch):
    monkeypatch.setenv("PUBLIC_MAX_PROVIDER_LANES", "2")
    with pytest.raises(public_access_policy.PublicAccessDenied):
        public_access_policy.enforce_public_provider_policy("free", "council", ["deepseek", "openai-nano"])
    with pytest.raises(public_access_policy.PublicAccessDenied):
        public_access_policy.enforce_public_fleet_policy("free", [
            {"provider_id": "deepseek", "orchestration_mode": "council"},
            {"provider_id": "deepseek", "orchestration_mode": "single"},
        ])


def test_attachment_only_message_and_empty_message_boundaries():
    from python.routes.chat import SendMessage
    from pydantic import ValidationError
    assert SendMessage(content="", attachment_ids=[1]).attachment_ids == [1]
    for content in ("", "   "):
        with pytest.raises(ValidationError):
            SendMessage(content=content)
    with pytest.raises(ValidationError):
        SendMessage(content="x" * 16001)


@pytest.mark.asyncio
async def test_guest_pins_authorized_provider(monkeypatch):
    from python.routes import guest
    monkeypatch.setenv("PUBLIC_GUEST_PROVIDER", "deepseek")
    call = AsyncMock(return_value=("reply", {"input_tokens": 5, "output_tokens": 7}))
    monkeypatch.setattr(guest, "call_provider", call)
    assert (await guest.guest_chat(guest.GuestChatBody(message="premium role keyword")))["tokens_used"] == 12
    assert call.call_args.kwargs["provider_id"] == "deepseek"
    assert call.call_args.kwargs["pin_requested_provider"] is True
    assert call.call_args.kwargs["routed_user_tier"] == "free"
    assert call.call_args.kwargs["use_tools"] is False


@pytest.fixture
def chat_boundary(monkeypatch):
    from python import database
    from python.routes import chat
    from python.services import model_catalog, energy_registry
    fake_db = FakeDatabase()
    monkeypatch.setattr(database, "engine", fake_db)
    monkeypatch.setattr(chat, "_require_owned_conv", AsyncMock(return_value={"id": 1, "user_id": "u1"}))
    monkeypatch.setattr(model_catalog, "resolve_model_id", AsyncMock(return_value=("deepseek", {})))
    monkeypatch.setattr(energy_registry, "resolve_providers", AsyncMock(side_effect=lambda values: values))
    monkeypatch.setattr(chat.storage, "create_message", AsyncMock(side_effect=lambda data: {"id": 1, **data}))
    monkeypatch.setattr(chat.storage, "grant_approval_scope", AsyncMock())
    monkeypatch.setattr(chat, "_attach_cost_usd", lambda *_: None)
    monkeypatch.setattr(chat, "_pending_gates", {})
    return chat, fake_db


@pytest.mark.asyncio
@pytest.mark.parametrize("providers", [["openai-5.5-pro"], ["deepseek", "openai-nano"]])
async def test_saved_mode_is_gated_before_any_message_write(chat_boundary, providers):
    chat, db = chat_boundary
    db.mode = "council"
    with pytest.raises(HTTPException) as exc:
        await chat.send_message(1, chat.SendMessage(content="hello", model="deepseek", providers=providers), request_for())
    assert exc.value.status_code == 403
    chat.storage.create_message.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("scope_only", [False, True])
@pytest.mark.parametrize("fail", [False, True])
async def test_approval_replays_bind_and_restore_tier(chat_boundary, monkeypatch, scope_only, fail):
    chat, db = chat_boundary
    from python.services.run_context import current_user_tier
    from python.config import policy_loader
    from python.storage import domain
    db.tier = "ws"
    monkeypatch.setattr(domain, "check_scope_grant_tier", AsyncMock())
    monkeypatch.setattr(policy_loader, "get_scope_categories", lambda: {"publish": {"label": "Publish", "description": "publication"}})
    monkeypatch.setattr(policy_loader, "get_safety_floor_actions", lambda: set())
    chat._pending_gates[1] = {
        "gate_id": "gate-abcd", "uid": "u1", "provider_id": "deepseek",
        "history": [], "system_prompt": "test", "pin_requested_provider": True,
    }
    async def provider(**kwargs):
        assert current_user_tier.get() == "ws"
        assert kwargs["routed_user_tier"] == "ws"
        if fail:
            raise RuntimeError("provider failure")
        return "done", {}
    monkeypatch.setattr(chat, "call_provider", provider)
    prior = current_user_tier.get()
    body = chat.SendMessage(content="APPROVE SCOPE publish" if scope_only else "APPROVE gate-abcd", model="deepseek")
    if fail:
        with pytest.raises(HTTPException):
            await chat.send_message(1, body, request_for())
    else:
        await chat.send_message(1, body, request_for())
    assert current_user_tier.get() == prior


@pytest.mark.asyncio
async def test_signup_email_never_confers_ws_or_admin(monkeypatch):
    from python.routes import billing
    db = FakeDatabase()
    monkeypatch.setattr(billing, "engine", db)
    monkeypatch.delenv("WS_USER_IDS", raising=False)
    assert await billing._maybe_promote_ws("u1", "owner@interdependentway.org", "free") == "free"
    assert not await billing._check_admin("u1", "owner@interdependentway.org", db, "user")
    assert db.statements == []
    monkeypatch.setenv("WS_USER_IDS", "u2, u3")
    assert await billing._maybe_promote_ws("u1", "u2", "free") == "free"
    assert await billing._maybe_promote_ws("u2", "unverified@example.com", "free") == "ws"
    assert "UPDATE users" in db.statements[-1][0]


@pytest.mark.asyncio
@pytest.mark.parametrize("role,asked,expected", [("admin", None, None), ("admin", "system", "system"), ("user", "system", "u1")])
async def test_tool_discovery_keeps_admin_and_owner_scopes(monkeypatch, role, asked, expected):
    from python.routes import tools
    get = AsyncMock(return_value=[])
    monkeypatch.setattr(tools.storage, "get_custom_tools", get)
    await tools.list_tools(request_for(role=role), asked)
    get.assert_awaited_once_with(expected)


@pytest.mark.asyncio
@pytest.mark.parametrize("fail", [False, True])
async def test_fleet_binds_tier_and_pins_single_lane(monkeypatch, fail):
    from python.routes import fleet
    from python.services import inference_modes, inference
    from python.services.run_context import current_user_tier
    db = FakeDatabase()
    monkeypatch.setattr(fleet, "get_session", db.connect)
    monkeypatch.setattr(inference_modes, "resolve_providers", AsyncMock(side_effect=lambda values: values))
    seen = []
    async def provider(**kwargs):
        seen.append(kwargs)
        assert current_user_tier.get() == "ws"
        assert kwargs["pin_requested_provider"] is True
        assert kwargs["routed_user_tier"] == "ws"
        if fail:
            raise RuntimeError("provider failure")
        return "reply", {}
    monkeypatch.setattr(inference, "call_provider", provider)
    prior = current_user_tier.get()
    await fleet._run_one_contestant("r1", {"id": 1, "slot": 1, "provider_id": "deepseek"}, "premium role keyword", "u1", "ws")
    assert seen and seen[0]["provider_id"] == "deepseek"
    assert current_user_tier.get() == prior
    assert db.statements[-1][1]["st"] == ("error" if fail else "complete")


@pytest.mark.asyncio
@pytest.mark.parametrize("fail", [False, True])
async def test_cli_binds_tier_and_restores_on_failure(monkeypatch, fail):
    from python.routes import cli
    from python.services import call_fn, model_catalog, prompt_assembly
    from python.storage import storage
    from python.services.run_context import current_user_tier
    monkeypatch.setattr(cli, "resolve_cli_key", AsyncMock(return_value={"user_id": "u1", "subscription_tier": "ws"}))
    monkeypatch.setattr(storage, "get_conversation", AsyncMock(return_value={"id": 1, "user_id": "u1", "model": "deepseek"}))
    monkeypatch.setattr(storage, "get_messages", AsyncMock(return_value=[]))
    monkeypatch.setattr(storage, "create_message", AsyncMock())
    monkeypatch.setattr(prompt_assembly, "build_system_prompt", AsyncMock(return_value="test"))
    monkeypatch.setattr(model_catalog, "resolve_model_id", AsyncMock(return_value=("deepseek", {})))
    async def call(*args, **kwargs):
        assert current_user_tier.get() == "ws"
        if fail:
            raise RuntimeError("provider failure")
        return "reply", {}
    monkeypatch.setattr(call_fn, "call_model", call)
    request = Request({"type": "http", "headers": [(b"authorization", b"Bearer a0k_test")]})
    prior = current_user_tier.get()
    body = cli.CliChatBody(message="test", conversation_id=1)
    if fail:
        with pytest.raises(RuntimeError):
            await cli.cli_chat(body, request)
    else:
        assert (await cli.cli_chat(body, request))["tier"] == "ws"
    assert current_user_tier.get() == prior


@pytest.mark.asyncio
async def test_all_public_admin_guards_reject_unverified_owner_email(monkeypatch):
    from python.routes import _admin_gate, admin, contexts
    monkeypatch.setattr(_admin_gate, "_ADMIN_USER_ID", "trusted-account")
    request = Request({"type": "http", "headers": [
        (b"x-user-id", b"attacker"), (b"x-user-email", b"owner@interdependentway.org"),
        (b"x-user-role", b"user"),
    ]})
    with pytest.raises(HTTPException) as exc:
        await _admin_gate.require_admin(request)
    assert exc.value.status_code == 403
    assert not await admin._is_admin("attacker", "owner@interdependentway.org", "user")
    assert not await contexts._is_admin("attacker", "owner@interdependentway.org", "user")
    await _admin_gate.require_admin(request_for(role="admin"))
    await _admin_gate.require_admin(request_for(uid="trusted-account"))
# 256:21 0:0 0:1
