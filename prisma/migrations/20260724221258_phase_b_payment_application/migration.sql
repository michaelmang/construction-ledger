-- CreateTable
CREATE TABLE "PaymentApplication" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "billingId" INTEGER NOT NULL,
    "amount" DECIMAL NOT NULL,
    "date" DATETIME NOT NULL,
    "txnid" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentApplication_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "ProgressBilling" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProgressBilling" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobId" INTEGER NOT NULL,
    "billingDate" DATETIME,
    "periodLabel" TEXT,
    "amountBilled" DECIMAL NOT NULL,
    "retainageWithheld" DECIMAL NOT NULL,
    "paidAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'unpaid',
    "pctCompleteEstimate" DECIMAL,
    "txnid" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProgressBilling_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProgressBilling" ("amountBilled", "billingDate", "createdAt", "id", "jobId", "pctCompleteEstimate", "periodLabel", "retainageWithheld", "txnid") SELECT "amountBilled", "billingDate", "createdAt", "id", "jobId", "pctCompleteEstimate", "periodLabel", "retainageWithheld", "txnid" FROM "ProgressBilling";
DROP TABLE "ProgressBilling";
ALTER TABLE "new_ProgressBilling" RENAME TO "ProgressBilling";
CREATE UNIQUE INDEX "ProgressBilling_txnid_key" ON "ProgressBilling"("txnid");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentApplication_txnid_key" ON "PaymentApplication"("txnid");
