-- CreateTable
CREATE TABLE "LaborBurdenSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "sickTimeAccrualPct" DECIMAL(65,30) NOT NULL DEFAULT 0.033,
    "companyHolidayDays" INTEGER NOT NULL DEFAULT 13,
    "avgHoursPerYear" DECIMAL(65,30) NOT NULL DEFAULT 2000,
    "ficaPct" DECIMAL(65,30) NOT NULL DEFAULT 0.0765,
    "futaPct" DECIMAL(65,30) NOT NULL DEFAULT 0.006,
    "stateUnemploymentPct" DECIMAL(65,30) NOT NULL DEFAULT 0.013,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaborBurdenSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkersCompRate" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkersCompRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PtoAccrualTier" (
    "id" SERIAL NOT NULL,
    "minTenureYears" INTEGER NOT NULL,
    "accrualPct" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "PtoAccrualTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkersCompRate_code_key" ON "WorkersCompRate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PtoAccrualTier_minTenureYears_key" ON "PtoAccrualTier"("minTenureYears");

-- AlterTable: Employee gains job-costing fields, drops flat burden %s
ALTER TABLE "Employee"
    DROP COLUMN "baseRate",
    DROP COLUMN "payrollTaxPct",
    DROP COLUMN "workersCompPct",
    DROP COLUMN "benefitsPct",
    ADD COLUMN "number" TEXT,
    ADD COLUMN "jobTitle" TEXT,
    ADD COLUMN "payType" TEXT NOT NULL DEFAULT 'hourly',
    ADD COLUMN "employmentType" TEXT NOT NULL DEFAULT 'full_time',
    ADD COLUMN "wcCodeId" INTEGER,
    ADD COLUMN "startDate" TIMESTAMP(3),
    ADD COLUMN "holidayDays" INTEGER,
    ADD COLUMN "discretionaryPtoHours" DECIMAL(65,30) NOT NULL DEFAULT 0,
    ADD COLUMN "currentPay" DECIMAL(65,30) NOT NULL DEFAULT 0,
    ADD COLUMN "healthInsMonthly" DECIMAL(65,30) NOT NULL DEFAULT 0,
    ADD COLUMN "retirementPct" DECIMAL(65,30) NOT NULL DEFAULT 0,
    ADD COLUMN "yearlyVehicleValue" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Employee_number_key" ON "Employee"("number");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_wcCodeId_fkey" FOREIGN KEY ("wcCodeId") REFERENCES "WorkersCompRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
