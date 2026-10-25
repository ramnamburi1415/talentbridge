/**
 * JobsResource: the public job endpoints the TalentBridge front end reads.
 *
 *   GET /services/apexrest/jobs         -> all Open jobs, newest first
 *   GET /services/apexrest/jobs/{Id}    -> one job of any status (the portal shows
 *                                          "no longer accepting" for Closed), or 404
 *
 * Why "without sharing": anonymous visitors call this through a Salesforce Site as
 * the Site guest user, who can't be given access to records the normal way. The
 * class therefore reads in system mode. That is safe here because the queries only
 * return job fields that are meant to be public.
 */
@RestResource(urlMapping='/jobs/*')
global without sharing class JobsResource {

    @HttpGet
    global static void getJobs() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;

        String jobId = ApiResponse.lastPathSegment(req.requestURI, '/jobs');

        // GET /jobs : the job board.
        if (String.isBlank(jobId)) {
            List<Job_Requirement__c> openJobs = [
                SELECT Id, Name, Employment_Type__c, Work_Location__c, City__c, State__c,
                       Duration__c, Experience_Years__c, Skills__c, Description__c,
                       Responsibilities__c, Status__c, Posted_Date__c
                FROM Job_Requirement__c
                WHERE Status__c = 'Open'
                ORDER BY Posted_Date__c DESC NULLS LAST
                LIMIT 200
            ];
            ApiResponse.ok(res, 200, openJobs);
            return;
        }

        // GET /jobs/{Id} : one job.
        if (!ApiResponse.isIdOf(jobId, Job_Requirement__c.SObjectType)) {
            ApiResponse.error(res, 404, 'NOT_FOUND', 'That job no longer exists.');
            return;
        }

        Id recordId = Id.valueOf(jobId);
        List<Job_Requirement__c> matches = [
            SELECT Id, Name, Employment_Type__c, Work_Location__c, City__c, State__c,
                   Duration__c, Experience_Years__c, Skills__c, Description__c,
                   Responsibilities__c, Status__c, Posted_Date__c
            FROM Job_Requirement__c
            WHERE Id = :recordId
            LIMIT 1
        ];

        if (matches.isEmpty()) {
            ApiResponse.error(res, 404, 'NOT_FOUND', 'That job no longer exists.');
        } else {
            ApiResponse.ok(res, 200, matches[0]);
        }
    }
}
