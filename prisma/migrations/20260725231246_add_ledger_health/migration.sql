-- CreateTable
CREATE TABLE "LedgerHealth" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,

    CONSTRAINT "LedgerHealth_pkey" PRIMARY KEY ("id")
);
