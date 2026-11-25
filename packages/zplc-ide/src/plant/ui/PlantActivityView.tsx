/** The body of the Plant activity of the rail (SHL-005): a labelled empty region, which U3-P2 fills with the plant of the project. */
import { useT } from '../../i18n';

export function PlantActivityView() {
  const { t } = useT();
  return <div role="region" aria-label={t('shell.activity.plant')} />;
}
