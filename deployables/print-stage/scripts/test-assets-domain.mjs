import assert from "node:assert/strict";

import {
  adjustAccountBalance,
  bookLoan,
  createAsset,
  createInitialAssetState,
  deleteAsset,
  deleteUnit,
  expireMissedCollections,
  extendLoan,
  markLoanLostByUser,
  normalizeAvailability,
  recordPrintPaymentTransaction,
  recoverLostUnits,
  repairUnits,
  rescheduleLoan,
  selectAccountBalance,
  selectAccountDebts,
  selectAccountTransactions,
  selectAdminLoans,
  selectCatalogue,
  selectInventory,
  selectLoanableListings,
  selectLostDamaged,
  selectUserLoans,
  setAssetLoanable,
  updateAsset,
  userHasOverdueLoan,
  verifyCollectionCode,
  verifyReturnCode,
} from "../lib/assetsDomain.js";
import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
  toFutureDatetimeLocalValue,
} from "../lib/dateTimeLocal.js";

function throwsMessage(fn, text) {
  assert.throws(fn, (error) => error instanceof Error && error.message.includes(text));
}

function actor(id, email = `${id}@example.com`) {
  return { userId: id, userEmail: email };
}

const mondayMorning = new Date("2026-07-06T10:00:00.000Z");
const tuesdayMorning = new Date("2026-07-07T10:00:00.000Z");
const wednesdayMorning = new Date("2026-07-08T10:00:00.000Z");

assert.equal(
  fromDatetimeLocalValue(toDatetimeLocalValue("2026-07-06T10:30:00.000Z")),
  "2026-07-06T10:30:00.000Z",
);
assert.equal(
  fromDatetimeLocalValue(toFutureDatetimeLocalValue("2026-07-06T10:30:30.000Z", new Date("2026-07-06T10:30:45.000Z"))),
  "2026-07-06T10:35:00.000Z",
);

let statusState = createInitialAssetState();
let statusResult = createAsset(
  statusState,
  {
    name: "Collection Window Tester",
    loanable: true,
    quantity: 1,
    availability: {
      weekly: [{ day: 1, start: "09:00", end: "17:00" }],
      dateRanges: [{ start: "2026-07-01T00:00:00.000Z", end: "2026-08-01T00:00:00.000Z" }],
    },
  },
  mondayMorning,
);
statusState = statusResult.state;
assert.equal(
  selectLoanableListings(statusState, new Date("2026-07-05T10:00:00.000Z"))[0].loanStatus,
  "bookable_later",
);
statusResult = bookLoan(
  statusState,
  {
    id: "status-loan",
    assetId: statusResult.asset.id,
    quantity: 1,
    collectionAt: "2026-07-06T11:00:00.000Z",
    returnAt: "2026-07-08T11:00:00.000Z",
    acceptTerms: true,
    collectionCode: "777777",
    returnCode: "888888",
    ...actor("status-borrower"),
  },
  mondayMorning,
);
statusState = statusResult.state;
statusResult = verifyCollectionCode(statusState, { loanId: "status-loan", code: "777777", adminId: "admin", allowEarlyCollection: true }, mondayMorning);
statusState = statusResult.state;
assert.equal(
  selectLoanableListings(statusState, mondayMorning)[0].loanStatus,
  "currently_out_of_premises",
);

throwsMessage(
  () =>
    normalizeAvailability({
      weekly: [{ day: 1, start: "09:00", end: "17:00" }],
      dateRanges: [
        { start: "2026-07-01T00:00:00.000Z", end: "2026-07-10T00:00:00.000Z" },
        { start: "2026-07-09T00:00:00.000Z", end: "2026-07-20T00:00:00.000Z" },
      ],
    }),
  "cannot intersect",
);

