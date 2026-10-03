# Legal centre: details to confirm before launch

The nine legal pages are draft policy frameworks for the local Azuriya preview.
They explain the current implementation and deliberately do not supply an
invented operator, licence, regulator, effective date or governing law.

## Operator and product

- Legal entity name, company registration details and registered address.
- Operating jurisdiction and the territories and customer categories served.
- Actual activities: software licensing, community management, brokerage,
  prop firm programmes, payment facilitation or another role.
- Permissions and limitations applicable to each activity; verified registration
  links where relevant.
- The contracting party for each live account, programme and provider service.
- Monitored support, privacy, complaints and security contact channels.
- Accountable policy owner, approved version and effective date.

## Privacy and device storage

- Controller and processor roles for the operator, tenant, broker and providers.
- Hosting locations, sub-processors, recipients and transfers.
- Purpose and legal basis for each category of processing in the actual
  jurisdictions served.
- Data collected by access logs, support tools, mail delivery and monitoring in
  the production deployment.
- Retention schedules, backup deletion, incident handling and request procedures.
- Relevant rights and supervisory contact details under applicable law.
- Production storage audit, including embedded provider scripts and consent
  or exception assessments.

Verified current code facts:

| Item               | Current behaviour                                                                                                   | Source                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Session cookie     | `azuriya_session`, HttpOnly, SameSite=Strict, 12 hours; logout revokes the session and clears the cookie            | `backend/internal/httpapi/auth.go`, `backend/internal/auth/auth.go`     |
| Secure flag        | Deployment-configured; verify HTTPS and `COOKIE_SECURE=true` before production                                      | `backend/internal/httpapi/auth.go`, `docs/api.md`                       |
| Workspace choice   | Browser local storage `azuriya:workspace:<userId>` holds the selected workspace identifier without automatic expiry | `apps/web-trader/src/lib/use-workspaces.ts`                             |
| Passwords          | Argon2id hashes; password hashes and session token digests are not public API fields                                | `backend/internal/auth/auth.go`, `docs/api.md`                          |
| Public community   | In-memory examples and local edits; no real messaging or media capture                                              | Marketing dashboard components                                          |
| Contact inquiry    | Planned local draft builder, no delivery; optional user-requested clipboard copy                                    | Root implementation to verify before completion                         |
| Privacy choice     | Opt-in local storage key `azuriya:privacy-preferences` with analytics false; no automatic expiry                    | `apps/web-trader/src/components/marketing/site-privacy-preferences.tsx` |
| Optional analytics | No analytics or advertising integration identified in current website source                                        | `apps/web-trader/src`, `apps/web-trader/package.json`                   |

The planned contact feature above must be checked against its final
implementation. These controls must not be represented as transmitting a lead
or recording analytics consent for a tracker that is not used.

## Commercial, execution and payments

- Included software and the exact meaning of the proposed free solution.
- Platform connectors actually enabled and supported account/version limits.
- Contracted liquidity providers, execution venues, order handling and outages.
- Commission basis: per side or round turn, markup, rebates, taxes and settlement.
- Provider and payment fees, permitted currencies, funding limits and refunds.
- Broker-enabled MT5 payment arrangement and the party responsible for funds.
- Prop firm programme conditions, drawdown definitions, eligible strategies,
  refunds, funded-account status and payout entitlement.
- Conflict review, applicable customer protections and approved risk disclosures.

## Identity verification and complaints

- Allocation of AML/KYC duties among the operator and approved providers.
- Eligibility, evidence collection, checks, escalation and reporting procedures.
- Secure verification tooling and justified retention of evidence.
- Actual complaint recipient, review ownership and service commitments.
- Any statutory time limits and external dispute routes that apply to the
  entity and product; do not infer them from another jurisdiction.

## Reference material

UK sources inform review questions. They do not establish that UK law governs
Azuriya or that this preview meets UK requirements.

- [ICO privacy notice guidance](https://ico.org.uk/for-organisations/advice-for-small-organisations/privacy-notices-and-cookies/how-to-write-a-privacy-notice-and-what-goes-in-it/)
- [ICO privacy information checklist](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/)
- [ICO storage and access guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/how-do-we-comply-with-the-pecr-rules/)
- [FCA CFD information](https://www.fca.org.uk/firms/contract-for-differences)

The ICO privacy pages currently identify guidance under review following the
Data (Use and Access) Act. Recheck source guidance and the applicable
jurisdiction when the operator details are available.
