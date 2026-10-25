/**
 * Tests for AuthResource: register, login, lockout, me and logout.
 */
@IsTest
private class AuthResourceTest {

    private static RestResponse call(String method, String action, Object body, String token) {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/auth/' + action;
        req.httpMethod = method;
        if (body != null) {
            req.requestBody = Blob.valueOf(body instanceof String ? (String) body : JSON.serialize(body));
        }
        if (token != null) {
            req.addHeader('X-TB-Token', token);
        }
        RestContext.request = req;
        RestContext.response = new RestResponse();
        if (method == 'GET') {
            AuthResource.handleGet();
        } else {
            AuthResource.handlePost();
        }
        return RestContext.response;
    }

    private static RestResponse register(String fullName, String email, String password) {
        return call('POST', 'register', new Map<String, Object>{
            'fullName' => fullName, 'email' => email, 'password' => password
        }, null);
    }

    private static RestResponse login(String email, String password) {
        return call('POST', 'login', new Map<String, Object>{ 'email' => email, 'password' => password }, null);
    }

    private static Map<String, Object> json(RestResponse res) {
        return (Map<String, Object>) JSON.deserializeUntyped(res.responseBody.toString());
    }

    private static String errorCode(RestResponse res) {
        List<Object> errors = (List<Object>) JSON.deserializeUntyped(res.responseBody.toString());
        return (String) ((Map<String, Object>) errors[0]).get('errorCode');
    }

    private static String tokenOf(RestResponse res) {
        return (String) json(res).get('token');
    }

    @IsTest
    static void registersAndSignsIn() {
        RestResponse res = register('Ram Test', 'Ram@Example.com', 'Secret123');

        System.assertEquals(201, res.statusCode);
        Map<String, Object> body = json(res);
        String token = (String) body.get('token');
        System.assertEquals(64, token.length());
        Map<String, Object> candidate = (Map<String, Object>) body.get('candidate');
        System.assertEquals('ram@example.com', candidate.get('email'));
        System.assert(!res.responseBody.toString().contains('Hash'), 'Hashes must never be returned');

        Candidate__c saved = [SELECT Password_Hash__c, Session_Token_Hash__c FROM Candidate__c];
        System.assert(!saved.Password_Hash__c.contains('Secret123'));
        System.assertNotEquals(token, saved.Session_Token_Hash__c);

        RestResponse me = call('GET', 'me', null, token);
        System.assertEquals(200, me.statusCode);
    }

    @IsTest
    static void rejectsDuplicateEmailIgnoringCase() {
        register('Ram Test', 'ram@example.com', 'Secret123');
        RestResponse res = register('Ram Again', 'RAM@example.com', 'Secret456');
        System.assertEquals(409, res.statusCode);
        System.assertEquals('DUPLICATE_VALUE', errorCode(res));
    }

    @IsTest
    static void rejectsWeakPasswords() {
        System.assertEquals('WEAK_PASSWORD', errorCode(register('A', 'a@example.com', 'short1')));
        System.assertEquals('WEAK_PASSWORD', errorCode(register('A', 'a@example.com', 'onlyletters')));
        System.assertEquals('WEAK_PASSWORD', errorCode(register('A', 'a@example.com', '12345678')));
    }

    @IsTest
    static void rejectsBadRegistrationInput() {
        System.assertEquals('REQUIRED_FIELD_MISSING', errorCode(register(' ', 'a@example.com', 'Secret123')));
        System.assertEquals('INVALID_EMAIL_ADDRESS', errorCode(register('A', 'not-an-email', 'Secret123')));
        System.assertEquals('STRING_TOO_LONG', errorCode(register('A'.repeat(81), 'a@example.com', 'Secret123')));
        System.assertEquals('INVALID_JSON', errorCode(call('POST', 'register', 'not json', null)));
    }

    @IsTest
    static void logsInWithRightPassword() {
        register('Ram Test', 'ram@example.com', 'Secret123');
        RestResponse res = login('RAM@example.com', 'Secret123');

        System.assertEquals(200, res.statusCode);
        System.assertEquals(200, call('GET', 'me', null, tokenOf(res)).statusCode);
    }

    @IsTest
    static void newLoginReplacesOldToken() {
        String first = tokenOf(register('Ram Test', 'ram@example.com', 'Secret123'));
        String second = tokenOf(login('ram@example.com', 'Secret123'));

        System.assertEquals(401, call('GET', 'me', null, first).statusCode);
        System.assertEquals(200, call('GET', 'me', null, second).statusCode);
    }