let state = createInitialAssetState();
let result = createAsset(
  state,
  {
    name: "Thermal Camera",
    description: "FLIR loan unit",
    loanable: true,
    quantity: 2,
    assetPrice: "120.00",
    availability: {
      weekly: [
        { day: 1, start: "09:00", end: "17:00" },
        { day: 2, start: "09:00", end: "17:00" },
        { day: 3, start: "09:00", end: "17:00" },
      ],
      dateRanges: [{ start: "2026-07-01T00:00:00.000Z", end: "2026-08-01T00:00:00.000Z" }],
    },
  },
  mondayMorning,
);
state = result.state;
const camera = result.asset;

assert.equal(camera.units.length, 2);
assert.equal(camera.lateFeePence, 500);
assert.equal(camera.units[0].serial, "THERMAL-CAMERA-001");
assert.equal(selectLoanableListings(state, mondayMorning).length, 1);
assert.equal(selectCatalogue(state, mondayMorning).find((asset) => asset.id === camera.id).loanabilityHistory.length, 1);

result = setAssetLoanable(state, camera.id, false, mondayMorning);
state = result.state;
assert.equal(selectLoanableListings(state, mondayMorning).length, 0);
result = setAssetLoanable(state, camera.id, true, mondayMorning);
state = result.state;
assert.equal(selectCatalogue(state, mondayMorning).find((asset) => asset.id === camera.id).loanabilityHistory.length, 2);

throwsMessage(
  () =>
    bookLoan(
      state,
      {
        assetId: camera.id,
        quantity: 1,
        collectionAt: "2026-07-06T11:00:00.000Z",
        returnAt: "2026-07-08T11:00:00.000Z",
        acceptTerms: false,
        ...actor("borrower-a"),
      },
      mondayMorning,
    ),
  "terms",
);

result = bookLoan(
  state,
  {
    id: "loan-a",
    assetId: camera.id,
    quantity: 1,
    collectionAt: "2026-07-06T11:00:00.000Z",
    returnAt: "2026-07-08T11:00:00.000Z",
    acceptTerms: true,
    collectionCode: "111111",
    returnCode: "222222",
    ...actor("borrower-a"),
  },
  mondayMorning,
);
state = result.state;
const loanA = result.loan;
assert.equal(loanA.collectionCode, "111111");
assert.equal(selectInventory(state, mondayMorning)[0].quantityPhysicallyPresent, 2);

throwsMessage(
  () => verifyCollectionCode(state, { loanId: loanA.id, code: "000000" }, mondayMorning),
  "incorrect",
);

throwsMessage(
  () => verifyCollectionCode(state, { loanId: loanA.id, code: "111111", adminId: "admin" }, mondayMorning),
  "Early collection",
);

result = verifyCollectionCode(state, { loanId: loanA.id, code: "111111", adminId: "admin", allowEarlyCollection: true }, mondayMorning);
state = result.state;
assert.equal(result.loan.status, "collected");
assert.equal(result.loan.collectedEarly, true);
assert.equal(selectInventory(state, mondayMorning)[0].quantityPhysicallyPresent, 1);

result = bookLoan(
  state,
  {
    id: "loan-b",
    assetId: camera.id,
    quantity: 1,
    collectionAt: "2026-07-06T12:00:00.000Z",
    returnAt: "2026-07-08T12:00:00.000Z",
    acceptTerms: true,
    collectionCode: "333333",
    returnCode: "444444",
    ...actor("borrower-b"),
  },
  mondayMorning,
);
state = result.state;
const loanB = result.loan;

throwsMessage(
  () =>
    bookLoan(
      state,
      {
        assetId: camera.id,
        quantity: "nonsense",
        collectionAt: "2026-07-06T13:00:00.000Z",
        returnAt: "2026-07-08T13:00:00.000Z",
        acceptTerms: true,
        ...actor("borrower-c"),
      },
      mondayMorning,
    ),
  "positive whole number",
);

throwsMessage(
  () =>
    bookLoan(
      state,
      {
        assetId: camera.id,
        quantity: "2abc",
        collectionAt: "2026-07-06T13:00:00.000Z",
        returnAt: "2026-07-08T13:00:00.000Z",
        acceptTerms: true,
        ...actor("borrower-c"),
      },
      mondayMorning,
    ),
  "positive whole number",
);

