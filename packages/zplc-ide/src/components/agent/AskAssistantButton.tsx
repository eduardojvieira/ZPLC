/**
 * The button of a place that can ask the Assistant about what it shows (AIX-003): a problem, a failed test, the lesson guide. It opens the
 * Assistant with that place's context attached (`openAssistantWith`), and it is not offered while no provider is configured.
 */
import { useAssistantProvider } from '../../shell/useSelection';
import { openAssistantWith, type AssistantIntent } from '../../store/useAssistantEntry';
import { Button } from '../../ui';

export function AskAssistantButton({ label, intent, className }: { label: string; intent: () => AssistantIntent; className?: string }) {
  const available = useAssistantProvider((state) => state.available);
  if (!available) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      className={className ?? 'underline underline-offset-2'}
      data-command-exempt="opens the Assistant with the context of this place (view.agent)"
      onClick={() => openAssistantWith(intent())}
    >
      {label}
    </Button>
  );
}