    @IsTest
    static void rejectsWrongPasswordAndUnknownEmailTheSameWay() {
        register('Ram Test', 'ram@example.com', 'Secret123');

        RestResponse wrong = login('ram@example.com', 'Wrong1234');
        RestResponse unknown = login('nobody@example.com', 'Secret123');
        System.assertEquals(401, wrong.statusCode);
        System.assertEquals(401, unknown.statusCode);
        System.assertEquals(wrong.responseBody.toString(), unknown.responseBody.toString());
        System.assertEquals(1, [SELECT Failed_Logins__c FROM Candidate__c].Failed_Logins__c.intValue());
    }

    @IsTest
    static void locksAfterTooManyWrongPasswords() {
        register('Ram Test', 'ram@example.com', 'Secret123');
        for (Integer i = 1; i < CandidateAuth.MAX_FAILED_LOGINS; i++) {
            System.assertEquals(401, login('ram@example.com', 'Wrong1234').statusCode);
        }
        RestResponse locking = login('ram@example.com', 'Wrong1234');
        System.assertEquals(429, locking.statusCode);
        System.assertEquals('ACCOUNT_LOCKED', errorCode(locking));

        // Even the right password is refused while locked.
        System.assertEquals(429, login('ram@example.com', 'Secret123').statusCode);

        // After the lock ends, the right password works and the counters reset.
        Candidate__c candidate = [SELECT Id FROM Candidate__c];
        candidate.Locked_Until__c = System.now().addMinutes(-1);
        update candidate;
        System.assertEquals(200, login('ram@example.com', 'Secret123').statusCode);
        System.assertEquals(null, [SELECT Locked_Until__c FROM Candidate__c].Locked_Until__c);
    }

    @IsTest
    static void loginNeedsEmailAndPassword() {
        System.assertEquals('REQUIRED_FIELD_MISSING', errorCode(login('', 'Secret123')));
        System.assertEquals('INVALID_JSON', errorCode(call('POST', 'login', '[1,2]', null)));
    }

    @IsTest
    static void meNeedsAValidToken() {
        System.assertEquals(401, call('GET', 'me', null, null).statusCode);
        System.assertEquals(401, call('GET', 'me', null, 'short').statusCode);
    }

    @IsTest
    static void expiredTokenIsRejected() {
        String token = tokenOf(register('Ram Test', 'ram@example.com', 'Secret123'));
        Candidate__c candidate = [SELECT Id FROM Candidate__c];
        candidate.Session_Expires__c = System.now().addMinutes(-1);
        update candidate;

        System.assertEquals(401, call('GET', 'me', null, token).statusCode);
    }

    @IsTest
    static void logoutEndsTheSession() {
        String token = tokenOf(register('Ram Test', 'ram@example.com', 'Secret123'));

        System.assertEquals(200, call('POST', 'logout', null, token).statusCode);
        System.assertEquals(401, call('GET', 'me', null, token).statusCode);
        // Signing out again is harmless.
        System.assertEquals(200, call('POST', 'logout', null, token).statusCode);
    }

    @IsTest
    static void unknownActionsAre404() {
        System.assertEquals(404, call('POST', 'reset', '{}', null).statusCode);
        System.assertEquals(404, call('GET', 'everyone', null, null).statusCode);
    }

    @IsTest
    static void headerNamesIgnoreCase() {
        RestRequest req = new RestRequest();
        req.addHeader('x-tb-token', 'abc');
        System.assertEquals('abc', CandidateAuth.header(req, 'X-TB-Token'));
        System.assertEquals(null, CandidateAuth.header(req, 'Other'));
        System.assertEquals(null, CandidateAuth.header(null, 'X-TB-Token'));
    }

    @IsTest
    static void storedPasswordFormat() {
        String stored = CandidateAuth.hashNewPassword('Secret123');
        System.assert(stored.startsWith('v1$' + CandidateAuth.ITERATIONS + '$'));
        System.assert(CandidateAuth.verifyPassword('Secret123', stored));
        System.assert(!CandidateAuth.verifyPassword('secret123', stored));
        System.assert(!CandidateAuth.verifyPassword('Secret123', 'garbage'));
        System.assert(!CandidateAuth.verifyPassword('', stored));
        // Same password, different salt, different hash.
        System.assertNotEquals(stored, CandidateAuth.hashNewPassword('Secret123'));
    }
}
