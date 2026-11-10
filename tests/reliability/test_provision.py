"""Usage: python -m unittest discover -s tests/reliability -p 'test_*.py'.
Inert HTTP/policy fixtures: these do not initialize a real vault or restart services.
"""
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('provision', Path(__file__).parents[2] / 'operations/configure-vault.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ProvisionTests(unittest.TestCase):
    def test_policy_matches_actual_kv_and_separates_read_only_cli(self):
        cli = module.policy('a0', True)
        app = module.policy('a0')
        for provider in module.PROVIDERS:
            self.assertIn(f'path "a0/data/provider/{provider}"', cli)
        self.assertNotIn('secret/data/a0', app)
        self.assertNotIn('"create"', cli)
        self.assertNotIn('a0/data/*', cli)
        self.assertIn('path "a0/data/*"', app)
        self.assertIn('auth/token/renew-self', cli)

    def test_transport_failure_never_initializes_or_writes(self):
        with patch.object(module, 'api', side_effect=module.SetupError('transport')) as api, patch.object(module, 'atomic') as write:
            with self.assertRaises(module.SetupError):
                module.provision({'BAO_ADDR': 'http://127.0.0.1:8200'}, None, True)
            self.assertEqual(api.call_count, 1)
            self.assertEqual(api.call_args.args[1:3], ('GET', '/sys/seal-status'))
            write.assert_not_called()

    def test_uninitialized_requires_explicit_new_store_and_pin_mismatch_refuses(self):
        for health, config in [({'initialized': False, 'sealed': True}, {}),
            ({'initialized': True, 'sealed': False, 'cluster_id': 'wrong'}, {'BAO_CLUSTER_ID': 'expected'})]:
            with self.subTest(health=health), patch.object(module, 'api', return_value=health) as api:
                with self.assertRaises(module.SetupError):
                    module.provision(config, None)
                self.assertEqual(api.call_count, 1)

    def test_periodic_scoped_token_is_preserved_and_renewed_on_repeated_setup(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'token'
            path.write_text('existing-scoped-fixture')
            writes = []
            def api(_addr, method, target, token=None, payload=None):
                if target.endswith('lookup-self'):
                    return {'data': {'policies': ['a0-cli'], 'period': 86400}}
                self.assertEqual(target, '/auth/token/renew-self')
                self.assertEqual(token, 'existing-scoped-fixture')
                return {}
            with patch.object(module, 'api', side_effect=api) as call, patch.object(module, 'read_private', side_effect=lambda p: Path(p).read_text()), patch.object(module, 'atomic', side_effect=lambda p,v,*a: writes.append(v)):
                module.scoped_token('http://127.0.0.1:8200', 'admin-fixture', 'a0-cli', path, 1000)
                module.scoped_token('http://127.0.0.1:8200', 'admin-fixture', 'a0-cli', path, 1000)
                self.assertEqual(writes, ['existing-scoped-fixture\n']*2)
                self.assertFalse(any(c.args[2] == '/auth/token/create' for c in call.call_args_list))

    def test_pairing_rejects_wrong_vm_before_writing_and_never_accepts_root_account(self):
        raw = json.dumps({'schema':'a0.site-pairing/1','token':'a'*64,'siteOrigin':'https://console.example','vmOrigin':'https://wrong.example'})
        with patch.object(module.pwd,'getpwnam',return_value=SimpleNamespace(pw_uid=1000,pw_gid=1000)), patch.object(module,'atomic') as write:
            with self.assertRaises(module.SetupError):
                module.pair_site({'A0_PUBLIC_ORIGIN':'https://vm.example'},'operator',raw)
            write.assert_not_called()
        with patch.object(module.pwd,'getpwnam',return_value=SimpleNamespace(pw_uid=0,pw_gid=0)):
            with self.assertRaises(module.SetupError):
                module.pair_site({},'root',raw)

    def test_renewal_service_runs_only_root_owned_installed_code(self):
        unit=(Path(__file__).parents[2]/'operations/a0-vault-renew.service').read_text()
        self.assertIn('/usr/local/lib/a0/configure-vault.py --renew', unit)
        self.assertNotIn('/opt/a0/operations', unit)


if __name__ == '__main__':
    unittest.main()
