export type HighlightRegion =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'full';

export interface Association {
  name: string;
  explanation: string;
  memorability: number;
  highlight: HighlightRegion;
  svg?: string;
}

export type FigureStatus = 'pending' | 'loading' | 'done' | 'learned';

export interface Figure {
  id: string;
  imageUrl: string;
  croppedBase64: string;
  status: FigureStatus;
  associations: Association[];
  selectedAssociation: number;
  overlayLoading?: boolean;
  ideaLoading?: boolean;
}
