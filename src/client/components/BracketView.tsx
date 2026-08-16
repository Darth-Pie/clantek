/**
 * A bracket, drawn as rows of round-columns. Single-elimination shows one
 * bracket (Round 1 → Final); double-elimination stacks three labelled sections
 * — winners bracket, losers bracket, and the grand final. Read-only for members
 * and the public; when `canManage` is set, a ready/decided match gets a
 * "Report" control that opens an inline winner + score form.
 *
 * The single-elim third-place match (round === last, slot 1) falls below the
 * final in the last winners column.
 */

import { useState } from 'react';
import type { Entrant, Match } from '../lib/tournaments';
import { roundName } from '../lib/tournaments';

interface Props {
  matches: Match[];
  entrants: Entrant[];
  canManage: boolean;
  bestOf: number;
  onReport: (matchId: number, winnerId: number, score1: number, score2: number) => Promise<void>;
}

export default function BracketView({ matches, entrants, canManage, bestOf, onReport }: Props) {
  const byId = new Map(entrants.map((e) => [e.id, e]));
  const winners = matches.filter((m) => m.bracket === 'winners');
  const losers = matches.filter((m) => m.bracket === 'losers');
  const grandFinal = matches.filter((m) => m.bracket === 'grand_final');
  const group = matches.filter((m) => m.bracket === 'group');
  const hasLosers = losers.length > 0 || grandFinal.length > 0;

  const shared = { byId, canManage, bestOf, onReport };

  // Round-robin / Swiss: a set of rounds, each a column of matches. No tree.
  if (group.length) {
    const gTotal = Math.max(...group.map((m) => m.round));
    return (
      <div className="bracket-scroll">
        <RoundColumns matches={group} totalRounds={gTotal} nameRound={(r) => `Round ${r}`} {...shared} />
      </div>
    );
  }

  if (!winners.length) {
    return <p className="muted">The bracket hasn’t been generated yet.</p>;
  }
  const wbTotal = Math.max(...winners.map((m) => m.round));
  const lbTotal = losers.length ? Math.max(...losers.map((m) => m.round)) : 0;

  return (
    <div className="bracket-scroll">
      {hasLosers && <div className="bracket-section-label">Winners bracket</div>}
      <RoundColumns matches={winners} totalRounds={wbTotal} nameRound={(r) => roundName(r, wbTotal)} allowThirdPlace {...shared} />

      {losers.length > 0 && (
        <>
          <div className="bracket-section-label">Losers bracket</div>
          <RoundColumns matches={losers} totalRounds={lbTotal} nameRound={(r) => `Losers R${r}`} {...shared} />
        </>
      )}

      {grandFinal.length > 0 && (
        <>
          <div className="bracket-section-label">Grand final</div>
          <div className="bracket">
            <div className="bracket-col">
              {grandFinal.map((m) => (
                <BracketMatch key={m.id} match={m} isThirdPlace={false} {...shared} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RoundColumns({
  matches,
  totalRounds,
  nameRound,
  allowThirdPlace = false,
  byId,
  canManage,
  bestOf,
  onReport,
}: {
  matches: Match[];
  totalRounds: number;
  nameRound: (round: number) => string;
  allowThirdPlace?: boolean;
  byId: Map<number, Entrant>;
  canManage: boolean;
  bestOf: number;
  onReport: Props['onReport'];
}) {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  return (
    <div className="bracket">
      {rounds.map((round) => {
        const col = matches.filter((m) => m.round === round).sort((a, b) => a.slot - b.slot);
        return (
          <div className="bracket-col" key={round}>
            <div className="bracket-col-head">{nameRound(round)}</div>
            {col.map((m) => (
              <BracketMatch
                key={m.id}
                match={m}
                byId={byId}
                canManage={canManage}
                bestOf={bestOf}
                onReport={onReport}
                isThirdPlace={allowThirdPlace && round === totalRounds && m.slot === 1}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function BracketMatch({
  match,
  byId,
  canManage,
  bestOf,
  onReport,
  isThirdPlace,
}: {
  match: Match;
  byId: Map<number, Entrant>;
  canManage: boolean;
  bestOf: number;
  onReport: Props['onReport'];
  isThirdPlace: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [winnerId, setWinnerId] = useState<number | null>(match.winnerId);
  const [score1, setScore1] = useState(match.score1);
  const [score2, setScore2] = useState(match.score2);
  const [error, setError] = useState<string | null>(null);

  const e1 = match.entrant1Id != null ? byId.get(match.entrant1Id) : undefined;
  const e2 = match.entrant2Id != null ? byId.get(match.entrant2Id) : undefined;
  const decided = match.status === 'complete' || match.status === 'bye';
  const canReport = canManage && match.status !== 'bye' && match.entrant1Id != null && match.entrant2Id != null;

  async function submit() {
    if (winnerId == null) {
      setError('Pick a winner.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onReport(match.id, winnerId, score1, score2);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the result.');
    } finally {
      setBusy(false);
    }
  }

  const slot = (e: Entrant | undefined, entrantId: number | null, score: number) => {
    const isWinner = decided && match.winnerId != null && match.winnerId === entrantId;
    const isLoser = decided && match.winnerId != null && entrantId != null && match.winnerId !== entrantId;
    return (
      <div className={`bracket-slot${isWinner ? ' won' : ''}${isLoser ? ' lost' : ''}`}>
        {e?.seed != null && <span className="bracket-seed">{e.seed}</span>}
        <span className="bracket-name">{e ? e.name : match.status === 'bye' ? '—' : 'TBD'}</span>
        {decided && entrantId != null && <span className="bracket-score">{score}</span>}
      </div>
    );
  };

  return (
    <div className={`bracket-match${match.status === 'ready' ? ' ready' : ''}${isThirdPlace ? ' third' : ''}`}>
      {isThirdPlace && <div className="bracket-tag">3rd place</div>}
      {slot(e1, match.entrant1Id, match.score1)}
      {slot(e2, match.entrant2Id, match.score2)}

      {canReport && !editing && (
        <button
          type="button"
          className="ghost mini bracket-report"
          onClick={() => {
            setWinnerId(match.winnerId);
            setScore1(match.score1);
            setScore2(match.score2);
            setEditing(true);
          }}
        >
          {decided ? 'Edit result' : 'Report'}
        </button>
      )}

      {editing && (
        <div className="bracket-report-form">
          <div className="bracket-pick">
            <label className={winnerId === match.entrant1Id ? 'pick active' : 'pick'}>
              <input
                type="radio"
                name={`w-${match.id}`}
                checked={winnerId === match.entrant1Id}
                onChange={() => setWinnerId(match.entrant1Id)}
              />
              {e1?.name ?? 'TBD'}
            </label>
            <input
              type="number"
              min={0}
              className="bracket-score-input"
              value={score1}
              onChange={(ev) => setScore1(Math.max(0, Number(ev.target.value) || 0))}
              aria-label={`${e1?.name ?? 'Competitor 1'} score`}
            />
          </div>
          <div className="bracket-pick">
            <label className={winnerId === match.entrant2Id ? 'pick active' : 'pick'}>
              <input
                type="radio"
                name={`w-${match.id}`}
                checked={winnerId === match.entrant2Id}
                onChange={() => setWinnerId(match.entrant2Id)}
              />
              {e2?.name ?? 'TBD'}
            </label>
            <input
              type="number"
              min={0}
              className="bracket-score-input"
              value={score2}
              onChange={(ev) => setScore2(Math.max(0, Number(ev.target.value) || 0))}
              aria-label={`${e2?.name ?? 'Competitor 2'} score`}
            />
          </div>
          {bestOf > 1 && <p className="muted small">Best of {bestOf}.</p>}
          {error && <p className="notice error small">{error}</p>}
          <div className="bracket-report-actions">
            <button type="button" className="primary mini" disabled={busy} onClick={() => void submit()}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="ghost mini" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
