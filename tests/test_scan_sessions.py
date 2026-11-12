"""턴 도중 선택 창·제안 카드 판정 시험. 실행: /usr/bin/python3 -I tests/test_scan_sessions.py"""
import importlib.util
import json
import os
import sys
import tempfile
import unittest

# Mod 폴더에 __pycache__를 남기지 않는다
sys.dont_write_bytecode = True
SCANNER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scripts', 'scan_sessions.py')
spec = importlib.util.spec_from_file_location('scan_sessions', SCANNER)
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)

NOW = 1_800_000_000_000


def line(role, content):
    return json.dumps({'type': role, 'message': {'content': content}}).encode()


def asked(tool_id='q1', text='Which one?'):
    block = {'type': 'tool_use', 'id': tool_id, 'name': 'AskUserQuestion',
             'input': {'questions': [{'question': text}]}}
    return line('assistant', [block])


def used(tool_id, name):
    return line('assistant', [{'type': 'tool_use', 'id': tool_id, 'name': name, 'input': {}}])


def result(tool_id):
    return line('user', [{'type': 'tool_result', 'tool_use_id': tool_id, 'content': 'ok'}])


def card(title='Tidy the notes', **fields):
    return {'id': 'task_1', 'title': title, 'expiresAt': NOW + 1000, **fields}


class OpenQuestion(unittest.TestCase):
    def test_unanswered_question_gives_its_text(self):
        self.assertEqual(scanner.open_question([asked()]), 'Which one?')

    def test_answered_question_gives_nothing(self):
        self.assertIsNone(scanner.open_question([asked(), result('q1')]))

    def test_result_of_a_parallel_tool_leaves_the_question_open(self):
        lines = [asked(), used('t1', 'Read'), result('t1')]
        self.assertEqual(scanner.open_question(lines), 'Which one?')

    def test_new_user_message_closes_an_old_question(self):
        self.assertIsNone(scanner.open_question([asked(), line('user', 'never mind')]))
        self.assertIsNone(scanner.open_question([asked(), line('user', [{'type': 'text', 'text': 'x'}])]))

    def test_plan_approval_counts_with_no_text(self):
        self.assertEqual(scanner.open_question([used('p1', 'ExitPlanMode')]), '')

    def test_running_tool_is_not_a_question(self):
        self.assertIsNone(scanner.open_question([used('t1', 'Bash')]))

    def test_lines_that_are_not_conversation_are_skipped(self):
        lines = [b'{broken', b'', b'[1]', json.dumps({'type': 'custom-title'}).encode(), asked()]
        self.assertEqual(scanner.open_question(lines), 'Which one?')

    def test_odd_question_input_still_counts_as_open(self):
        block = {'type': 'tool_use', 'id': 'q1', 'name': 'AskUserQuestion', 'input': {'questions': 'x'}}
        self.assertEqual(scanner.open_question([line('assistant', [block])]), '')


class Tail(unittest.TestCase):
    def test_long_file_drops_the_cut_first_line(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, 'long.jsonl')
            with open(path, 'wb') as handle:
                handle.write(b'x' * (scanner.TAIL_BYTES + 10) + b'\n' + asked() + b'\n')
            self.assertEqual(scanner.open_question(scanner.tail_lines(path)), 'Which one?')
            self.assertTrue(all(not item.startswith(b'x') for item in scanner.tail_lines(path)))


