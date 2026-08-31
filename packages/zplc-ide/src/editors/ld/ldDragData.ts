export const DRAG_MIME_TYPE = 'application/zplc-ld-element';

export interface LDDropData {
  type: string;
  fbType?: string;
  category: 'contact' | 'coil' | 'function_block' | 'structure';
  isMove?: boolean;
  elementId?: string;
  fromRow?: number;
  fromCol?: number;
}

export function parseLDDropData(dataTransfer: Pick<DataTransfer, 'getData'>): LDDropData | null {
  const data = dataTransfer.getData(DRAG_MIME_TYPE);
  if (!data) return null;

  try {
    return JSON.parse(data) as LDDropData;
  } catch {
    return null;
  }
}
