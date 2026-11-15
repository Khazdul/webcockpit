// Stars and comments on the watch page (stage 65 C2, spec §7.8, ADR 0155;
// round 13's pick 3a): the stars in the band beside the title and details,
// the comments under the replay, inside the start page's frame
// (src/watch/page.tsx). Drawn only when the run's meta carries `stars`
// (the flag `gallery` on).
//
// The stars are History's Rate control (src/chrome/frames/history-dialogs.tsx,
// drawn again here in its manner: that module lives in History's chunk):
// one's own vote lit, a click sets it, a click on the lit vote takes it back;
// the mean and the votes beside. One's own run: the mean, "your run", no
// control. A guest: the mean and "Log in to rate".
//
// The comments: newest last, the writer's name and the age; Remove for the
// writer and the run's sender, Report on another's (the page's report dialog
// with the comment quoted); a field of at most 1 000 code points with its
// count, cleaned by the free-text rules as the player types, trimmed when
// sent; Post comment. A guest: "Log in to comment". Past one page (50) an
// "Earlier comments" control above the list. Every value is text, never a
// link.

import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { GlassButton, Rule, Stars as StarRow, TextArea } from '../chrome/kit/look';
import { useNav } from '../chrome/kit/stack';
import type { Comment, Stars } from '../../shared/cloud/api.ts';
import { deleteComment, fetchComments, fetchVote, postComment, sendVote } from './api';
import {
  COMMENT_LIMIT,
  ageText,
  codePoints,
  commentFailText,
  commentField,
  commentToSend,
  meanStars,
  meanText,
  starWord,
  voteFailText,
  votesText,
} from './model';

/** The star's drawing (History's Rate control's, 24 × 24): an outline, filled when lit. */
const STAR_PATH = 'M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45-4.7-4.6 6.5-.95z';

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

// ------------------------------------------------------------ the stars

export type RaterRole = 'guest' | 'own' | 'voter';

interface RunStarsProps {
  id: string;
  stars: Stars;
  role: RaterRole;
  onLogin(): void;
  /** The stars changed (the meta's copy). */
  onStars(s: Stars): void;
}

/** The stars beside the band's title and details. */
export function RunStars(p: RunStarsProps): VNode {
  const nav = useNav();
  const [mine, setMine] = useState<number | null>(null);
  const [peek, setPeek] = useState(0);
  const busy = useRef(false);

  // One's own vote, once (a voter only).
  useEffect(() => {
    if (p.role !== 'voter') return;
    let alive = true;
    void fetchVote(p.id).then((g) => {
      if (!alive || !g.ok) return;
      setMine(g.value.mine);
      p.onStars(g.value.stars);
    });
    return () => {
      alive = false;
    };
  }, [p.id, p.role]);

  const mean = meanText(p.stars);
  const meanLine = (
    <span class="wc-watch-rate-m" data-watch="stars-mean">
      {mean && <b>{mean}</b>}
      {mean && ' · '}
      {votesText(p.stars.count)}
    </span>
  );

  if (p.role !== 'voter') {
    return (
      <div class="wc-watch-rate is-static" data-watch="stars" data-role={p.role}>
        <div class="wc-watch-rate-static">
          <StarRow n={meanStars(p.stars)} />
          {mean && <b>{mean}</b>}
        </div>
        <p class="wc-watch-rate-l">
          <span>
            {votesText(p.stars.count)}
            {' · '}
          </span>
          {p.role === 'own' ? (
            <i data-watch="your-run">your run</i>
          ) : (
            <button type="button" class="wc-watch-login" data-btn="LOGIN-RATE" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={p.onLogin}>
              Log in to rate
            </button>
          )}
        </p>
      </div>
    );
  }

  const vote = async (n: number): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    const next = n === mine ? null : n;
    try {
      const g = await sendVote(p.id, next);
      if (g.ok) {
        setMine(g.value.mine);
        p.onStars(g.value.stars);
        nav.flash(g.value.mine === null ? 'Your stars were taken back.' : `You gave ${starWord(g.value.mine)} star${g.value.mine === 1 ? '' : 's'}.`, 'ok');
      } else {
        nav.flash(voteFailText(g.status, g.code), 'fail');
      }
    } finally {
      busy.current = false;
    }
  };
  const lit = mine ?? 0;
  return (
    <div class="wc-watch-rate" data-watch="stars" data-role="voter">
      <div class="wc-watch-stars" role="radiogroup" aria-label="Your stars" onPointerLeave={() => setPeek(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            tabIndex={-1}
            data-v={i}
            aria-checked={mine === i ? 'true' : 'false'}
            aria-label={`${i} star${i > 1 ? 's' : ''}`}
            class={(i <= lit ? 'is-lit' : '') + (peek > 0 && i <= peek ? ' is-peek' : '')}
            onMouseDown={(e) => e.preventDefault()}
            onPointerEnter={(e) => {
              if (e.pointerType === 'mouse') setPeek(i);
            }}
            onClick={(e) => {
              e.stopPropagation();
              void vote(i);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={STAR_PATH} />
            </svg>
          </button>
        ))}
      </div>
      <p class="wc-watch-rate-l">
        <span data-watch="stars-mine">
          {mine === null ? (
            'Rate this run'
          ) : (
            <>
              Your stars: <b>{starWord(mine)}</b>
            </>
          )}
        </span>
        {meanLine}
      </p>
    </div>
  );
}

