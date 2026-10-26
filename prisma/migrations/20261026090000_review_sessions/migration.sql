-- Review sessions: who a review covered (empty = everyone) and the action items (tasks) agreed in it
ALTER TABLE "PipelineReview" ADD COLUMN "subjectIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Activity" ADD COLUMN "reviewId" TEXT;
CREATE INDEX "Activity_reviewId_idx" ON "Activity"("reviewId");
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "PipelineReview"("id") ON DELETE SET NULL ON UPDATE CASCADE;
