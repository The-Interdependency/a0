# 52:1 0:0 0:0
"""DeepSeek energy-option tests: catalog, default, and a0(deepseek) identity."""
from __future__ import annotations

import os
import unittest

from python.agents.zfae import compose_name
from python.services.energy_registry import (
    BUILTIN_PROVIDERS,
    default_provider,
    resolve_provider_id,
)


class DeepSeekEnergyOptionTests(unittest.TestCase):
    def test_catalog_lists_deepseek_flash_and_pro(self) -> None:
        flash = BUILTIN_PROVIDERS["deepseek"]
        pro = BUILTIN_PROVIDERS["deepseek-pro"]
        self.assertEqual(flash["vendor"], "deepseek")
        self.assertEqual(flash["model"], "deepseek-v4-flash")
        self.assertEqual(flash["env_key"], "DEEPSEEK_API_KEY")
        self.assertEqual(pro["model"], "deepseek-v4-pro")
        self.assertEqual(pro["env_key"], "DEEPSEEK_API_KEY")

    def test_default_provider_prefers_deepseek(self) -> None:
        old_ds = os.environ.get("DEEPSEEK_API_KEY")
        old_oai = os.environ.get("OPENAI_API_KEY")
        try:
            os.environ["DEEPSEEK_API_KEY"] = "test-deepseek-key"
            os.environ["OPENAI_API_KEY"] = "test-openai-key"
            self.assertEqual(default_provider(), "deepseek")
        finally:
            if old_ds is None:
                os.environ.pop("DEEPSEEK_API_KEY", None)
            else:
                os.environ["DEEPSEEK_API_KEY"] = old_ds
            if old_oai is None:
                os.environ.pop("OPENAI_API_KEY", None)
            else:
                os.environ["OPENAI_API_KEY"] = old_oai

    def test_identity_is_a0_deepseek(self) -> None:
        self.assertEqual(compose_name("deepseek"), "a0(deepseek)")
        self.assertEqual(compose_name("deepseek", model_id="deepseek-v4-flash"), "a0(deepseek)")

    def test_xai_grok_openai_identities_and_aliases(self) -> None:
        self.assertEqual(BUILTIN_PROVIDERS["xai"]["vendor"], "xai")
        self.assertEqual(BUILTIN_PROVIDERS["xai"]["env_key"], "XAI_API_KEY")
        self.assertEqual(BUILTIN_PROVIDERS["grok"]["env_key"], "XAI_API_KEY")
        self.assertEqual(BUILTIN_PROVIDERS["openai"]["env_key"], "OPENAI_API_KEY")
        self.assertEqual(resolve_provider_id("x.ai"), "xai")
        self.assertEqual(resolve_provider_id("xai"), "xai")
        self.assertEqual(resolve_provider_id("grok"), "grok")
        self.assertEqual(resolve_provider_id("open si"), "openai")
        self.assertEqual(resolve_provider_id("openai"), "openai")
        self.assertEqual(compose_name("xai"), "a0(xai)")
        self.assertEqual(compose_name("grok"), "a0(grok)")
        self.assertEqual(compose_name("openai"), "a0(openai)")

if __name__ == "__main__":
    unittest.main()
# 52:1 0:0 0:0
