-- Quizzes are graded on the server; a lecture with a quiz only completes on a pass (4/5); done stays done.
begin;
select tests.user('quinn') as q \gset
select tests.user('visitor', false) as v \gset

-- Non-members can't take quizzes; unknown items have none.
select tests.as_user(:'v');
select tests.throws($$select public.start_quiz('rag-1')$$, 'Only lab members');
select tests.as_user(:'q');
select tests.throws($$select public.start_quiz('rag-999')$$, 'no quiz for this item');

-- A quiz hands out 5 questions with 4 options each and no answers.
select public.start_quiz('rag-1') as quiz \gset
select tests.eq(jsonb_array_length(:'quiz'::jsonb -> 'questions'), 5, '5 questions');
select tests.eq((select bool_and(jsonb_array_length(x -> 'options') = 4 and not (x ? 'answer_index'))
                   from jsonb_array_elements(:'quiz'::jsonb -> 'questions') x), true, 'options only, no answers');
select :'quiz'::jsonb ->> 'id' as attempt \gset
select tests.throws($$select * from public.quiz_keys$$, 'permission denied');

-- The box can't be ticked before passing.
select tests.throws(format($$insert into public.progress (user_id, item_id) values (%L, 'rag-1')$$, :'q'), 'row-level security');

-- Failing (3/5) grades but completes nothing.
select tests.as_postgres();
select tests.quiz_answers(:'attempt') as key \gset
select array[(:'key'::int[])[1], (:'key'::int[])[2], (:'key'::int[])[3],
             ((:'key'::int[])[4] + 1) % 4, ((:'key'::int[])[5] + 1) % 4] as three \gset
select tests.as_user(:'q');
select tests.eq((public.submit_quiz(:'attempt', :'three') ->> 'score')::int, 3, 'graded 3/5');
select tests.throws(format($$select public.submit_quiz(%L, %L)$$, :'attempt', :'key'), 'no longer be submitted');
select tests.eq((select count(*) from public.progress where user_id = :'q' and item_id = 'rag-1')::int, 0, '3/5 does not complete');

-- Passing (5/5) completes the lecture automatically.
select public.start_quiz('rag-1') ->> 'id' as attempt2 \gset
select tests.as_postgres();
select tests.quiz_answers(:'attempt2') as key2 \gset
select tests.as_user(:'q');
select tests.eq((public.submit_quiz(:'attempt2', :'key2') ->> 'score')::int, 5, 'graded 5/5');
select tests.eq((select count(*) from public.progress where user_id = :'q' and item_id = 'rag-1')::int, 1, 'pass completes the lecture');

-- Lectures without a quiz tick freely; done can't be undone; nobody writes someone else's progress.
insert into public.progress (user_id, item_id) values (:'q', 'p0-1');
select tests.throws(format($$delete from public.progress where user_id = %L$$, :'q'), 'permission denied');
select tests.throws(format($$insert into public.progress (user_id, item_id) values (%L, 'p0-2')$$, :'v'), 'row-level security');

-- Everyone sees finished quizzes; nobody else sees an unfinished one.
select public.start_quiz('rag-2') ->> 'id' as open_attempt \gset
select tests.as_anon();
select tests.eq((select count(*) from public.quiz_attempts where id = :'open_attempt')::int, 0, 'open attempt is private');
select tests.eq((select count(*) from public.quiz_attempts where id = :'attempt2')::int, 1, 'finished attempt is public');
select tests.as_postgres();
rollback;
