/** A conversion failure whose message is written for the person converting. */
export class ConversionError extends Error {
  override name = "ConversionError";
}

/** How an engine reports where it is. Both callbacks are optional to honour. */
export interface Progress {
  /** 0..1 of the current stage */
  ratio: (r: number) => void;
  /** a short description of what is running now */
  stage: (label: string) => void;
}

export const NO_PROGRESS: Progress = { ratio: () => undefined, stage: () => undefined };
