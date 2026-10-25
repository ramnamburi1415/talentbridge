/**
 * Tests for ApplicationsResource: one test per rule in the API contract.
 */
@IsTest
private class ApplicationsResourceTest {

    @TestSetup
    static void makeData() {
        insert new List<Job_Requirement__c>{
            new Job_Requirement__c(Name = 'Open role', Status__c = 'Open', Posted_Date__c = Date.today()),
            new Job_Requirement__c(Name = 'Closed role', Status__c = 'Closed', Posted_Date__c = Date.today())
        };
    }

    private static Id jobNamed(String name) {
        return [SELECT Id FROM Job_Requirement__c WHERE Name = :name LIMIT 1].Id;
    }

    /** Creates a candidate with a live session and returns the token. */
    private static String signIn(String email) {
        Candidate__c candidate = new Candidate__c(
            Name = 'Test Candidate',
            Email__c = email,
            Password_Hash__c = CandidateAuth.hashNewPassword('Secret123')
        );
        String token = CandidateAuth.startSession(candidate);
        insert candidate;
        return token;
    }

    private static String signIn() {
        return signIn('candidate@example.com');
    }

    /** A valid application for the given job. Tests change one value to break one rule. */
    private static Map<String, Object> validApplication(Id jobId) {
        return new Map<String, Object>{
            'Job__c' => jobId,
            'Full_Name__c' => 'Test Candidate',
            'Phone__c' => '(214) 555-0182',
            'Work_Authorization__c' => 'H-1B',
            'Resume_URL__c' => 'https://example.com/resume.pdf'
        };
    }

    private static RestRequest request(String method, String token) {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/applications';
        req.httpMethod = method;
        if (token != null) {
            req.addHeader('x-tb-token', token);
        }
        RestContext.request = req;
        RestContext.response = new RestResponse();
        return req;
    }

    /** Sends a raw body to the endpoint. */
    private static RestResponse post(String rawBody, String token) {
        RestRequest req = request('POST', token);
        if (rawBody != null) {
            req.requestBody = Blob.valueOf(rawBody);
        }
        ApplicationsResource.create();
        return RestContext.response;
    }

    /** Sends { "application": ... } the way the front end does. */
    private static RestResponse postApplication(Map<String, Object> application, String token) {
        return post(JSON.serialize(new Map<String, Object>{ 'application' => application }), token);
    }

    private static RestResponse listMine(String token) {
        request('GET', token);
        ApplicationsResource.listMine();
        return RestContext.response;
    }

    private static String errorCode(RestResponse res) {
        List<Object> errors = (List<Object>) JSON.deserializeUntyped(res.responseBody.toString());
        return (String) ((Map<String, Object>) errors[0]).get('errorCode');
    }

    @IsTest
    static void createsApplicationForSignedInCandidate() {
        String token = signIn();
        RestResponse res = postApplication(validApplication(jobNamed('Open role')), token);

        System.assertEquals(201, res.statusCode);
        Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(res.responseBody.toString());
        System.assertEquals('Submitted', body.get('status'));

        Job_Application__c saved = [
            SELECT Full_Name__c, Email__c, Status__c, Job__r.Name, Candidate__r.Email__c FROM Job_Application__c
        ];
        System.assertEquals('Test Candidate', saved.Full_Name__c);
        System.assertEquals('Open role', saved.Job__r.Name);
        System.assertEquals('candidate@example.com', saved.Candidate__r.Email__c);
    }

    @IsTest
    static void rejectsApplicationWithoutSignIn() {
        RestResponse res = postApplication(validApplication(jobNamed('Open role')), null);
        System.assertEquals(401, res.statusCode);
        System.assertEquals('INVALID_SESSION', errorCode(res));
    }

    @IsTest
    static void rejectsUnknownToken() {
        signIn();
        RestResponse res = postApplication(validApplication(jobNamed('Open role')),
            '0000000000000000000000000000000000000000000000000000000000000000');
        System.assertEquals(401, res.statusCode);
    }

    @IsTest
    static void rejectsExpiredToken() {
        String token = signIn();
        Candidate__c candidate = [SELECT Id FROM Candidate__c];
        candidate.Session_Expires__c = System.now().addMinutes(-1);
        update candidate;

        System.assertEquals(401, postApplication(validApplication(jobNamed('Open role')), token).statusCode);
    }

    @IsTest
    static void usesAccountEmailNotTheBody() {
        String token = signIn();
        Map<String, Object> application = validApplication(jobNamed('Open role'));
        application.put('Email__c', 'someone-else@example.com');

        System.assertEquals(201, postApplication(application, token).statusCode);
        System.assertEquals('candidate@example.com', [SELECT Email__c FROM Job_Application__c].Email__c);
    }