throwsMessage(
  () =>
    rescheduleLoan(
      state,
      {
        loanId: loanB.id,
        collectionAt: "2026-07-05T10:00:00.000Z",
        returnAt: "2026-07-08T10:00:00.000Z",
        ...actor("borrower-b"),
      },
      mondayMorning,
    ),
  "past",
);

result = verifyReturnCode(
  state,
  {
    loanId: loanA.id,
    code: "222222",
    damaged: true,
    damageDescription: "Lens cracked on return",
    damageChargePence: 2500,
    adminId: "admin",
  },
  wednesdayMorning,
);
state = result.state;
assert.equal(result.loan.status, "returned");
assert.equal(selectLostDamaged(state, wednesdayMorning).length, 1);
assert.equal(selectAccountDebts(state, actor("borrower-a")).reduce((sum, debt) => sum + debt.amountPence, 0), 2500);

const damagedEntry = selectLostDamaged(state, wednesdayMorning)[0];
result = repairUnits(
  state,
  {
    assetId: damagedEntry.assetId,
    unitIds: [damagedEntry.unit.id],
    fixDescription: "Replaced lens cover",
    repairCostPence: 1000,
    applyDiscount: true,
    originalChargePence: 2500,
    chargedUserId: "borrower-a",
    chargedUserEmail: "borrower-a@example.com",
  },
  wednesdayMorning,
);
state = result.state;
assert.equal(selectLostDamaged(state, wednesdayMorning).length, 0);
assert.equal(selectAccountDebts(state, actor("borrower-a")).reduce((sum, debt) => sum + debt.amountPence, 0), 1000);
assert.equal(selectAccountBalance(state, actor("borrower-a")), 1000);

result = adjustAccountBalance(
  state,
  {
    userId: "borrower-a",
    userEmail: "borrower-a@example.com",
    adjustmentType: "surcharge",
    amountPence: 750,
    description: "Manual surcharge for missing accessory",
  },
  { id: "admin", email: "admin@example.com" },
  new Date("2026-07-08T11:10:00.000Z"),
);
state = result.state;
result = adjustAccountBalance(
  state,
  {
    userId: "borrower-a",
    userEmail: "borrower-a@example.com",
    adjustmentType: "refund",
    amountPence: 250,
    description: "Partial refund after accessory found",
  },
  { id: "admin", email: "admin@example.com" },
  new Date("2026-07-08T11:20:00.000Z"),
);
state = result.state;
assert.equal(selectAccountBalance(state, actor("borrower-a")), 1500);
assert.equal(selectAccountTransactions(state, actor("borrower-a"))[0].transactionType, "manual_refund");
assert.equal(selectAccountTransactions(state, actor("borrower-a"))[0].description, "Partial refund after accessory found");
result = recordPrintPaymentTransaction(
  state,
  {
    fileId: "print-job-a",
    userId: "borrower-a",
    amountPence: 4200,
    printName: "gearbox-case.3mf",
    paidAt: "2026-07-08T11:30:00.000Z",
  },
  new Date("2026-07-08T11:30:00.000Z"),
);
state = result.state;
assert.equal(selectAccountBalance(state, actor("borrower-a")), 1500);
assert.equal(selectAccountTransactions(state, actor("borrower-a"))[0].transactionType, "print_payment");
assert.equal(selectAccountTransactions(state, actor("borrower-a"))[0].description, "3D print payment: gearbox-case.3mf");

result = verifyCollectionCode(state, { loanId: loanB.id, code: "333333", adminId: "admin", allowEarlyCollection: true }, mondayMorning);
state = result.state;
assert.equal(selectAdminLoans(state, new Date("2026-07-09T10:00:00.000Z")).active[0].overdue, true);
assert.equal(userHasOverdueLoan(state, actor("borrower-b"), new Date("2026-07-09T10:00:00.000Z")), true);

