# TalentBridge Phase 2: the Salesforce back end

This folder is a Salesforce project. It contains everything TalentBridge needs on the Salesforce side: three custom objects, the Apex REST API (including candidate sign-in), its tests, permissions, and sample data. You deploy it into your own free Salesforce org, make the API public, and then point the front end at it.

```text
Browser (TalentBridge)                        Your Salesforce org
  JobService / AuthService                      Salesforce Site (public web address)
    GET  /services/apexrest/jobs          ->      JobsResource.cls          -> Job_Requirement__c records
    GET  /services/apexrest/jobs/{Id}     ->      JobsResource.cls
    POST /services/apexrest/auth/register ->      AuthResource.cls          -> new Candidate__c (hashed password)
    POST /services/apexrest/auth/login    ->      AuthResource.cls          -> returns a sign-in token
    GET  /services/apexrest/auth/me       ->      AuthResource.cls
    POST /services/apexrest/auth/logout   ->      AuthResource.cls
    POST /services/apexrest/applications  ->      ApplicationsResource.cls  -> new Job_Application__c (token needed)
    GET  /services/apexrest/applications  ->      ApplicationsResource.cls  -> my applications (token needed)
```

Recruiters add and close jobs in Salesforce's normal screens. Anonymous visitors reach the API through a **Salesforce Site**, which runs as a special "guest user" that may only call these three Apex classes. Browsing jobs is public; applying needs a candidate account.

## Already deployed the first version? Add sign-in in 4 steps

If you followed Steps 1 to 3 before candidate sign-in existed, do only this:

1. Replace your `salesforce` folder with this one, then in a terminal inside it:
   ```bash
   sf project deploy start --source-dir force-app --target-org talentbridge --test-level RunLocalTests
   ```
   Expect "Deploy Succeeded" and all 44 tests passing.
2. Give yourself access to the new Candidate object and fields (safe to run again):
   ```bash
   sf org assign permset --name TalentBridge_Admin --target-org talentbridge
   ```
   If it says the permission set is already assigned, that's fine: it updates automatically.
3. Setup → **Sites** → **TalentBridge API** → **Public Access Settings** → **Enabled Apex Class Access** → **Edit** → move **AuthResource** to the right (next to JobsResource and ApplicationsResource) → **Save**.
4. Test: open `https://<your-sites-domain>/api/services/apexrest/auth/me` in the browser. Expect `[{"errorCode":"INVALID_SESSION","message":"Please sign in."}]`. That 401 is correct: it proves `AuthResource` is reachable and nobody is signed in. If you see "Authorization Required" instead, step 3 didn't save.

Then update the front end (see the main README). Applications sent before sign-in existed stay in Salesforce; the same email can't apply to the same job twice either way.

### How sign-in works (and how to explain it)

```text
1. Register or log in    POST /auth/login {email, password}
                         Apex checks the password against a salted, stretched hash
                         -> 200 { token: "<64 random hex chars>", expiresAt, candidate }
2. Browser keeps token   sessionStorage (gone when the tab closes)
3. Every API call        authInterceptor adds   X-TB-Token: <token>
4. Apex checks it        SHA-256(token) must match Candidate__c.Session_Token_Hash__c and not be expired
5. Sign out              POST /auth/logout clears the hash: the old token stops working everywhere
```

- **Passwords are never stored.** `CandidateAuth.cls` stores `v1$1000$<salt>$<hash>`: a random salt per person and 1,000 rounds of HMAC-SHA256. Two people with the same password get different hashes, and guessing is slow.
- **Tokens are stored as hashes too**, so someone reading the database can't sign in with what they see.
- **Why `X-TB-Token` and not `Authorization: Bearer`?** Salesforce reads the `Authorization` header itself and rejects tokens it didn't issue, before your Apex runs.
- **Brute force:** 5 wrong passwords lock the account for 15 minutes (`429 ACCOUNT_LOCKED`). Wrong password and unknown email give the same answer, so attackers can't test which emails have accounts by signing in.
- **The email on an application comes from the account**, never from the request body, so nobody can apply in someone else's name.
- **Honest limit:** a production portal would normally use Salesforce Experience Cloud users or an identity provider (OAuth 2.0 / OpenID Connect, like Okta or Auth0), with password reset, email verification and rate limiting. This hand-built version shows the moving parts clearly, which is the point of a practice project.

