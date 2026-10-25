/**
 * AuthResource: candidate accounts for the TalentBridge portal.
 *
 *   POST /services/apexrest/auth/register  { "fullName", "email", "password" }
 *        201 { token, expiresAt, candidate }   409 email already registered   400 invalid input
 *   POST /services/apexrest/auth/login     { "email", "password" }
 *        200 { token, expiresAt, candidate }   401 wrong email or password    429 locked
 *   GET  /services/apexrest/auth/me        (X-TB-Token header)
 *        200 { candidate }                     401 not signed in or expired
 *   POST /services/apexrest/auth/logout    (X-TB-Token header)
 *        200 { signedOut: true }               (always, so signing out twice is harmless)
 *
 * "candidate" is { id, fullName, email }. Errors use the same Salesforce format as the
 * other TalentBridge endpoints: [ { "errorCode": "...", "message": "..." } ].
 *
 * "without sharing": anonymous visitors reach this as the Site guest user, who has no
 * record access of its own. The class only ever touches Candidate__c and never returns
 * a password or token hash.
 */
@RestResource(urlMapping='/auth/*')
global without sharing class AuthResource {

    private static final Pattern EMAIL_SHAPE = Pattern.compile('^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$');
    private static final Pattern HAS_LETTER = Pattern.compile('.*[A-Za-z].*');
    private static final Pattern HAS_DIGIT = Pattern.compile('.*[0-9].*');

    @HttpPost
    global static void handlePost() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;
        String action = ApiResponse.lastPathSegment(req.requestURI, '/auth');

        if (action == 'logout') {
            logout(req, res);
            return;
        }
        if (action != 'register' && action != 'login') {
            ApiResponse.error(res, 404, 'NOT_FOUND', 'Unknown sign-in action.');
            return;
        }

        Map<String, Object> body = readBody(req);
        if (body == null) {
            ApiResponse.error(res, 400, 'INVALID_JSON', 'Send the details as a JSON object.');
            return;
        }
        if (action == 'register') {
            register(body, res);
        } else {
            login(body, res);
        }
    }

    @HttpGet
    global static void handleGet() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;

        if (ApiResponse.lastPathSegment(req.requestURI, '/auth') != 'me') {
            ApiResponse.error(res, 404, 'NOT_FOUND', 'Unknown sign-in action.');
            return;
        }
        Candidate__c me = CandidateAuth.currentCandidate(req);
        if (me == null) {
            ApiResponse.error(res, 401, 'INVALID_SESSION', 'Please sign in.');
            return;
        }
        ApiResponse.ok(res, 200, new Map<String, Object>{ 'candidate' => CandidateAuth.publicView(me) });
    }

    // ---------- register ----------

    private static void register(Map<String, Object> body, RestResponse res) {
        String fullName = text(body, 'fullName');
        String email = text(body, 'email').toLowerCase();
        String password = rawText(body, 'password');

        if (String.isBlank(fullName) || String.isBlank(email) || String.isBlank(password)) {
            ApiResponse.error(res, 400, 'REQUIRED_FIELD_MISSING', 'Name, email and password are required.');
            return;
        }
        if (fullName.length() > 80) {
            ApiResponse.error(res, 400, 'STRING_TOO_LONG', 'Name must be 80 characters or fewer.');
            return;
        }
        if (email.length() > 80 || !EMAIL_SHAPE.matcher(email).matches()) {
            ApiResponse.error(res, 400, 'INVALID_EMAIL_ADDRESS', 'Enter a valid email address.');
            return;
        }
        if (password.length() < 8 || password.length() > 128 ||
                !HAS_LETTER.matcher(password).matches() || !HAS_DIGIT.matcher(password).matches()) {
            ApiResponse.error(res, 400, 'WEAK_PASSWORD',
                'Use at least 8 characters, with at least one letter and one number.');
            return;
        }
        if ([SELECT COUNT() FROM Candidate__c WHERE Email__c = :email] > 0) {
            ApiResponse.error(res, 409, 'DUPLICATE_VALUE',
                'An account with this email already exists. Sign in instead.');
            return;
        }

        Candidate__c candidate = new Candidate__c(
            Name = fullName,
            Email__c = email,
            Password_Hash__c = CandidateAuth.hashNewPassword(password)
        );
        String token = CandidateAuth.startSession(candidate);
        try {
            insert candidate;
        } catch (DmlException e) {
            // Two sign-ups with the same email at the same moment: the unique field stops the second.
            if (e.getDmlType(0) == StatusCode.DUPLICATE_VALUE) {
                ApiResponse.error(res, 409, 'DUPLICATE_VALUE',
                    'An account with this email already exists. Sign in instead.');
            } else {
                ApiResponse.error(res, 400, 'INVALID_FIELD', e.getDmlMessage(0));
            }
            return;
        }
        ApiResponse.ok(res, 201, sessionBody(candidate, token));
    }

    // ---------- login ----------

    private static void login(Map<String, Object> body, RestResponse res) {
        String email = text(body, 'email').toLowerCase();
        String password = rawText(body, 'password');

        if (String.isBlank(email) || String.isBlank(password)) {
            ApiResponse.error(res, 400, 'REQUIRED_FIELD_MISSING', 'Enter your email and password.');
            return;
        }

        List<Candidate__c> found = [
            SELECT Id, Name, Email__c, Password_Hash__c, Failed_Logins__c, Locked_Until__c
            FROM Candidate__c
            WHERE Email__c = :email
            LIMIT 1
        ];
        if (found.isEmpty()) {
            CandidateAuth.burnTime(password);
            ApiResponse.error(res, 401, 'INVALID_LOGIN', 'Email or password is incorrect.');
            return;
        }

        Candidate__c candidate = found[0];
        if (candidate.Locked_Until__c != null && candidate.Locked_Until__c > System.now()) {
            ApiResponse.error(res, 429, 'ACCOUNT_LOCKED', lockedMessage());
            return;
        }

        if (!CandidateAuth.verifyPassword(password, candidate.Password_Hash__c)) {
            Integer failed = (candidate.Failed_Logins__c == null ? 0 : candidate.Failed_Logins__c.intValue()) + 1;
            Boolean nowLocked = failed >= CandidateAuth.MAX_FAILED_LOGINS;
            candidate.Failed_Logins__c = nowLocked ? 0 : failed;
            candidate.Locked_Until__c = nowLocked ? System.now().addMinutes(CandidateAuth.LOCK_MINUTES) : null;
            update candidate;
            if (nowLocked) {
                ApiResponse.error(res, 429, 'ACCOUNT_LOCKED', lockedMessage());
            } else {
                ApiResponse.error(res, 401, 'INVALID_LOGIN', 'Email or password is incorrect.');
            }
            return;
        }

        String token = CandidateAuth.startSession(candidate);
        update candidate;
        ApiResponse.ok(res, 200, sessionBody(candidate, token));
    }

    // ---------- logout ----------

    private static void logout(RestRequest req, RestResponse res) {
        Candidate__c me = CandidateAuth.currentCandidate(req);
        if (me != null) {
            me.Session_Token_Hash__c = null;
            me.Session_Expires__c = null;
            update me;
        }
        ApiResponse.ok(res, 200, new Map<String, Object>{ 'signedOut' => true });
    }

    // ---------- helpers ----------

    private static Map<String, Object> sessionBody(Candidate__c candidate, String token) {
        return new Map<String, Object>{
            'token' => token,
            'expiresAt' => candidate.Session_Expires__c.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\''),
            'candidate' => CandidateAuth.publicView(candidate)
        };
    }

    private static String lockedMessage() {
        return 'Too many wrong passwords. Try again in ' + CandidateAuth.LOCK_MINUTES + ' minutes.';
    }

    private static Map<String, Object> readBody(RestRequest req) {
        try {
            return (Map<String, Object>) JSON.deserializeUntyped(req.requestBody.toString());
        } catch (Exception e) {
            return null;
        }
    }

    /** Trimmed text; missing values become ''. */
    private static String text(Map<String, Object> source, String key) {
        Object value = source.get(key);
        return value == null ? '' : String.valueOf(value).trim();
    }

    /** Text exactly as sent (passwords may start or end with spaces). */
    private static String rawText(Map<String, Object> source, String key) {
        Object value = source.get(key);
        return value == null ? '' : String.valueOf(value);
    }
}