// ------------------------------------------------------------ the comments

interface CommentsProps {
  id: string;
  /** The run's sender (Remove on every comment when it is the one logged in). */
  sender: string;
  /** The logged-in account's name; null: a guest. */
  me: string | null;
  /** The meta's count (the heading's figure until the list has come). */
  total: number;
  onLogin(): void;
  onReport(c: Comment): void;
  /** The comments' count changed. */
  onCount(n: number): void;
}

type Load = { k: 'loading' } | { k: 'failed' } | { k: 'ok' };

/** The comments under the replay. */
export function Comments(p: CommentsProps): VNode {
  const [list, setList] = useState<Comment[]>([]);
  /** The cursor of the comments older than the list (null: none left; review fix CR1). */
  const [before, setBefore] = useState<string | null>(null);
  const [total, setTotal] = useState(p.total);
  const [load, setLoad] = useState<Load>({ k: 'loading' });
  const [earlier, setEarlier] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoad({ k: 'loading' });
    void fetchComments(p.id).then((g) => {
      if (!alive) return;
      if (!g.ok) return setLoad({ k: 'failed' });
      setList(g.value.comments);
      setBefore(g.value.before ?? null);
      setTotal(g.value.total);
      p.onCount(g.value.total);
      setLoad({ k: 'ok' });
    });
    return () => {
      alive = false;
    };
  }, [p.id, attempt]);

  const showEarlier = async (): Promise<void> => {
    if (earlier || before === null) return;
    setEarlier(true);
    const g = await fetchComments(p.id, before);
    setEarlier(false);
    if (!g.ok) return setError(commentFailText(g.status, g.code));
    setError(null);
    // The cursor skips none and repeats none; each comment once all the same.
    setList((now) => [...g.value.comments.filter((c) => !now.some((x) => x.id === c.id)), ...now]);
    setBefore(g.value.before ?? null);
  };

  const count = (n: number): void => {
    setTotal(n);
    p.onCount(n);
  };

  const post = async (): Promise<void> => {
    const t = commentToSend(text);
    if (!t || posting) return;
    setPosting(true);
    setError(null);
    const g = await postComment(p.id, t);
    setPosting(false);
    if (!g.ok) return setError(commentFailText(g.status, g.code));
    setList((now) => [...now, g.value]);
    setText('');
    count(total + 1);
  };

  const remove = async (c: Comment): Promise<void> => {
    if (removing) return;
    setRemoving(c.id);
    setError(null);
    const g = await deleteComment(c.id);
    setRemoving(null);
    if (!g.ok && g.status !== 404) return setError(commentFailText(g.status, g.code));
    setList((now) => now.filter((x) => x.id !== c.id));
    count(Math.max(0, total - 1));
  };

  const isSender = p.me !== null && same(p.me, p.sender);
  const now = Date.now();
  const n = codePoints(text);
  const ready = commentToSend(text).length > 0 && !posting;
  return (
    <section class="wc-watch-comments" data-watch="comments" aria-label="Comments">
      <Rule
        title={
          <h3 class="wc-lk-sec">
            Comments
            {total > 0 && (
              <span class="wc-watch-cnum" data-watch="comments-count">
                {total}
              </span>
            )}
          </h3>
        }
      />
      {load.k === 'ok' && before !== null && (
        <div class="wc-watch-earlier">
          <GlassButton id="EARLIER" label={earlier ? 'Loading…' : 'Earlier comments'} icon="up" small disabled={earlier} onClick={() => void showEarlier()} />
        </div>
      )}
      {load.k === 'loading' && <p class="wc-watch-cnone">Loading the comments…</p>}
      {load.k === 'failed' && (
        <div class="wc-watch-cfail" data-watch="comments-failed">
          <p class="wc-watch-cnone">The comments could not be loaded.</p>
          <GlassButton id="COMMENTS-RETRY" label="Try again" small onClick={() => setAttempt((a) => a + 1)} />
        </div>
      )}
      {load.k === 'ok' &&
        (list.length === 0 ? (
          <p class="wc-watch-cnone" data-watch="comments-none">
            No comments yet.
          </p>
        ) : (
          <ul class="wc-watch-cms">
            {list.map((c) => {
              const mine = p.me !== null && same(c.writer, p.me);
              const bySender = same(c.writer, p.sender);
              return (
                <li key={c.id} class={'wc-watch-cm' + (mine ? ' is-own' : '') + (bySender ? ' is-sender' : '')} data-comment={c.id}>
                  <div class="wc-watch-cm-h">
                    <b data-watch="writer">{c.writer}</b>
                    {bySender && <span class="wc-watch-cm-tag">sender</span>}
                    <time dateTime={new Date(c.created).toISOString()}>{ageText(c.created, now)}</time>
                    <span class="wc-watch-sp" />
                    {(mine || isSender) && (
                      <GlassButton id="REMOVE" label="Remove" icon="trash" small danger disabled={removing === c.id} onClick={() => void remove(c)} />
                    )}
                    {p.me !== null && !mine && !isSender && <GlassButton id="REPORT-COMMENT" label="Report" icon="flag" small onClick={() => p.onReport(c)} />}
                  </div>
                  <p class="wc-watch-cm-t" data-watch="comment-text">
                    {c.text}
                  </p>
                </li>
              );
            })}
          </ul>
        ))}
      {error && (
        <p class="wc-watch-cerr" role="alert" data-watch="comments-error">
          {error}
        </p>
      )}
      {p.me === null ? (
        <div class="wc-watch-cform is-guest" data-watch="comment-guest">
          <span>Comments come from accounts.</span>
          <GlassButton id="LOGIN-COMMENT" label="Log in to comment" icon="person" small onClick={p.onLogin} />
        </div>
      ) : (
        <div class="wc-watch-cform" data-watch="comment-form">
          <TextArea
            id="comment"
            label="A comment"
            value={text}
            rows={2}
            placeholder="Write a comment: plain text, everyone sees it with your name"
            onInput={(v) => setText(commentField(v))}
            hint={<span class="wc-watch-ccount">{`${n} / ${COMMENT_LIMIT}`}</span>}
          />
          <div class="wc-watch-cform-b">
            <GlassButton id="POST" label={posting ? 'Posting…' : 'Post comment'} small primary={ready} disabled={!ready} onClick={() => void post()} />
          </div>
        </div>
      )}
    </section>
  );
}
