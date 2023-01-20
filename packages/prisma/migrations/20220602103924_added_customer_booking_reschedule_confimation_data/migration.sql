-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "customerConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresCustomerConfirmation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rescheduled" BOOLEAN NOT NULL DEFAULT false;
