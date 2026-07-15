export default function LoanTermsPage() {
  return (
    <section className="assetPage panel">
      <h1>Asset loan terms</h1>
      <p>
        Borrowers are responsible for collecting and returning equipment within the booked
        windows. Bookings not collected within one day may be cancelled.
      </p>
      <p>
        Late returns may incur the configured late fee. If equipment is not returned beyond the
        configured failure-to-return period, the replacement value can be added to the borrower
        account. Damaged returns can be charged at the reasonable repair or replacement cost
        selected by an asset admin.
      </p>
      <p>
        Borrowers with overdue items cannot make new bookings until the overdue equipment is
        returned in person. Marking an active loan as lost immediately applies the replacement
        value for the relevant serial-numbered units.
      </p>
    </section>
  );
}
