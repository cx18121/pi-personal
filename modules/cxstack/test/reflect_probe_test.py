import importlib.util
import json
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    'reflect_privacy_probe', Path(__file__).with_name('reflect-privacy-probe.py')
)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def completion(name='/review', status='completed', response='One supported lesson.'):
    payload = {'agent_name': name, 'status': status, 'final_response': response}
    return {
        'type': 'custom_message',
        'customType': 'pi-codex-subagent-completion',
        'details': {'agent_name': name, 'status': status},
        'content': '<subagent_notification>\n' + json.dumps(payload) + '\n</subagent_notification>',
    }


class ReviewerResultsTest(unittest.TestCase):
    def test_accepts_a_matching_successful_review(self):
        result = probe.require_successful_reviewers([completion()], ['review'])
        self.assertEqual(result[0]['final_response'], 'One supported lesson.')

    def test_accepts_a_successful_fallback_after_provider_failure(self):
        result = probe.require_successful_reviewers(
            [completion('/first', status='failed'), completion('/fallback')],
            ['first', 'fallback'],
        )
        self.assertEqual([entry['agent_name'] for entry in result], ['/fallback'])

    def test_rejects_provider_failure_even_with_a_completion_notification(self):
        with self.assertRaises(AssertionError):
            probe.require_successful_reviewers([completion(status='failed')], ['review'])

    def test_an_unrelated_reviewer_cannot_satisfy_the_requested_review(self):
        with self.assertRaises(AssertionError):
            probe.require_successful_reviewers([completion('/other')], ['review'])

    def test_requires_an_actual_review_response(self):
        with self.assertRaisesRegex(AssertionError, 'returned no review'):
            probe.require_successful_reviewers([completion(response=' ')], ['review'])

    def test_failed_attempt_does_not_hide_a_pending_fallback(self):
        entries = [completion('/first', status='failed')]
        self.assertEqual(probe.pending_reviewers(entries, ['first', 'fallback']), {'fallback'})
        entries.append(completion('/fallback'))
        self.assertEqual(probe.pending_reviewers(entries, ['first', 'fallback']), set())

    def test_unrelated_success_does_not_rescue_a_failed_requested_reviewer(self):
        with self.assertRaises(AssertionError):
            probe.require_successful_reviewers(
                [completion('/first', status='failed'), completion('/other')], ['first']
            )

    def test_requires_a_requested_reviewer(self):
        with self.assertRaisesRegex(AssertionError, 'No independent reviewer'):
            probe.require_successful_reviewers([], [])

    def test_rejects_a_payload_that_disagrees_with_completion_status(self):
        entry = completion(status='failed')
        entry['details']['status'] = 'completed'
        with self.assertRaisesRegex(AssertionError, 'payload was not successful'):
            probe.require_successful_reviewers([entry], ['review'])


class PrivacyEnvelopeTest(unittest.TestCase):
    def test_screens_followups_as_well_as_initial_child_messages(self):
        calls = [
            ('spawn_agent', {'message': 'Safe lesson'}),
            ('send_message', {'message': 'PRIVATE_SENTINEL'}),
            ('read', {'path': '/unrelated'}),
        ]
        self.assertEqual(probe.child_messages(calls), ['Safe lesson', 'PRIVATE_SENTINEL'])

    def test_allows_the_exact_destination_but_not_other_sessions(self):
        destination = Path('/probe/agent/AGENTS.md')
        allowed = dict(exact_paths=[destination], roots=[Path('/probe/cxstack')])
        self.assertTrue(probe.allowed_probe_reads([str(destination)], **allowed))
        self.assertTrue(probe.allowed_probe_reads(['/probe/cxstack/resources/reflect.md'], **allowed))
        self.assertFalse(probe.allowed_probe_reads(['/probe/agent/sessions/other.jsonl'], **allowed))
        self.assertFalse(probe.allowed_probe_reads(['/probe/cxstack/../private.md'], **allowed))


if __name__ == '__main__':
    unittest.main()