throwsMessage(
  () =>
    bookLoan(
      state,
      {
        assetId: camera.id,
        quantity: 1,
        collectionAt: "2026-07-13T10:00:00.000Z",
        returnAt: "2026-07-14T10:00:00.000Z",
        acceptTerms: true,
        ...actor("borrower-b"),
      },
      new Date("2026-07-09T10:00:00.000Z"),
    ),
  "overdue",
);

throwsMessage(
  () =>
    extendLoan(
      state,
      {
        loanId: loanB.id,
        returnAt: "2026-07-10T10:00:00.000Z",
        ...actor("borrower-b"),
      },
      new Date("2026-07-09T10:00:00.000Z"),
    ),
  "Overdue",
);

result = markLoanLostByUser(
  state,
  {
    loanId: loanB.id,
    description: "Unit lost on transport",
    ...actor("borrower-b"),
  },
  new Date("2026-07-09T11:00:00.000Z"),
);
state = result.state;
assert.equal(result.loan.status, "lost");
assert.equal(selectLostDamaged(state, wednesdayMorning)[0].unit.condition, "lost");
assert.equal(selectAccountDebts(state, actor("borrower-b")).reduce((sum, debt) => sum + debt.amountPence, 0), 12000);

const lostEntry = selectLostDamaged(state, wednesdayMorning)[0];
result = recoverLostUnits(
  state,
  {
    assetId: lostEntry.assetId,
    unitIds: [lostEntry.unit.id],
    damaged: true,
    damageDescription: "Recovered with scratched housing",
  },
  new Date("2026-07-10T10:00:00.000Z"),
);
state = result.state;
assert.equal(selectLostDamaged(state, wednesdayMorning)[0].unit.condition, "damaged");
result = repairUnits(
  state,
  {
    assetId: lostEntry.assetId,
    unitIds: [lostEntry.unit.id],
    fixDescription: "Polished housing",
    repairCostPence: 0,
  },
  new Date("2026-07-10T11:00:00.000Z"),
);
state = result.state;
assert.equal(selectLostDamaged(state, wednesdayMorning).length, 0);

result = bookLoan(
  state,
  {
    id: "loan-missed",
    assetId: camera.id,
    quantity: 1,
    collectionAt: "2026-07-13T10:00:00.000Z",
    returnAt: "2026-07-14T10:00:00.000Z",
    acceptTerms: true,
    collectionCode: "555555",
    returnCode: "666666",
    ...actor("borrower-c"),
  },
  tuesdayMorning,
);
state = result.state;
state = expireMissedCollections(state, new Date("2026-07-14T11:00:01.000Z"));
assert.equal(selectUserLoans(state, actor("borrower-c"), new Date("2026-07-14T11:00:01.000Z"))[0].status, "cancelled");

result = createAsset(
  state,
  {
    name: "Soldering Iron",
    loanable: false,
    quantity: 2,
  },
  mondayMorning,
);
state = result.state;
const iron = result.asset;
assert.equal(selectCatalogue(state, mondayMorning).find((asset) => asset.id === iron.id).loanable, false);
assert.equal(selectLoanableListings(state, mondayMorning).some((asset) => asset.id === iron.id), false);

result = updateAsset(state, iron.id, { quantity: 3, loanable: true, name: "Soldering Iron" }, mondayMorning);
state = result.state;
assert.equal(result.asset.units.length, 3);
assert.equal(selectLoanableListings(state, mondayMorning).some((asset) => asset.id === iron.id), true);

const deleteTarget = result.asset.units[0];
result = deleteUnit(state, iron.id, deleteTarget.id, mondayMorning);
state = result.state;
assert.equal(selectCatalogue(state, mondayMorning).find((asset) => asset.id === iron.id).quantityTotal, 2);
result = deleteAsset(state, iron.id, mondayMorning);
state = result.state;
assert.equal(selectCatalogue(state, mondayMorning).some((asset) => asset.id === iron.id), false);

