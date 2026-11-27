/**
 * The answer of the Assistant, with the places it names as buttons (AIX-004): a file, a line, an element. A place is offered only when the
 * open project has it (`checkProposals` reads the project, as it does for the proposals); a click goes through the path the person would
 * take themselves (`runProposal`). Text that only looks like a place stays text.
 */
import { useEffect, useMemo, useState } from 'react';
import type { AiProposal } from '../../ai/proposals';
import { useIDEStore } from '../../store/useIDEStore';
import { Button } from '../../ui';
import { splitPlaces } from './answerPlaces';
import { liveDeps } from './liveDeps';
import { checkProposals, runProposal, type ProposalCheck } from './editorProposals';

export function AnswerText({ text }: { text: string }) {
  const parts = useMemo(() => splitPlaces(text), [text]);
  const activePath = useIDEStore((state) => state.getActiveFile()?.path);
  // an element is of the diagram that is open; a file or a line names its own file
  const proposals = useMemo(
    () =>
      parts.map((part): AiProposal | null =>
        'place' in part
          ? part.place
          : 'element' in part && activePath
            ? { type: 'selectElement', path: activePath, element: part.element }
            : null,
      ),
    [parts, activePath],
  );
  const [checks, setChecks] = useState<Array<ProposalCheck | null>>([]);
  useEffect(() => {
    let current = true;
    const found = proposals.filter((proposal): proposal is AiProposal => proposal !== null);
    void checkProposals(found, liveDeps()).then((next) => {
      if (!current) return;
      let at = 0;
      setChecks(proposals.map((proposal) => (proposal === null ? null : next[at++]!)));
    });
    return () => {
      current = false;
    };
  }, [proposals]);
  return (
    <p className="whitespace-pre-wrap text-[var(--color-surface-100)]">
      {parts.map((part, index) => {
        if ('text' in part) return <span key={index}>{part.text}</span>;
        const check = checks[index];
        return check?.state === 'ready' ? (
          <Button
            key={index}
            variant="ghost"
            size="sm"
            className="inline h-auto px-0 py-0 font-mono underline underline-offset-2"
            data-command-exempt="opens a place the Assistant named, as a click on a problem does"
            onClick={() => void runProposal(check.proposal, liveDeps())}
          >
            {part.raw}
          </Button>
        ) : (
          <span key={index}>{part.raw}</span>
        );
      })}
    </p>
  );
}