class Scan(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.base = os.path.join(folder.name, 'sessions')
        self.projects = os.path.join(folder.name, 'projects')
        os.makedirs(os.path.join(self.base, 'a', 'b'))
        os.makedirs(os.path.join(self.projects, 'p'))

    def session(self, name, lines=None, **fields):
        record = {'sessionId': f'local_{name}', 'cliSessionId': name, 'lastTurnEdgeAt': NOW - 1000, **fields}
        with open(os.path.join(self.base, 'a', 'b', f'local_{name}.json'), 'w', encoding='utf-8') as handle:
            json.dump(record, handle)
        if lines is not None:
            with open(os.path.join(self.projects, 'p', f'{name}.jsonl'), 'wb') as handle:
                handle.write(b'\n'.join(lines) + b'\n')

    def rows(self):
        return scanner.scan(self.base, NOW, self.projects)['rows']

    def test_open_dialog_is_listed_as_needs_reply(self):
        self.session('open', [asked()])
        row = self.rows()[0]
        self.assertEqual((row['kind'], row['text'], row['since']), ('ask', 'Which one?', NOW - 1000))

    def test_turn_that_ended_is_judged_by_its_record_alone(self):
        self.session('ended', [asked()], turnWrapUp={'description': 'done'})
        self.assertEqual(self.rows(), [])

    def test_archived_and_missing_transcripts_are_left_out(self):
        self.session('archived', [asked()], isArchived=True)
        self.session('gone')
        self.assertEqual(self.rows(), [])

    def test_scheduled_session_is_only_counted(self):
        self.session('routine', [asked()], scheduledTaskId='t')
        scan = scanner.scan(self.base, NOW, self.projects)
        self.assertEqual((scan['rows'], scan['scheduled']), ([], 1))

    def test_unstarted_card_is_listed_with_its_title(self):
        self.session('done', turnWrapUp={'description': 'done'}, postTurnSummary={'status_category': 'completed'},
                     backgroundTaskSuggestions=[card()])
        row = self.rows()[0]
        self.assertEqual((row['kind'], row['text'], row['since']), ('ask', 'Tidy the notes', NOW - 1000))

    def test_cards_that_no_longer_wait_are_left_out(self):
        self.session('expired', backgroundTaskSuggestions=[card(expiresAt=NOW)])
        self.session('accepted', backgroundTaskSuggestions=[card(offer=True, accepted=True)])
        self.session('auto', backgroundTaskSuggestions=[card(autoStart='cloud')])
        self.session('none', backgroundTaskSuggestions=[])
        self.assertEqual(self.rows(), [])

    def test_first_card_still_waiting_is_the_one_shown(self):
        self.session('two', backgroundTaskSuggestions=[card('Old', expiresAt=NOW - 1), card('New')])
        self.assertEqual(self.rows()[0]['text'], 'New')

    def test_question_and_open_dialog_come_before_a_card(self):
        self.session('asked', turnWrapUp={'description': 'x', 'needsUser': 'Pick one'},
                     backgroundTaskSuggestions=[card()])
        self.assertEqual(self.rows()[0]['text'], 'Pick one')
        os.remove(os.path.join(self.base, 'a', 'b', 'local_asked.json'))
        self.session('dialog', [asked()], backgroundTaskSuggestions=[card()])
        self.assertEqual(self.rows()[0]['text'], 'Which one?')

    def test_odd_card_fields_do_not_stop_the_scan(self):
        self.session('text', backgroundTaskSuggestions='x')
        self.session('item', backgroundTaskSuggestions=['x', None])
        self.assertEqual(self.rows(), [])
        self.session('bare', backgroundTaskSuggestions=[{'expiresAt': 'soon', 'title': 7}])
        self.assertEqual([(row['kind'], row['text']) for row in self.rows()], [('ask', '')])

    def test_archived_and_scheduled_cards_follow_the_session(self):
        self.session('archived', backgroundTaskSuggestions=[card()], isArchived=True)
        self.session('routine', backgroundTaskSuggestions=[card()], scheduledTaskId='t')
        scan = scanner.scan(self.base, NOW, self.projects)
        self.assertEqual((scan['rows'], scan['scheduled']), ([], 1))

    def test_question_without_blocked_is_listed_as_unmarked(self):
        self.session('soft', [wrapped(ask='Draft it?')], turnWrapUp={'description': 'done'},
                     postTurnSummary={'status_category': 'completed'})
        row = self.rows()[0]
        self.assertEqual((row['kind'], row['text']), ('silent', 'Draft it?'))

    def test_recap_only_and_blocked_wraps_add_nothing_new(self):
        self.session('recap', [wrapped()], turnWrapUp={'description': 'done'})
        self.session('blocked', [wrapped(ask='Send it?', blocked=True)], turnWrapUp={'description': 'done'})
        self.assertEqual(self.rows(), [])

    def test_wrap_is_read_from_the_last_assistant_transcript(self):
        self.session('resumed', turnWrapUp={'description': 'done'}, lastAssistantCliSessionId='later')
        with open(os.path.join(self.projects, 'p', 'later.jsonl'), 'wb') as handle:
            handle.write(wrapped(ask='Which file?') + b'\n')
        self.assertEqual(self.rows()[0]['text'], 'Which file?')

    def test_scheduled_wrap_with_a_question_is_not_read(self):
        self.session('routine', [wrapped(ask='Post it?')], turnWrapUp={'description': 'done'}, scheduledTaskId='t')
        scan = scanner.scan(self.base, NOW, self.projects)
        self.assertEqual((scan['rows'], scan['scheduled']), ([], 0))

    def test_parent_echo_of_a_listed_child_is_dropped(self):
        waiting = {'turnWrapUp': {'description': 'x'}, 'postTurnSummary': {'status_category': 'blocked'}}
        self.session('parent', **waiting)
        self.session('child', turnWrapUp={'description': 'x', 'needsUser': 'Pick a plan'},
                     spawnedFrom={'sessionId': 'local_parent'})
        self.assertEqual([row['sid'] for row in self.rows()], ['local_child'])

    def test_parent_echo_of_a_running_child_is_dropped(self):
        self.session('parent', turnWrapUp={'description': 'x'}, postTurnSummary={'status_category': 'blocked'})
        self.session('child', spawnedFrom={'sessionId': 'local_parent'}, lastActivityAt=NOW)
        self.assertEqual(self.rows(), [])

    def test_parent_keeps_its_own_question_and_old_children_do_not_hide_it(self):
        self.session('asks', turnWrapUp={'description': 'x', 'needsUser': 'Mine'})
        self.session('kid', turnWrapUp={'description': 'x', 'needsUser': 'Yours'}, spawnedFrom={'sessionId': 'local_asks'})
        self.session('quiet', turnWrapUp={'description': 'x'}, postTurnSummary={'status_category': 'blocked'})
        self.session('stale', spawnedFrom={'sessionId': 'local_quiet'}, lastActivityAt=NOW - 5000)
        self.assertEqual(sorted(row['sid'] for row in self.rows()), ['local_asks', 'local_kid', 'local_quiet'])


def wrapped(**fields):
    block = {'type': 'tool_use', 'id': 'w1', 'name': 'mcp__ccd_turn__wrap_up', 'input': {'recap': 'Done.', **fields}}
    return line('assistant', [block])


class WrapAsk(unittest.TestCase):
    def test_last_wrap_wins(self):
        lines = [wrapped(ask='Old?'), line('user', 'go on'), wrapped()]
        self.assertIsNone(scanner.wrap_ask(lines))
        self.assertEqual(scanner.wrap_ask([wrapped(), wrapped(ask='New?')]), 'New?')

    def test_blank_or_odd_asks_give_nothing(self):
        self.assertIsNone(scanner.wrap_ask([wrapped(ask='  ')]))
        self.assertIsNone(scanner.wrap_ask([wrapped(ask=['x'])]))
        self.assertIsNone(scanner.wrap_ask([b'{broken wrap_up', b'']))

    def test_the_word_alone_in_other_text_is_not_a_wrap(self):
        text = line('assistant', [{'type': 'text', 'text': 'I will call wrap_up next'}])
        self.assertIsNone(scanner.wrap_ask([text]))


if __name__ == '__main__':
    unittest.main()
