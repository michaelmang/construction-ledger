-- CreateTable
CREATE TABLE "Job" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientName" TEXT,
    "contractValue" DECIMAL,
    "retainagePct" DECIMAL NOT NULL DEFAULT 0.10,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startDate" DATETIME,
    "targetEndDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CostCode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "csiDivision" TEXT
);

-- CreateTable
CREATE TABLE "JobBudget" (
    "jobId" INTEGER NOT NULL,
    "costCodeId" INTEGER NOT NULL,
    "budgetedAmount" DECIMAL NOT NULL,
    "revisedEstimate" DECIMAL,

    PRIMARY KEY ("jobId", "costCodeId"),
    CONSTRAINT "JobBudget_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JobBudget_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChangeOrder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobId" INTEGER NOT NULL,
    "coNumber" TEXT,
    "description" TEXT,
    "amount" DECIMAL NOT NULL,
    "approvedDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChangeOrder_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgressBilling" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobId" INTEGER NOT NULL,
    "billingDate" DATETIME,
    "periodLabel" TEXT,
    "amountBilled" DECIMAL NOT NULL,
    "retainageWithheld" DECIMAL NOT NULL,
    "pctCompleteEstimate" DECIMAL,
    "txnid" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProgressBilling_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JournalTxn" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "txnid" TEXT NOT NULL,
    "jobId" INTEGER,
    "kind" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "amount" DECIMAL NOT NULL,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_code_key" ON "Job"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CostCode_code_key" ON "CostCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressBilling_txnid_key" ON "ProgressBilling"("txnid");

-- CreateIndex
CREATE UNIQUE INDEX "JournalTxn_txnid_key" ON "JournalTxn"("txnid");
