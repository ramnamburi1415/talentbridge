/**
 * ApplicationsResource: applications from signed-in TalentBridge candidates.
 *
 * Every call needs the X-TB-Token header from /auth/login or /auth/register.
 *
 *   POST /services/apexrest/applications
 *   Body: { "application": { "Job__c": "...", "Full_Name__c": "...", "Phone__c": "...",
 *                            "Work_Authorization__c": "H-1B", "Resume_URL__c": "https://..." } }
 *
 *   201 { "id": "a0C...", "status": "Submitted" }
 *   400 bad JSON, missing fields, unknown work authorization, bad link, job closed
 *   401 not signed in, or the sign-in expired
 *   404 job not found
 *   409 this candidate (or this email) already applied to this job
 *
 *   GET /services/apexrest/applications      -> the signed-in candidate's applications, newest first
 *   200 [ { id, applicationNumber, status, submittedAt, job: { id, title } } ]
 *
 * The email always comes from the signed-in account, never from the body, so nobody can
 * apply in someone else's name. The front end validates too, but a server must never
 * trust what a browser sends, so every rule is checked again here. Only known fields are
 * copied into the record: a visitor can't set Status__c by adding it to the JSON.
 *
 * "without sharing": see JobsResource. The guest user can only reach this class through
 * the Site, and it only reads and inserts the signed-in candidate's own applications.
 */
@RestResource(urlMapping='/applications/*')
global without sharing class ApplicationsResource {

    private static final Set<String> WORK_AUTHORIZATIONS = new Set<String>{
        'US citizen', 'Green card', 'H-1B', 'EAD', 'Other'
    };

    @HttpPost
    global static void create() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;

        // 1. Who is applying? No valid token, no application.
        Candidate__c me = CandidateAuth.currentCandidate(req);
        if (me == null) {
            ApiResponse.error(res, 401, 'INVALID_SESSION', 'Please sign in to apply.');
            return;
        }

        // 2. Read the body. A method with no parameters gets the raw body, so we
        //    parse it ourselves and control exactly which fields are used.
        Map<String, Object> application = readApplication(req);
        if (application == null) {
            ApiResponse.error(res, 400, 'INVALID_JSON',
                'Send the application as { "application": { ... } }.');
            return;
        }

        String jobId = text(application, 'Job__c');
        String fullName = text(application, 'Full_Name__c');
        String phone = text(application, 'Phone__c');
        String workAuthorization = text(application, 'Work_Authorization__c');
        String resumeUrl = text(application, 'Resume_URL__c');
        String email = me.Email__c;
        if (String.isBlank(fullName)) {
            fullName = me.Name;
        }

        // 3. The job must exist and be open.
        if (!ApiResponse.isIdOf(jobId, Job_Requirement__c.SObjectType)) {
            ApiResponse.error(res, 404, 'NOT_FOUND', 'That job no longer exists.');
            return;
        }
        Id recordId = Id.valueOf(jobId);
        List<Job_Requirement__c> jobs = [
            SELECT Id, Status__c FROM Job_Requirement__c WHERE Id = :recordId LIMIT 1
        ];
        if (jobs.isEmpty()) {
            ApiResponse.error(res, 404, 'NOT_FOUND', 'That job no longer exists.');
            return;
        }
        if (jobs[0].Status__c != 'Open') {
            ApiResponse.error(res, 400, 'JOB_CLOSED', 'This job is no longer accepting applications.');
            return;
        }

        // 4. Field rules (the same ones the form checks).
        if (String.isBlank(workAuthorization) || String.isBlank(resumeUrl)) {
            ApiResponse.error(res, 400, 'REQUIRED_FIELD_MISSING',
                'Work authorization and resume link are required.');
            return;
        }
        if (!WORK_AUTHORIZATIONS.contains(workAuthorization)) {
            ApiResponse.error(res, 400, 'INVALID_WORK_AUTHORIZATION', 'Choose a work authorization from the list.');
            return;
        }
        if (!resumeUrl.startsWithIgnoreCase('https://') && !resumeUrl.startsWithIgnoreCase('http://')) {
            ApiResponse.error(res, 400, 'INVALID_URL', 'Enter a full resume link starting with https://');
            return;
        }

        // 5. One application per candidate per job. Applications sent before accounts
        //    existed have no Candidate__c, so the email is checked too (SOQL ignores case).
        Integer existing = [
            SELECT COUNT() FROM Job_Application__c
            WHERE Job__c = :recordId AND (Candidate__c = :me.Id OR Email__c = :email)
        ];
        if (existing > 0) {
            ApiResponse.error(res, 409, 'DUPLICATE_VALUE',
                'You have already applied to this job with ' + email + '.');
            return;
        }

        // 6. Save it. Lengths are trimmed to the field sizes.
        Job_Application__c record = new Job_Application__c(
            Job__c = recordId,
            Candidate__c = me.Id,
            Full_Name__c = fullName.left(80),
            Email__c = email,
            Phone__c = String.isBlank(phone) ? null : phone.left(40),
            Work_Authorization__c = workAuthorization,
            Resume_URL__c = resumeUrl.left(255),
            Status__c = 'Submitted'
        );
        try {
            insert record;
        } catch (DmlException e) {
            ApiResponse.error(res, 400, 'INVALID_FIELD', e.getDmlMessage(0));
            return;
        }

        ApiResponse.ok(res, 201, new Map<String, Object>{
            'id' => record.Id,
            'status' => record.Status__c
        });
    }

    @HttpGet
    global static void listMine() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;

        Candidate__c me = CandidateAuth.currentCandidate(req);
        if (me == null) {
            ApiResponse.error(res, 401, 'INVALID_SESSION', 'Please sign in to see your applications.');
            return;
        }

        List<Map<String, Object>> rows = new List<Map<String, Object>>();
        for (Job_Application__c app : [
                SELECT Id, Name, Status__c, CreatedDate, Job__c, Job__r.Name
                FROM Job_Application__c
                WHERE Candidate__c = :me.Id
                ORDER BY CreatedDate DESC
                LIMIT 200]) {
            rows.add(new Map<String, Object>{
                'id' => app.Id,
                'applicationNumber' => app.Name,
                'status' => app.Status__c,
                'submittedAt' => app.CreatedDate.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\''),
                'job' => new Map<String, Object>{
                    'id' => app.Job__c,
                    'title' => app.Job__c == null ? 'Job no longer listed' : app.Job__r.Name
                }
            });
        }
        ApiResponse.ok(res, 200, rows);
    }

    /** Returns the "application" object from the body, or null if the body is not valid. */
    private static Map<String, Object> readApplication(RestRequest req) {
        try {
            Map<String, Object> body =
                (Map<String, Object>) JSON.deserializeUntyped(req.requestBody.toString());
            return (Map<String, Object>) body.get('application');
        } catch (Exception e) {
            return null;
        }
    }

    /** Reads one value as trimmed text; missing values become ''. */
    private static String text(Map<String, Object> source, String key) {
        Object value = source.get(key);
        return value == null ? '' : String.valueOf(value).trim();
    }
}
