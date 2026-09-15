import {scoreOpportunity,type Profile} from './scoring.js';
export interface OpportunityAnalyzer {
  readonly code:string;
  readonly version:string;
  analyze(opportunity:Parameters<typeof scoreOpportunity>[0],profile:Profile,offerings:Parameters<typeof scoreOpportunity>[2]):ReturnType<typeof scoreOpportunity>;
}
/** Future providers must preserve the explainable contract and require explicit configuration. */
export class RuleBasedOpportunityAnalyzer implements OpportunityAnalyzer {
  readonly code='rules';readonly version='2.0';
  analyze:OpportunityAnalyzer['analyze']=(opportunity,profile,offerings)=>scoreOpportunity(opportunity,profile,offerings);
}
