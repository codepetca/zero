import contextlib
import fcntl
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import add
import fixture_builder

class TransactionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture_dir = tempfile.TemporaryDirectory()
        fixture_builder.build(cls.fixture_dir.name)
        add.configure_fixture(cls.fixture_dir.name)
        cls.old_env = os.environ.get('ADD_FIXTURE')
        os.environ['ADD_FIXTURE'] = cls.fixture_dir.name
    @classmethod
    def tearDownClass(cls):
        if cls.old_env is None: os.environ.pop('ADD_FIXTURE', None)
        else: os.environ['ADD_FIXTURE'] = cls.old_env
        cls.fixture_dir.cleanup()
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name)
        (self.root/'pom.xml').write_bytes(add.OLD_POM)
        (self.root/'zero-libraries.json').write_bytes(add.OLD_PIN)
    def tearDown(self): self.tmp.cleanup()
    def states(self): return {p: add.state(add.read(self.root,p)) for p in add.PATHS}
    def assert_old(self): self.assertEqual(self.states(), {p:add.state(add.OLD[p]) for p in add.PATHS})
    def assert_new(self): self.assertEqual(self.states(), {p:add.state(add.NEW[p]) for p in add.PATHS})
    def test_success_repeat_and_cancel(self):
        review = add.review(self.root); self.assertIn('MIT', review['notice'])
        self.assertEqual(add.apply(self.root, review, cancel=True)['status'], 'cancelled'); self.assert_old()
        self.assertEqual(add.apply(self.root, review)['status'], 'committed'); self.assert_new()
        self.assertEqual(add.recover(self.root)['status'], 'committed'); self.assert_new()
        with self.assertRaises(add.Blocked): add.apply(self.root, review)
    def test_drift_existing_and_changed_review(self):
        review = add.review(self.root)
        with self.assertRaises(add.Blocked): add.apply(self.root, review, {'account': 99})
        review['notice'] = 'ignored'
        with self.assertRaises(add.Blocked): add.apply(self.root, review)
        (self.root/'bundle').mkdir(); (self.root/'bundle/LICENSE').write_text('student')
        with self.assertRaises(add.Blocked): add.review(self.root)
        self.assertEqual((self.root/'bundle/LICENSE').read_text(), 'student')
    def test_review_mutation_cannot_change_trusted_state(self):
        baseline = add.expected_review()
        trusted = (dict(add.CONTEXT), dict(add.SIZES), dict(add.HASHES), dict(add.OLD), dict(add.NEW), add.PATHS)
        mutations = [('context', 'account', 99), ('sizes', 'LICENSE', 1),
                     ('files', 'pom.xml', 'wrong'), ('new', 'pom.xml', 'wrong')]
        for section, key, value in mutations:
            with self.subTest(section=section):
                reviewed = add.review(self.root)
                reviewed[section][key] = value
                self.assertEqual(add.expected_review(), baseline)
                with self.assertRaises(add.Blocked): add.apply(self.root, reviewed)
                self.assert_old()
        for mapping, key in ((add.CONTEXT, 'account'), (add.SIZES, 'LICENSE'),
                             (add.HASHES, 'LICENSE'), (add.OLD, 'pom.xml'), (add.NEW, 'pom.xml')):
            with self.assertRaises(TypeError): mapping[key] = 'changed'
        self.assertEqual((dict(add.CONTEXT), dict(add.SIZES), dict(add.HASHES),
                          dict(add.OLD), dict(add.NEW), add.PATHS), trusted)
        with self.assertRaises(add.Blocked): add.apply(self.root, baseline, {'account': 99})
        self.assert_old()

    def test_failed_fixture_configuration_preserves_trusted_bytes(self):
        original_fixture, original_new = add.FIXTURE, dict(add.NEW)
        with tempfile.TemporaryDirectory() as d:
            for name in add.HASHES:
                (Path(d)/name).write_bytes((original_fixture/name).read_bytes())
            (Path(d)/'LICENSE').write_bytes(b'tampered')
            with self.assertRaises(add.Blocked): add.configure_fixture(d)
        self.assertEqual(add.FIXTURE, original_fixture)
        self.assertEqual(dict(add.NEW), original_new)
        self.assert_old()

    def test_fixture_tamper_missing_and_notice(self):
        with tempfile.TemporaryDirectory() as d:
            fixture=Path(d)
            for n in add.HASHES: (fixture/n).write_bytes((add.FIXTURE/n).read_bytes())
            with patch.object(add, 'FIXTURE', fixture):
                for name in add.HASHES:
                    p=fixture/name; original=p.read_bytes(); p.write_bytes(bytes([original[0]^1])+original[1:])
                    with self.assertRaises(add.Blocked): add.review(self.root)
                    p.unlink()
                    with self.assertRaises(add.Blocked): add.review(self.root)
                    p.write_bytes(original)
    def test_unknown_and_truncated_journal_and_stage(self):
        review=add.review(self.root)
        def stop(name):
            if name=='journal-published': raise RuntimeError('stop')
        with self.assertRaises(RuntimeError): add.apply(self.root,review,hook=stop)
        j=self.root/'.add-transaction/journal.json'; original=j.read_bytes()
        for bad in (original[:-1], b'{}\n', original+b' '):
            j.write_bytes(bad)
            with self.assertRaises(add.Blocked): add.recover(self.root)
            self.assert_old()
        j.write_bytes(original)
        stage=self.root/'.add-transaction/stage/0'; stage.write_bytes(b'tampered')
        with self.assertRaises(add.Blocked): add.recover(self.root)
        self.assert_old()
    def test_conflict_after_partial_install(self):
        review=add.review(self.root)
        def stop(name):
            if name=='installed-0': raise RuntimeError('stop')
        with self.assertRaises(RuntimeError): add.apply(self.root,review,hook=stop)
        (self.root/'pom.xml').write_text('student edit')
        before=self.states()
        with self.assertRaises(add.Blocked): add.recover(self.root)
        self.assertEqual(self.states(),before)
        self.assertEqual((self.root/'pom.xml').read_text(),'student edit')
    def test_concurrent_lock(self):
        review=add.review(self.root)
        with add.lock(self.root):
            with self.assertRaises(add.Blocked): add.apply(self.root,review)
        self.assert_old()
    def test_symlinks(self):
        (self.root/'bundle').symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(add.Blocked): add.review(self.root)
    def test_reviewed_project_drift_and_write_failure(self):
        review=add.review(self.root)
        (self.root/'pom.xml').write_bytes(b'student edit')
        with self.assertRaises(add.Blocked): add.apply(self.root, review)
        self.assertEqual((self.root/'pom.xml').read_bytes(),b'student edit')
        (self.root/'pom.xml').write_bytes(add.OLD_POM)
        with patch.object(add, 'write_new', side_effect=OSError(28, 'disk full')):
            with self.assertRaises(OSError): add.apply(self.root, review)
        self.assert_old()
        with self.assertRaises(add.Blocked): add.recover(self.root)

    def test_injected_error_after_commit_reports_recoverable_commit(self):
        review=add.review(self.root)
        def fail(name):
            if name=='installed-5': raise OSError(5, 'injected after final write')
        with self.assertRaises(OSError): add.apply(self.root, review, hook=fail)
        self.assert_new()
        self.assertEqual(add.recover(self.root)['status'],'committed')
        self.assert_new()

    def test_competing_process_is_rejected(self):
        review=add.review(self.root)
        script="import add,os,sys; add.configure_fixture(os.environ['ADD_FIXTURE']); add.apply(sys.argv[1],add.expected_review())"
        with add.lock(self.root):
            result=subprocess.run([sys.executable,'-c',script,str(self.root)],cwd=Path(add.__file__).parent,capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0)
        self.assertIn('another Add holds the lock', result.stderr)
        self.assert_old()
        self.assertEqual(add.apply(self.root,review)['status'],'committed')

    def test_actual_process_termination_at_every_boundary(self):
        boundaries=['transaction-created']+['staged-'+str(i) for i in range(6)]+['journal-published']+['installed-'+str(i) for i in range(6)]+['replacement-staged-4','replacement-staged-5']
        script='''import add, os, sys\nadd.configure_fixture(os.environ['ADD_FIXTURE'])\nr=add.review(sys.argv[1])\ndef stop(name):\n if name == sys.argv[2]: os._exit(71)\nadd.apply(sys.argv[1], r, hook=stop)\n'''
        for boundary in boundaries:
            with self.subTest(boundary=boundary), tempfile.TemporaryDirectory() as d:
                root=Path(d); (root/'pom.xml').write_bytes(add.OLD_POM); (root/'zero-libraries.json').write_bytes(add.OLD_PIN)
                result=subprocess.run([sys.executable,'-c',script,str(root),boundary],cwd=Path(add.__file__).parent)
                self.assertEqual(result.returncode,71)
                if boundary=='transaction-created' or boundary.startswith('staged-'):
                    with self.assertRaises(add.Blocked): add.recover(root)
                    self.assertEqual({p:add.state(add.read(root,p)) for p in add.PATHS},{p:add.state(add.OLD[p]) for p in add.PATHS})
                else:
                    self.assertEqual(add.recover(root)['status'],'committed')
                    self.assertEqual({p:add.state(add.read(root,p)) for p in add.PATHS},{p:add.state(add.NEW[p]) for p in add.PATHS})
                    self.assertEqual(add.recover(root)['status'],'committed')

if __name__ == '__main__': unittest.main()
