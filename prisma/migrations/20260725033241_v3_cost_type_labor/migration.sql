-- AlterTable
ALTER TABLE "Bill" ADD COLUMN "costType" TEXT;

-- CreateTable
CREATE TABLE "Employee" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "baseRate" DECIMAL NOT NULL,
    "payrollTaxPct" DECIMAL NOT NULL DEFAULT 0,
    "workersCompPct" DECIMAL NOT NULL DEFAULT 0,
    "benefitsPct" DECIMAL NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LaborEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "txnid" TEXT NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "costCodeId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "hours" DECIMAL NOT NULL,
    "baseRate" DECIMAL NOT NULL,
    "burdenedRate" DECIMAL NOT NULL,
    "grossAmount" DECIMAL NOT NULL,
    "burdenedAmount" DECIMAL NOT NULL,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LaborEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LaborEntry_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LaborEntry_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_name_key" ON "Employee"("name");

-- CreateIndex
CREATE UNIQUE INDEX "LaborEntry_txnid_key" ON "LaborEntry"("txnid");
