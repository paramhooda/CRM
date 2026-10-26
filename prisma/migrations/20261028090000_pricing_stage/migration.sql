-- Purchase pricing becomes its own pipeline stage between BOQ (presales) and Proposal Submitted (quote sent)
ALTER TYPE "Stage" ADD VALUE 'PRICING' BEFORE 'PROPOSAL';
