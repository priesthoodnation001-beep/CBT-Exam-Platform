# TIMPRIEST EDU

## JAMB, WAEC and NECO preparation platform

Open `/prep` for the separate student preparation platform. Students create a dedicated prep account, choose JAMB, WAEC, or NECO and a subject, complete a timed practice session, and review their score and answers. Prep accounts and results are kept separate from school CBT accounts.

The platform owner manages the question bank from **Creator → Prep Questions**. Download the CSV template there and upload questions with these required columns:

`exam,subject,question,optionA,optionB,optionC,optionD,answer`

Use `JAMB`, `WAEC`, or `NECO` for `exam`; answers may be `A`–`D` or `1`–`4`. `explanation` and `year` are optional columns. Question imports are limited to 500 questions per batch; duplicate questions in the same exam and subject are skipped.

The Creator can upload `.docx` Word question banks as well as PDFs (up to 25 MB and 100 pages). For Word, use a table with `Question`, `Option A`, `Option B`, `Option C`, `Option D`, and `Correct answer` columns; `Explanation` and `Year` are optional. Alternatively, format questions as numbered paragraphs with A–D options and an `Answer: B` line. The Creator selects the exam and subject, then previews and edits extracted questions before importing. Older `.doc` files are not supported; save them as `.docx`.

PDFs with selectable text are read directly; scanned pages use English OCR in the browser. The PDF itself is not sent to the server for extraction. OCR retrieves its worker and language data from jsDelivr when those assets are not cached, so scanned-PDF processing needs internet access in that case. The extractor recognizes numbered questions with A–D options; check every question and answer in the preview, and select any missing correct answers before importing. If a PDF layout cannot be recognized reliably, use the CSV template instead.

Prep exam access is billed separately each month: JAMB is ₦1,500, WAEC is ₦1,000, and NECO is ₦1,000 by default. Students pay manually through Paystack for each exam they want; a confirmed payment grants one calendar month for that exam only, and renewing early adds a month to its current expiry. The Creator can change all three prices in **Payments → Monthly Prep prices by exam**. Existing subscribers from the previous monthly plan keep their all-exam access until their current expiry, then choose which exam(s) to renew. Set `PAYSTACK_SECRET_KEY` on the hosted server to enable checkout and payment verification. If checkout reports “no active channel to process transaction” while CBT payments work, check that both flows use the same Paystack mode and ask Paystack Support to check channel eligibility for the Prep transaction. Server logs include the Prep exam, amount, currency, HTTP status, and provider message, but not customer email or payment credentials.
The Creator can also record a cash, bank-transfer, or other manual payment from **Creator → Prep Access**. Search by Prep username or name, select the exam, and enter a payment note; activation grants one calendar month for that exam and is recorded in Creator Activity.

The Creator manages referral accounts and individual JAMB, WAEC, and NECO commission rates from **Creator → Prep Ambassadors**. Ambassadors sign in at `/prep/ambassador` to copy their unique `/prep?ref=...` link and view referred users' names, phone numbers, paid exam plans, and earned commissions. Prep registration collects a phone number for this referral list. Each successful online or Creator-recorded manual payment—including renewals—earns the ambassador's current rate for that exam; rate changes apply to future payments. Ambassadors can request withdrawal of their full unpaid commission balance by providing their bank name, account name, and account number. These payout details are available to the Creator in the withdrawal review list. The Creator is notified in the workspace, where approving confirms the payout was sent and moves the balance into paid commission; rejecting releases the balance for a later request.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Role-specific Windows desktop installers

Run `npm run desktop:roles` to build separate Admin, Teacher, and Student installers in `release/`.
These role-specific apps connect to the hosted school service, so their accounts, exams, and results
use the same online data. Their web interface is loaded from the hosted site and updates after the
site is deployed and the app is next opened or reloaded; internet access is required. Signed-in
dashboards refresh shared school data every 15 seconds when no exam is in progress. Native app
capabilities still require a new installer or APK to be built and installed. Each installer has a
distinct app identity so the three apps can be installed side by side.

Admins can browse saved questions in the Archived section, grouped by the date they were saved,
and schedule a future exam from selected archived questions. Scheduling copies the selected
questions into the new exam and leaves the archived originals intact. The archive can be exported
through the print dialog as PDF.
Admins can correct a submitted subject name from Approvals; the change carries through to its
questions, scheduled exams, and the teacher's submitted subject while preserving review status.

Run `npm run android:creator` to build a separate Creator APK in `release/`. It opens the hosted
Creator console and uses the same Creator sign-in as the website. The Creator APK can be installed
alongside the Admin, Teacher, and Student apps.

Run `npm run android:prep` to build the Prep APK in `release/`. It opens directly to the hosted
Prep platform. On Android devices with fingerprint authentication enrolled, users can enable
fingerprint sign-in after signing in with their Prep username and password. Saved sign-in credentials
are protected by the Android biometric credential store; password sign-in remains available.

Run `npm run android:ambassador` to build a separate Ambassador APK in `release/`. It opens directly
to the hosted Prep Ambassador sign-in and can be installed alongside the other TIMPRIEST EDU apps.

Student registration uses the SSS 1, SSS 2, and SSS 3 Science, Art, and Commercial sections.
Admins can print the registered student roster grouped by section from Accounts > Students.
Each teacher or student account row has an actions menu for editing account details or deleting
the account. Teacher passwords can be changed in the edit form; leaving the password field blank
keeps the existing password.

In the Creator Payments view, purchase credit quantities can be adjusted with an audit reason.
The payment amount is unchanged; completed online purchases receive a matching ledger adjustment,
and a reduction cannot exceed the school's unspent balance. Completed offline vouchers are not
editable after payment. The Creator can also set the price per credit for all new school purchases.
Price changes are audited, apply to website and linked LAN checkout, and do not change payments
that were already started.

Packaged Windows desktop apps check GitHub Releases for updates when they start. Use
**Check for updates** in the app menu to check manually. Updates download in the
background; the app prompts to restart when a download is ready, or installs it the
next time the app is closed. Development runs do not check for updates. Publishing
updates requires a GitHub Release containing the electron-builder update metadata
and installer artifacts.