**What was checked before you got this:** all Apex parses with an Apex grammar checker; every XML file is well-formed; the Salesforce CLI converts the project cleanly into a deployable package; and the front end was tested end to end, with no mock, against a stand-in server that copies the Apex behaviour. **Not checked:** compiling and running it inside a real Salesforce org. Your first deploy is that check; if it reports an error, see Troubleshooting or send me the exact message.

## What's in this folder

| Path | What it is |
| --- | --- |
| `force-app/main/default/objects/Job_Requirement__c/` | The "job" table: title, type, location, city, state, duration, experience, skills, description, responsibilities, status, posted date |
| `force-app/main/default/objects/Job_Application__c/` | The "application" table, linked to a job and a candidate: name, email, phone, work authorization, resume link, status |
| `force-app/main/default/objects/Candidate__c/` | Candidate accounts: name, email, password hash, sign-in token hash and expiry, failed sign-ins, lock |
| `force-app/main/default/classes/JobsResource.cls` | `GET /jobs` and `GET /jobs/{Id}` |
| `force-app/main/default/classes/ApplicationsResource.cls` | `POST /applications` (signed in, with all the server-side checks) and `GET /applications` (my applications) |
| `force-app/main/default/classes/AuthResource.cls` | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` |
| `force-app/main/default/classes/CandidateAuth.cls` | Password hashing, tokens, and "who is calling?" |
| `force-app/main/default/classes/ApiResponse.cls` | Shared helpers: JSON responses and Salesforce-style errors |
| `force-app/main/default/classes/*Test.cls` | Tests for every rule. Salesforce won't deploy Apex without them |
| `force-app/main/default/permissionsets/TalentBridge_Admin` | Lets **you** see and edit jobs, applications and candidates (never the hash fields) |
| `force-app/main/default/permissionsets/TalentBridge_Public_API` | Lets the **guest user** call the three REST classes, nothing else |
| `force-app/main/default/layouts/`, `tabs/` | The record pages and tabs you'll use in Salesforce |
| `data/Job_Requirement__c.json` | The 8 sample jobs, for the CLI |
| `scripts/apex/seed-jobs.apex` | The same 8 jobs, for pasting into the Developer Console |

## Step 1: get a free Salesforce org (10 minutes)

1. Go to <https://developer.salesforce.com/signup> and sign up for a **Developer Edition** org. It's free and doesn't expire as long as you log in now and then.
2. Use a real email; you'll get a verification link. Your **username** must look like an email but doesn't have to be one you own, for example `yourname.talentbridge@example.dev`. Write it down.
3. Verify, set a password, and log in. You land in **Setup** or the home page. The gear icon at top right always takes you to **Setup**.

## Step 2: deploy this project (pick A or B)

### A. With the Salesforce CLI (recommended, about 20 minutes)

1. Install Node.js (LTS) from <https://nodejs.org> if you don't have it, then in a terminal:
   ```bash
   npm install --global @salesforce/cli
   sf --version
   ```
2. In a terminal, go into **this** folder (`talentbridge/salesforce`) and log in to your org. A browser window opens; log in and click **Allow**.
   ```bash
   sf org login web --alias talentbridge
   ```
3. Deploy everything and run the tests (Developer Edition orgs require it for Apex):
   ```bash
   sf project deploy start --source-dir force-app --target-org talentbridge --test-level RunLocalTests
   ```
   Expect "Deploy Succeeded" and all tests passing. If it fails, read the first error and see Troubleshooting.
4. Give yourself access to the new fields and tabs, and load the sample jobs:
   ```bash
   sf org assign permset --name TalentBridge_Admin --target-org talentbridge
   sf data import tree --files data/Job_Requirement__c.json --target-org talentbridge
   ```
5. Open the org:
   ```bash
   sf org open --target-org talentbridge
   ```
   Click the **App Launcher** (nine dots, top left), search **Job Requirements**, and you should see the 8 jobs.

### B. By hand in Setup (about 90 minutes, and you learn more)

Do this if you'd rather not install the CLI. You build the same things by clicking; the files in `force-app` show you exactly what to create.

1. **Objects.** Setup → **Object Manager** → **Create** → **Custom Object**.
   - Label `Job Requirement`, Plural `Job Requirements`, Record Name `Job Title` (Text). Tick **Launch New Custom Tab Wizard after saving**, Save, then finish the tab wizard.
   - Repeat for `Job Application`, Plural `Job Applications`, Record Name `Application Number` with Data Type **Auto Number**, Display Format `APP-{00000}`, Starting Number 1.
2. **Fields.** In Object Manager open each object → **Fields & Relationships** → **New**. Create the fields in the table below. On the last screen of each, leave the page layout box ticked so the field appears on the record page. The **API name must match exactly** (Salesforce adds `__c` itself).

   | Object | Label | API name | Type and settings |
   | --- | --- | --- | --- |
   | Job Requirement | Employment Type | `Employment_Type__c` | Picklist: `Contract - W2`, `Contract to hire`, `Full-time` |
   | Job Requirement | Work Location | `Work_Location__c` | Picklist: `Onsite`, `Hybrid`, `Remote` |
   | Job Requirement | City | `City__c` | Text, 80 |
   | Job Requirement | State | `State__c` | Text, 40 |
   | Job Requirement | Duration | `Duration__c` | Text, 80 |
   | Job Requirement | Experience (Years) | `Experience_Years__c` | Number, length 2, decimals 0 |
   | Job Requirement | Skills | `Skills__c` | Text, 255 |
   | Job Requirement | Description | `Description__c` | Text Area (Long) |
   | Job Requirement | Responsibilities | `Responsibilities__c` | Text Area (Long) |
   | Job Requirement | Status | `Status__c` | Picklist: `Open` (default), `Closed` |
   | Job Requirement | Posted Date | `Posted_Date__c` | Date |
   | Job Application | Job | `Job__c` | Lookup Relationship to Job Requirement |
   | Job Application | Full Name | `Full_Name__c` | Text, 80 |
   | Job Application | Email | `Email__c` | Email |
   | Job Application | Phone | `Phone__c` | Phone |
   | Job Application | Work Authorization | `Work_Authorization__c` | Picklist: `US citizen`, `Green card`, `H-1B`, `EAD`, `Other` |
   | Job Application | Resume URL | `Resume_URL__c` | URL |
   | Job Application | Status | `Status__c` | Picklist: `Submitted` (default), `Reviewed`, `Interview`, `Rejected`, `Hired` |

   Picklist values must match exactly, including capitals and spaces, because the Apex code and the front end use them.
3. **Apex classes.** Setup → Quick Find **Apex Classes** → **New**. Paste each class from `force-app/main/default/classes/` and Save, in this order: `ApiResponse`, `JobsResource`, `ApplicationsResource`, `JobsResourceTest`, `ApplicationsResourceTest`. (In a Developer Edition org you can save Apex directly; tests are only enforced when deploying.)
4. **Run the tests.** Setup → **Apex Test Execution** → **Select Tests** → tick both test classes → **Run**. All should pass.
5. **Sample jobs.** Click the gear → **Developer Console** → **Debug** → **Open Execute Anonymous Window**. Paste all of `scripts/apex/seed-jobs.apex`, click **Execute**. Then check the **Job Requirements** tab.

## Step 3: make the API public with a Salesforce Site (15 minutes)

1. Setup → Quick Find **Sites** → open **Sites** (under User Interface → Sites and Domains).
2. If you're asked to register a Salesforce Sites domain, accept the suggested one and save. Newer orgs already have one, shaped like `yourdomain-dev-ed.develop.my.salesforce-sites.com`.
3. Click **New** and fill in:
   - Site Label: `TalentBridge API`
   - Site Name: `TalentBridge_API`
   - Default Web Address: `api` (this becomes part of the URL)
   - Active: ticked
   - Active Site Home Page: use the lookup and pick any page, such as `UnderConstruction`
4. **Save.** If the site detail page has a **Guest Record Default Owner** setting, set it to your own user, so applications created by visitors have an owner.
5. On the site's detail page, click **Public Access Settings**. This opens the guest user's profile.
6. Scroll to **Enabled Apex Class Access** → **Edit** → move `JobsResource`, `ApplicationsResource` and `AuthResource` to the right → **Save**. Nothing else on this profile needs changing. (Alternative: on the site page click **Public Access Settings → View Users**, open the guest user, and assign the `TalentBridge Public API` permission set.)
7. Your API base address is now:

   ```text
   https://<your-sites-domain>/api/services/apexrest
   ```

8. **Test it in the browser.** Open `https://<your-sites-domain>/api/services/apexrest/jobs`. You should see JSON: an array of the 7 open jobs, the first starting with `"attributes":{"type":"Job_Requirement__c"`. Copy one `"Id"` and open `.../services/apexrest/jobs/<that Id>` to see a single job.

**Test sign-in and the POST** from a terminal (Mac or Linux; on Windows use Git Bash or Postman). Replace the domain and job Id:

```bash
SITE="https://<your-sites-domain>/api/services/apexrest"

# 1. Create an account. The answer contains "token":"<64 characters>". Copy it.
curl -i -X POST "$SITE/auth/register" -H "Content-Type: application/json" \
  -d '{"fullName":"Test Person","email":"test@example.com","password":"Testpass1"}'

# 2. Apply with that token.
curl -i -X POST "$SITE/applications" -H "Content-Type: application/json" \
  -H "X-TB-Token: <paste the token>" \
  -d '{"application":{"Job__c":"<a job Id>","Full_Name__c":"Test Person","Work_Authorization__c":"H-1B","Resume_URL__c":"https://example.com/cv.pdf"}}'
```

Expect `HTTP/1.1 201` and `{"id":"...","status":"Submitted"}`. Run step 2 again and expect `409`; without the `X-TB-Token` line, expect `401`. In Salesforce, open the job: the application is in its **Applications** list, linked to the candidate.

## Step 4: connect the front end (Phase 3)

First, in `talentbridge/index.html`:

1. Change `ng-app="talentBridge.mock"` to `ng-app="talentBridge"`.
2. Delete the two lines under the `MOCK` comment (`angular-mocks.js` and `mock-salesforce-api.js`).

Then pick **one** way for the browser to reach Salesforce.

### Option 1: the local proxy (easiest, no CORS setup)

Needs Node.js. From the `talentbridge` folder:

```bash
node dev-server.js https://<your-sites-domain>/api
```

Open <http://localhost:8080>. Leave `API_URL` in `js/app.module.js` as `'/services/apexrest'`. The proxy serves the app and forwards every `/services/apexrest/...` call to Salesforce, so the browser only talks to `localhost` and CORS never comes up. Each forwarded call is printed in the terminal.

### Option 2: call Salesforce directly (needs CORS)

1. Salesforce Setup → Quick Find **CORS** → **New** in Allowed Origins List. Add the address your app runs on, exactly, with no trailing slash: `http://localhost:63342` for IntelliJ, `http://localhost:8080` if you use a local server. Add each one you use.
2. In `js/app.module.js`, set:
   ```js
   .constant('API_URL', 'https://<your-sites-domain>/api/services/apexrest')
   ```
3. Open the app as usual. If the browser console shows a CORS error, use Option 1 instead.

### Check it worked

- The board shows the jobs from Salesforce. The "Simulate API failure" switch is gone, because the mock is gone.
- In Salesforce, create a new Job Requirement with Status `Open`, then press **Refresh** on the board. It appears.
- Change a job's Status to `Closed`. It disappears from the board, and its page says it's no longer accepting applications.
- Apply to a job. The new application shows in Salesforce on that job's **Applications** list.

That last one is your demo moment.

## Troubleshooting

| What you see | Likely cause and fix |
| --- | --- |
| Deploy error mentioning `motif` or a tab | Delete the `tabs` folder and the three `<tabSettings>` blocks in `TalentBridge_Admin.permissionset-meta.xml`, deploy again, then create the tabs in Setup → Tabs → New |
| Any other deploy error | Read the first line: it names the file and line. Send it to me exactly as shown |
| Deploy says tests failed | The output lists the test and the reason. Usually a picklist value typed differently from the code |
| You can't see the custom fields or tabs | Assign yourself the `TalentBridge_Admin` permission set (Setup → Users → your user → Permission Set Assignments) |
| `/jobs` page shows "Authorization Required" or a login page | The site isn't active, or the guest profile doesn't have the three Apex classes under Enabled Apex Class Access |
| Sign-in or register shows "Authorization Required" / the app says it can't reach the service | `AuthResource` isn't under Enabled Apex Class Access yet |
| Every sign-in fails with "Email or password is incorrect" | The email has no account yet (create one), or the password differs. After 5 tries the account locks for 15 minutes; to unlock early, open the candidate in Salesforce and clear **Locked Until** |
| Applying says "Please sign in to apply" right after signing in | The token header isn't reaching Salesforce. Locally, use the updated `dev-server.js`; on Netlify, check the `_redirects` file is in the uploaded folder |
| `Could not find a match for URL` | The address is off. Check the site path (`/api`), and that it ends in `/services/apexrest/jobs` |
| Empty list `[]` | No jobs have Status `Open`, or the sample data wasn't loaded |
| Apply fails with an owner or permission error | Set the site's Guest Record Default Owner to your user (Step 3.4) |
| Browser console says "blocked by CORS policy" | The origin in Setup → CORS doesn't exactly match your app's address, or use the local proxy |
| Proxy prints `could not reach Salesforce` | The site address passed to `dev-server.js` is wrong; open it in the browser to check |

Salesforce changes its Setup screens from time to time. If a menu name here doesn't match what you see, search for it in Setup's Quick Find box, or check Salesforce Help.

## How to talk about it

- **Back end:** "Three custom objects in Salesforce and an Apex REST API: GET open jobs, GET one job, candidate register/login/logout, POST an application and GET my applications, exposed through a Salesforce Site."
- **Sign-in:** "Candidates sign in through an Apex endpoint. Passwords are stored as salted, stretched HMAC-SHA256 hashes; the session token is random, stored only as a hash, expires after 8 hours, and is sent in a custom header because Salesforce reserves the Authorization header. Five wrong passwords lock the account for 15 minutes. In production I'd use Experience Cloud or an OAuth/OIDC provider."
- **Security:** "The guest user can only call three Apex classes. The classes run without sharing because guest users can't own or be shared records, so they only return public job fields and only ever insert an application. The POST copies six known fields, so a visitor can't set the status by adding it to the JSON."
- **Validation:** "The front end validates for speed; Apex validates again, because a server must never trust the browser. Duplicates return 409, a closed job 400, an unknown job 404, all in Salesforce's own error format."
- **Testing:** "Apex tests cover every rule. Salesforce requires 75% coverage to deploy, but the point is that the tests describe the API contract."
- **Integration:** "The front end was built first against a mock with the same JSON contract, so switching to Salesforce was configuration, not code."
