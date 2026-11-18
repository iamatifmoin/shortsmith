import React from 'react';

import { VisualSpec } from '../types';
import { Comparison } from './Comparison';
import { Headline } from './Headline';
import { Stat } from './Stat';

/** Maps a visual spec (ADR-028) to its graphics template (ADR-027). */
export const VisualGraphic: React.FC<{ spec: VisualSpec; accent: string }> = ({ spec, accent }) => {
  switch (spec.kind) {
    case 'comparison':
      return <Comparison title={spec.title} a={spec.a} b={spec.b} unit={spec.unit} accent={accent} />;
    case 'stat':
      return <Stat value={spec.value} label={spec.label} accent={accent} />;
    case 'headline':
      return <Headline text={spec.text} />;
    default:
      return null;
  }
};