const borrowerALoans = selectUserLoans(state, actor("borrower-a"), wednesdayMorning);
assert.equal(borrowerALoans[0].displayState, "historical");
const cameraInventory = selectInventory(state, wednesdayMorning).find((asset) => asset.id === camera.id);
assert.ok(cameraInventory.loanabilityHistory.some((entry) => entry.endAt));
assert.ok(cameraInventory.units.some((unit) => unit.loanHistory.length));

let maxState = createInitialAssetState();
let maxResult = createAsset(
  maxState,
  {
    name: "Torque Wrench",
    loanable: true,
    quantity: 1,
    maxLoanDays: 2,
    availability: {
      weekly: [{ day: 1, start: "09:00", end: "17:00" }],
      dateRanges: [{ start: "2026-07-01T00:00:00.000Z", end: "2026-08-01T00:00:00.000Z" }],
    },
  },
  mondayMorning,
);
maxState = maxResult.state;
throwsMessage(
  () =>
    bookLoan(
      maxState,
      {
        assetId: maxResult.asset.id,
        quantity: 1,
        collectionAt: "2026-07-06T10:00:00.000Z",
        returnAt: "2026-07-09T10:00:01.000Z",
        acceptTerms: true,
        ...actor("borrower-max"),
      },
      mondayMorning,
    ),
  "cannot exceed 2 days",
);
maxResult = bookLoan(
  maxState,
  {
    id: "loan-max",
    assetId: maxResult.asset.id,
    quantity: 1,
    collectionAt: "2026-07-06T12:00:00.000Z",
    returnAt: "2026-07-08T12:00:00.000Z",
    acceptTerms: true,
    collectionCode: "121212",
    returnCode: "343434",
    ...actor("borrower-max"),
  },
  mondayMorning,
);
maxState = maxResult.state;
maxResult = verifyCollectionCode(maxState, { loanId: "loan-max", code: "121212", allowEarlyCollection: true }, mondayMorning);
assert.equal(maxResult.loan.returnDueAt, "2026-07-08T10:00:00.000Z");
assert.equal(selectAdminLoans(maxResult.state, mondayMorning).active[0].collectedEarly, true);

let returnState = createInitialAssetState();
let returnResult = createAsset(
  returnState,
  {
    name: "Loan Return Kit",
    loanable: true,
    quantity: 2,
    lateFeePence: 500,
    availability: {
      weekly: [{ day: 1, start: "09:00", end: "17:00" }],
      dateRanges: [{ start: "2026-07-01T00:00:00.000Z", end: "2026-08-01T00:00:00.000Z" }],
    },
  },
  mondayMorning,
);
returnState = returnResult.state;
const returnAsset = returnResult.asset;
returnResult = bookLoan(
  returnState,
  {
    id: "return-loan",
    assetId: returnAsset.id,
    quantity: 2,
    collectionAt: "2026-07-06T10:00:00.000Z",
    returnAt: "2026-07-06T11:00:00.000Z",
    acceptTerms: true,
    collectionCode: "565656",
    returnCode: "787878",
    ...actor("borrower-return"),
  },
  mondayMorning,
);
returnState = returnResult.state;
returnResult = verifyCollectionCode(returnState, { loanId: "return-loan", code: "565656", adminId: "admin" }, mondayMorning);
returnState = returnResult.state;
returnResult = verifyReturnCode(
  returnState,
  {
    loanId: "return-loan",
    code: "787878",
    returnItems: [
      { unitId: returnResult.loan.unitIds[0], returned: true, damaged: true, damageDescription: "Cracked case." },
      { unitId: returnResult.loan.unitIds[1], returned: true, damaged: false },
    ],
    returnNote: "Returned with charger and case.",
    returnPhotos: [{ name: "return.jpg", type: "image/jpeg", size: 128, dataUrl: "data:image/jpeg;base64,abcd" }],
    damageChargePence: 1200,
    discretionaryChargePence: 300,
    discretionaryChargeDescription: "Missing strap.",
    waiveLateFee: true,
    adminId: "admin",
  },
  new Date("2026-07-06T12:00:00.000Z"),
);
returnState = returnResult.state;
assert.equal(returnResult.loan.returnItems[0].damaged, true);
assert.equal(returnResult.loan.returnItems[1].damaged, false);
assert.equal(returnResult.loan.returnNote, "Returned with charger and case.");
assert.equal(returnResult.loan.returnPhotos.length, 1);
assert.equal(returnResult.loan.lateFeeWaived, true);
assert.equal(returnResult.loan.lateFeePence, 0);
assert.equal(returnResult.loan.discretionaryChargePence, 300);
assert.equal(selectAccountBalance(returnState, actor("borrower-return")), 1500);
assert.ok(selectAccountTransactions(returnState, actor("borrower-return")).some((transaction) => transaction.transactionType === "asset_discretionary"));