    @IsTest
    static void fallsBackToAccountName() {
        String token = signIn();
        Map<String, Object> application = validApplication(jobNamed('Open role'));
        application.remove('Full_Name__c');

        System.assertEquals(201, postApplication(application, token).statusCode);
        System.assertEquals('Test Candidate', [SELECT Full_Name__c FROM Job_Application__c].Full_Name__c);
    }

    @IsTest
    static void phoneIsOptional() {
        Map<String, Object> application = validApplication(jobNamed('Open role'));
        application.remove('Phone__c');
        System.assertEquals(201, postApplication(application, signIn()).statusCode);
    }

    @IsTest
    static void ignoresFieldsTheVisitorShouldNotSet() {
        Map<String, Object> application = validApplication(jobNamed('Open role'));
        application.put('Status__c', 'Hired');

        System.assertEquals(201, postApplication(application, signIn()).statusCode);
        System.assertEquals('Submitted', [SELECT Status__c FROM Job_Application__c].Status__c);
    }

    @IsTest
    static void rejectsSecondApplicationToSameJob() {
        String token = signIn();
        Id jobId = jobNamed('Open role');
        postApplication(validApplication(jobId), token);

        RestResponse res = postApplication(validApplication(jobId), token);
        System.assertEquals(409, res.statusCode);
        System.assertEquals('DUPLICATE_VALUE', errorCode(res));
    }

    @IsTest
    static void rejectsDuplicateOfOlderApplicationWithSameEmail() {
        Id jobId = jobNamed('Open role');
        insert new Job_Application__c(Job__c = jobId, Full_Name__c = 'Before accounts',
            Email__c = 'CANDIDATE@example.com', Status__c = 'Submitted');

        RestResponse res = postApplication(validApplication(jobId), signIn());
        System.assertEquals(409, res.statusCode);
    }

    @IsTest
    static void rejectsClosedJob() {
        RestResponse res = postApplication(validApplication(jobNamed('Closed role')), signIn());
        System.assertEquals(400, res.statusCode);
        System.assertEquals('JOB_CLOSED', errorCode(res));
    }

    @IsTest
    static void rejectsUnknownJob() {
        Id gone = jobNamed('Open role');
        delete [SELECT Id FROM Job_Requirement__c WHERE Id = :gone];

        RestResponse res = postApplication(validApplication(gone), signIn());
        System.assertEquals(404, res.statusCode);
    }

    @IsTest
    static void rejectsJobIdThatIsNotAnId() {
        Map<String, Object> application = validApplication(jobNamed('Open role'));
        application.put('Job__c', 'nope');
        System.assertEquals(404, postApplication(application, signIn()).statusCode);
    }

    @IsTest
    static void rejectsMissingResumeLink() {
        Map<String, Object> application = validApplication(jobNamed('Open role'));
        application.put('Resume_URL__c', '   ');
        RestResponse res = postApplication(application, signIn());
        System.assertEquals(400, res.statusCode);
        System.assertEquals('REQUIRED_FIELD_MISSING', errorCode(res));
    }

    @IsTest
    static void rejectsUnknownWorkAuthorization() {
        Map<String, Object> application = validApplication(jobNamed('Open role'));
        application.put('Work_Authorization__c', 'Martian');
        System.assertEquals('INVALID_WORK_AUTHORIZATION', errorCode(postApplication(application, signIn())));
    }

    @IsTest
    static void rejectsResumeLinkWithoutScheme() {
        Map<String, Object> application = validApplication(jobNamed('Open role'));
        application.put('Resume_URL__c', 'my resume');
        System.assertEquals('INVALID_URL', errorCode(postApplication(application, signIn())));
    }

    @IsTest
    static void rejectsBodyThatIsNotJson() {
        RestResponse res = post('this is not json', signIn());
        System.assertEquals(400, res.statusCode);
        System.assertEquals('INVALID_JSON', errorCode(res));
    }

    @IsTest
    static void rejectsEmptyBody() {
        System.assertEquals(400, post(null, signIn()).statusCode);
    }

    @IsTest
    static void rejectsJsonWithoutApplicationKey() {
        System.assertEquals('INVALID_JSON', errorCode(post('{"something": 1}', signIn())));
    }

    @IsTest
    static void listsOnlyMyApplications() {
        Id jobId = jobNamed('Open role');
        postApplication(validApplication(jobId), signIn('other@example.com'));
        String token = signIn();
        postApplication(validApplication(jobId), token);

        RestResponse res = listMine(token);
        System.assertEquals(200, res.statusCode);
        List<Object> rows = (List<Object>) JSON.deserializeUntyped(res.responseBody.toString());
        System.assertEquals(1, rows.size());
        Map<String, Object> row = (Map<String, Object>) rows[0];
        System.assertEquals('Submitted', row.get('status'));
        System.assertEquals('Open role', ((Map<String, Object>) row.get('job')).get('title'));
    }

    @IsTest
    static void listNeedsSignIn() {
        RestResponse res = listMine(null);
        System.assertEquals(401, res.statusCode);
    }
}
