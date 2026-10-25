# TalentBridge

A job portal that reads job requirements from Salesforce through an Apex REST API. Anyone can browse jobs; candidates create an account and sign in to apply and track their applications. The mock API in `js/mock/` runs in the browser and answers exactly like the real Apex classes, so the whole app works without Salesforce too.

Stack: HTML5, CSS3, JavaScript, AngularJS 1.8, jQuery 3, Bootstrap 3, Kendo UI Core (DropDownList).

This is a personal practice project with invented sample data. It is not connected to any company's real system.

## Run it

The screens load from `views/*.html`, so the app must be opened through a small web server, not by double-clicking `index.html`.

- **VS Code:** install the "Live Server" extension, right-click `index.html`, choose "Open with Live Server".
- **Or a terminal** in this folder: `npx http-server -p 8080`, then open http://localhost:8080.

Header controls (only while the mock is on):

- **Simulate API failure:** every API call fails until you untick it.
- **Reset practice data:** forgets applications and accounts you created, and signs you out.

Practice account in mock mode: **demo@talentbridge.dev / Demo1234** (or create your own).

## Read the code in this order

| # | File | What to understand |
| --- | --- | --- |
| 1 | `index.html` | The single page, `ng-app`, `ng-view`, and why scripts load in this order |
| 2 | `js/app.module.js` | Module, dependencies, constants, routes |
| 3 | `js/services/job.service.js` | Jobs and applications API calls; Salesforce field names mapped to clean names |
| 4 | `js/services/api-error.service.js` | Turning a failed response into a readable sentence |
| 4a | `js/services/auth.service.js` | Sign in, sign out, who is signed in, where the token is kept |
| 4b | `js/services/auth.interceptor.js` | Adds the token to every API call; handles 401 (expired sign-in) |
| 4c | `js/controllers/login.controller.js`, `register.controller.js` + views | Sign-in and create-account forms, `returnTo` |
| 4d | `js/directives/match.directive.js` | A custom validator: "confirm password" must match |
| 4e | `js/controllers/my-applications.controller.js` + view | A guarded page that lists my applications |
| 5 | `js/mock/mock-salesforce-api.js` | The fake API: endpoints, JSON shapes, server-side validation |
| 6 | `js/controllers/job-board.controller.js` + `views/job-board.html` | State machine, search, Kendo filters, sorting |
| 7 | `js/components/ui.components.js` | Reusable `locationBadge`, `jobCard`, `statePanel` |
| 8 | `js/controllers/job-detail.controller.js` + `views/job-detail.html` | Reading the id from the URL, closed jobs |
| 9 | `js/controllers/apply.controller.js` + `views/apply.html` | Form validation, POST, success and failure |
| 10 | `js/directives/success-modal.directive.js` | The single jQuery integration |
| 11 | `css/app.css` | Mobile-first layout, cards on phones, table on desktop |

For each file, try to answer: what does it do, who calls it, and what would break without it?

## How a request flows

```text
views/job-board.html  ->  JobBoardCtrl.load()  ->  JobService.getAll()  ->  $http GET /services/apexrest/jobs
                                                                                    |
                                    mock (Phase 1) or Salesforce Apex (Phase 2) answers with JSON
                                                                                    |
vm.state = 'ready', table renders  <-  vm.jobs = jobs  <-  records mapped to job objects  <-+
           or 'error', retry panel <-  .catch()
```

## API contract (Phase 2 must match this)

```text
GET  /services/apexrest/jobs           200  [Job_Requirement__c, ...]   Open jobs, newest first
GET  /services/apexrest/jobs/{Id}      200  Job_Requirement__c          404 if unknown
POST /services/apexrest/auth/register  201  { token, expiresAt, candidate }   400 invalid, 409 email taken
POST /services/apexrest/auth/login     200  { token, expiresAt, candidate }   401 wrong, 429 locked
GET  /services/apexrest/auth/me        200  { candidate }                     401 not signed in
POST /services/apexrest/auth/logout    200  { signedOut: true }
POST /services/apexrest/applications   201  { "id": "...", "status": "Submitted" }     (X-TB-Token)
                                       400  missing fields, job closed
                                       401  not signed in or expired
                                       404  job not found
                                       409  this candidate already applied to this job
GET  /services/apexrest/applications   200  [ { id, applicationNumber, status, submittedAt, job } ]  (X-TB-Token)
```

`candidate` is `{ id, fullName, email }`. Signed-in calls send the token in an `X-TB-Token` header (Salesforce reserves `Authorization` for its own sessions).

One job record, as Salesforce returns it:

```json
{
  "attributes": { "type": "Job_Requirement__c", "url": "/services/data/v61.0/sobjects/Job_Requirement__c/a0B5g00000JbA1EAAV" },
  "Id": "a0B5g00000JbA1EAAV",
  "Name": "AngularJS UI Developer",
  "Employment_Type__c": "Contract - W2",
  "Work_Location__c": "Onsite",
  "City__c": "Dallas",
  "State__c": "TX",
  "Duration__c": "Long term",
  "Experience_Years__c": 4,
  "Skills__c": "HTML5, CSS3, JavaScript, jQuery, AngularJS, Kendo UI, Bootstrap, Git",
  "Description__c": "...",
  "Responsibilities__c": "line one\nline two",
  "Status__c": "Open",
  "Posted_Date__c": "2026-10-14"
}
```

The application body the front end sends (no email: the server uses the signed-in account's):

```json
{ "application": { "Job__c": "a0B5g00000JbA1EAAV", "Full_Name__c": "...",
                   "Phone__c": "...", "Work_Authorization__c": "H-1B", "Resume_URL__c": "https://..." } }
```

Errors follow Salesforce's format: `[ { "errorCode": "DUPLICATE_VALUE", "message": "..." } ]`.

## Kendo UI

- **Included:** Kendo UI Core 2022.1.412, the free open-source edition (Apache 2.0). It provides the DropDownList and the AngularJS directives (`kendo.directives`). I bundled only the pieces this app uses into `vendor/kendo/kendo.dropdownlist-angular.min.js`.
- **Kendo filters use `k-on-change`, not `ng-change`.** Kendo writes the selected value into `ng-model` itself, so AngularJS's `ng-change` never fires. Its own `k-on-change` event does, after the model is updated. A good thing to mention in an interview.
- **Not included, and not tested by me: the Kendo Grid.** The Grid is commercial. With a licensed or trial `kendo.all.min.js` from before R2 2022 (when Kendo ended AngularJS support), replace the Kendo script tag in `index.html` and add its CSS. The board detects `kendo.ui.Grid` and switches to the Grid configured in `job-board.controller.js`. Expect to debug that part.

## User-experience states to demo

| State | How to see it |
| --- | --- |
| Loading | Open any screen (the mock waits 600 ms) |
| No matches | Search for "cobol" |
| Error with retry | Tick "Simulate API failure", press Refresh |
| Validation | Type an invalid email or link on the apply form and leave the field |
| Sign-in required | Signed out, open a job and click "Sign in to apply": you return to the form after signing in |
| Wrong password / lock | Wrong password shows a message; 5 in a row lock the account for 15 minutes |
| Expired sign-in | In DevTools → Application → Session Storage, change the token in `tb.session`, then open My applications |
| Custom validator | Create account with two different passwords |
| Server rejection | Apply twice to the same job with the same account |
| Failed submit keeps input | Tick the failure switch, then submit |
| Success | Submit a valid application |
| Closed job | Open `#/jobs/a0B5g00000JbA8EAAV` |
| Unknown job | Open `#/jobs/a0B5g00000ZZZZZZZZ` |

## Git: put it in Bitbucket

```bash
git init
git add .
git commit -m "TalentBridge phase 1: job board, detail and apply on mock API"
git branch -M main
git remote add origin <your Bitbucket repo URL>
git push -u origin main
```

Then make each change from the exercises below on its own branch (`feature/TB-1-salary-field`) with a pull request.

## Exercises to make it yours

1. Add a "Salary range" field: mock data, `JobService` mapping, detail page, board column.
2. Add a third filter, "Minimum experience", as a Kendo DropDownList.
3. Add pagination to the table (10 per page).
4. Add a custom validator directive: resume link must end in `.pdf` or point to LinkedIn.
5. Show "You applied" on the detail page if this browser already applied.

## Phase 2 and 3: the real back end

The Salesforce back end is in the `salesforce/` folder: two custom objects, the Apex REST API matching the contract above, tests, permissions and sample data. Follow `salesforce/README.md` step by step.

Connecting the front end then takes two edits in `index.html` (switch `ng-app` to `talentBridge` and remove the two MOCK script tags) plus one of:

- `node dev-server.js https://<your-sites-domain>/api`, a small local proxy that avoids CORS (it forwards the `X-TB-Token` header too), or
- `API_URL` in `js/app.module.js` set to your site's `/services/apexrest` address, with your app's origin added in Salesforce's CORS settings. Not tested with sign-in: the custom `X-TB-Token` header makes the browser send a CORS preflight first, so prefer a proxy.

## Hosting on Netlify

`talentbridge-live/` (sent separately) is this app already switched to the real API, without the mock files, plus a `_redirects` file. Drag that folder onto <https://app.netlify.com/drop>. The `_redirects` line makes Netlify forward `/services/apexrest/*` to your Salesforce Site, the same job `dev-server.js` does locally, so there is no CORS to set up and the token header passes straight through.
