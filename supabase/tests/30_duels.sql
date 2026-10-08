-- Live quiz duels: invite -> accept -> shared start -> both submit -> decided; each sheet counts as a quiz.
begin;
select tests.user('ann') as a \gset
select tests.user('ben') as b \gset
select tests.user('out', false) as o \gset

select tests.as_user(:'a');
select tests.throws(format($$select public.create_duel('rag-3', %L)$$, :'a'), 'someone else');
select tests.throws(format($$select public.create_duel('rag-3', %L)$$, :'o'), 'not a lab member');
select public.create_duel('rag-3', :'b') ->> 'id' as duel \gset
select tests.throws(format($$select public.create_duel('rag-4', %L)$$, :'b'), 'already has a duel');
select tests.throws(format($$select public.respond_duel(%L, true)$$, :'duel'), 'not found');

-- Before the start time players only get a countdown.
select tests.as_user(:'b');
select public.respond_duel(:'duel', true);
select tests.eq((public.start_duel(:'duel') ? 'questions'), false, 'no questions before the start');
select tests.as_postgres();
update public.duels set starts_at = now() - interval '1 second' where id = :'duel';

select tests.as_user(:'a');
select tests.eq(jsonb_array_length(public.start_duel(:'duel') -> 'questions'), 5, 'questions at the start');
select tests.as_user(:'b');
select public.start_duel(:'duel');
select tests.as_postgres();
select tests.duel_answers(:'duel') as key \gset

-- ann: 5/5, ben: skips everything. ann wins; both sheets become quizzes; only ann's pass completes the lecture.
select tests.as_user(:'a');
select tests.eq((public.submit_duel(:'duel', :'key') ->> 'score')::int, 5, 'ann scores 5');
select tests.throws(format($$select public.submit_duel(%L, %L)$$, :'duel', :'key'), 'already submitted');
select tests.as_user(:'b');
select public.submit_duel(:'duel', array[-1,-1,-1,-1,-1]);
select tests.as_anon();
select tests.eq((select status from public.duels where id = :'duel'), 'done', 'duel decided');
select tests.eq((select winner from public.duels where id = :'duel'), :'a'::uuid, 'ann wins');
select tests.eq((select count(*) from public.quiz_attempts where source_duel = :'duel')::int, 2, 'both sheets saved as quizzes');
select tests.eq((select count(*) from public.progress where user_id = :'a' and item_id = 'rag-3')::int, 1, 'winner pass completes the lecture');
select tests.eq((select count(*) from public.progress where user_id = :'b' and item_id = 'rag-3')::int, 0, 'a fail does not');
select tests.as_postgres();

-- Cancel and decline.
select tests.as_user(:'a');
select public.create_duel('rag-4', :'b') ->> 'id' as d2 \gset
select public.cancel_duel(:'d2');
select tests.eq((select status from public.duels where id = :'d2'), 'cancelled', 'challenger can cancel');
select public.create_duel('rag-4', :'b') ->> 'id' as d3 \gset
select tests.as_user(:'b');
select public.respond_duel(:'d3', false);
select tests.eq((select status from public.duels where id = :'d3'), 'declined', 'opponent can decline');

-- A duel nobody played expires once the clock runs out.
select tests.as_user(:'a');
select public.create_duel('rag-5', :'b') ->> 'id' as d4 \gset
select tests.as_user(:'b');
select public.respond_duel(:'d4', true);
select tests.as_postgres();
update public.duels set starts_at = now() - interval '10 minutes' where id = :'d4';
select tests.as_user(:'a');
select tests.eq(public.start_duel(:'d4') ->> 'over', 'true', 'late start reports over');
select tests.eq((select status from public.duels where id = :'d4'), 'expired', 'unplayed duel expires');
select tests.as_postgres();
rollback;
