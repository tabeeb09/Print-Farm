import assert from "node:assert/strict";

import {
  bookLoan,
  createAsset,
  createInitialAssetState,
  deleteAsset,
  deleteUnit,
  expireMissedCollections,
  extendLoan,
  markLoanLostByUser,
  normalizeAvailability,
  recoverLostUnits,
  repairUnits,
  rescheduleLoan,
  selectAccountDebts,
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

function throwsMessage(fn, text) {
  assert.throws(fn, (error) => error instanceof Error && error.message.includes(text));
}

function actor(id, email = `${id}@example.com`) {
  return { userId: id, userEmail: email };
}

const mondayMorning = new Date("2026-07-06T10:00:00.000Z");
const tuesdayMorning = new Date("2026-07-07T10:00:00.000Z");
const wednesdayMorning = new Date("2026-07-08T10:00:00.000Z");

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

result = setAssetLoanable(state, camera.id, false, mondayMorning);
state = result.state;
assert.equal(selectLoanableListings(state, mondayMorning).length, 0);
result = setAssetLoanable(state, camera.id, true, mondayMorning);
state = result.state;

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

result = verifyCollectionCode(state, { loanId: loanA.id, code: "111111", adminId: "admin" }, mondayMorning);
state = result.state;
assert.equal(result.loan.status, "collected");
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
        quantity: 1,
        collectionAt: "2026-07-06T13:00:00.000Z",
        returnAt: "2026-07-08T13:00:00.000Z",
        acceptTerms: true,
        ...actor("borrower-c"),
      },
      mondayMorning,
    ),
  "Not enough",
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

result = verifyCollectionCode(state, { loanId: loanB.id, code: "333333", adminId: "admin" }, mondayMorning);
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

console.log("asset domain tests passed");