let lateState = createInitialAssetState();
let lateResult = createAsset(
  lateState,
  {
    name: "Late Fee Kit",
    loanable: true,
    quantity: 1,
    lateFeePence: 500,
    availability: {
      weekly: [{ day: 1, start: "09:00", end: "17:00" }],
      dateRanges: [{ start: "2026-07-01T00:00:00.000Z", end: "2026-08-01T00:00:00.000Z" }],
    },
  },
  mondayMorning,
);
lateState = lateResult.state;
lateResult = bookLoan(
  lateState,
  {
    id: "late-loan",
    assetId: lateResult.asset.id,
    quantity: 1,
    collectionAt: "2026-07-06T10:00:00.000Z",
    returnAt: "2026-07-06T11:00:00.000Z",
    acceptTerms: true,
    collectionCode: "121314",
    returnCode: "151617",
    ...actor("borrower-late"),
  },
  mondayMorning,
);
lateState = lateResult.state;
lateResult = verifyCollectionCode(lateState, { loanId: "late-loan", code: "121314", adminId: "admin" }, mondayMorning);
lateState = lateResult.state;
lateResult = verifyReturnCode(lateState, { loanId: "late-loan", code: "151617", adminId: "admin" }, new Date("2026-07-06T12:00:00.000Z"));
assert.equal(lateResult.loan.lateFeePence, 500);
assert.equal(selectAccountTransactions(lateResult.state, actor("borrower-late"))[0].transactionType, "late_fee");

let futureState = createInitialAssetState();
let futureResult = createAsset(
  futureState,
  {
    name: "Future Booking Kit",
    loanable: true,
    quantity: 1,
    availability: {
      weekly: [{ day: 1, start: "09:00", end: "17:00" }],
      dateRanges: [{ start: "2026-07-01T00:00:00.000Z", end: "2026-08-01T00:00:00.000Z" }],
    },
  },
  mondayMorning,
);
futureState = futureResult.state;
futureResult = bookLoan(
  futureState,
  {
    id: "future-current",
    assetId: futureResult.asset.id,
    quantity: 1,
    collectionAt: "2026-07-06T10:00:00.000Z",
    returnAt: "2026-07-06T11:00:00.000Z",
    acceptTerms: true,
    collectionCode: "222333",
    returnCode: "444555",
    ...actor("borrower-current"),
  },
  mondayMorning,
);
futureState = futureResult.state;
futureResult = verifyCollectionCode(futureState, { loanId: "future-current", code: "222333", adminId: "admin" }, mondayMorning);
futureState = futureResult.state;
futureResult = bookLoan(
  futureState,
  {
    assetId: futureResult.loan.assetId,
    quantity: 1,
    collectionAt: "2026-07-13T10:00:00.000Z",
    returnAt: "2026-07-13T11:00:00.000Z",
    acceptTerms: true,
    ...actor("borrower-future"),
  },
  mondayMorning,
);
assert.equal(futureResult.loan.status, "reserved");

console.log("asset domain tests passed");
