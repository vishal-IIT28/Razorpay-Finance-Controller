-- CreateTable
CREATE TABLE "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "matchedRecords" INTEGER NOT NULL DEFAULT 0,
    "exceptions" INTEGER NOT NULL DEFAULT 0,
    "precision" DOUBLE PRECISION,
    "recall" DOUBLE PRECISION,

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "paymentId" TEXT,
    "bankTxnId" TEXT,
    "ledgerEntryId" TEXT,
    "matchPass" INTEGER NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "reasoning" TEXT,
    "suggestedAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExceptionLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReconciliationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionLog" ADD CONSTRAINT "ExceptionLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReconciliationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

