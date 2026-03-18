export interface UploadCommandSet {
  load: string;
  data: string;
  start: string | null;
}

const LEGACY_UPLOAD_COMMAND_SET: UploadCommandSet = {
  load: 'zplc load',
  data: 'zplc data',
  start: 'zplc start',
};

const SCHEDULER_UPLOAD_COMMAND_SET: UploadCommandSet = {
  load: 'zplc sched load',
  data: 'zplc sched data',
  start: null,
};

export function getUploadCommandSet(hasSchedulerSupport: boolean): UploadCommandSet {
  return hasSchedulerSupport ? SCHEDULER_UPLOAD_COMMAND_SET : LEGACY_UPLOAD_COMMAND_SET;
}
