export interface UploadCommandSet {
  load: string;
  data: string;
}

const LEGACY_UPLOAD_COMMAND_SET: UploadCommandSet = {
  load: 'zplc load',
  data: 'zplc data',
};

const SCHEDULER_UPLOAD_COMMAND_SET: UploadCommandSet = {
  load: 'zplc sched load',
  data: 'zplc sched data',
};

export function getUploadCommandSet(hasSchedulerSupport: boolean): UploadCommandSet {
  return hasSchedulerSupport ? SCHEDULER_UPLOAD_COMMAND_SET : LEGACY_UPLOAD_COMMAND_SET;
}
