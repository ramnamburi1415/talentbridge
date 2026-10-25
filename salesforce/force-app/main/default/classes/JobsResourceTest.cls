/**
 * Tests for JobsResource. Salesforce needs at least 75% of Apex covered by tests
 * before it lets you deploy, and good tests also prove the API contract.
 */
@IsTest
private class JobsResourceTest {

    @TestSetup
    static void makeData() {
        insert new List<Job_Requirement__c>{
            new Job_Requirement__c(Name = 'Older open job', Status__c = 'Open',
                Posted_Date__c = Date.newInstance(2026, 10, 1), Work_Location__c = 'Remote'),
            new Job_Requirement__c(Name = 'Newer open job', Status__c = 'Open',
                Posted_Date__c = Date.newInstance(2026, 10, 14), Work_Location__c = 'Onsite',
                City__c = 'Dallas', State__c = 'TX', Experience_Years__c = 4),
            new Job_Requirement__c(Name = 'Closed job', Status__c = 'Closed',
                Posted_Date__c = Date.newInstance(2026, 9, 1))
        };
    }

    /** Calls GET with the given path and returns the response. */
    private static RestResponse get(String path) {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest' + path;
        req.httpMethod = 'GET';
        RestContext.request = req;
        RestContext.response = new RestResponse();
        JobsResource.getJobs();
        return RestContext.response;
    }

    private static Id jobNamed(String name) {
        return [SELECT Id FROM Job_Requirement__c WHERE Name = :name LIMIT 1].Id;
    }

    private static String errorCode(RestResponse res) {
        List<Object> errors = (List<Object>) JSON.deserializeUntyped(res.responseBody.toString());
        return (String) ((Map<String, Object>) errors[0]).get('errorCode');
    }

    @IsTest
    static void listsOnlyOpenJobsNewestFirst() {
        RestResponse res = get('/jobs');

        System.assertEquals(200, res.statusCode);
        List<Object> jobs = (List<Object>) JSON.deserializeUntyped(res.responseBody.toString());
        System.assertEquals(2, jobs.size(), 'The closed job must not be listed');
        System.assertEquals('Newer open job', ((Map<String, Object>) jobs[0]).get('Name'));
        System.assertEquals('TX', ((Map<String, Object>) jobs[0]).get('State__c'));
    }

    @IsTest
    static void trailingSlashStillListsJobs() {
        RestResponse res = get('/jobs/');
        System.assertEquals(200, res.statusCode);
        System.assertEquals(2, ((List<Object>) JSON.deserializeUntyped(res.responseBody.toString())).size());
    }

    @IsTest
    static void returnsOneJobById() {
        RestResponse res = get('/jobs/' + jobNamed('Newer open job'));

        System.assertEquals(200, res.statusCode);
        Map<String, Object> job = (Map<String, Object>) JSON.deserializeUntyped(res.responseBody.toString());
        System.assertEquals('Newer open job', job.get('Name'));
        System.assertEquals('2026-10-14', job.get('Posted_Date__c'));
    }

    @IsTest
    static void returnsClosedJobSoThePortalCanSayItIsClosed() {
        RestResponse res = get('/jobs/' + jobNamed('Closed job'));

        System.assertEquals(200, res.statusCode);
        Map<String, Object> job = (Map<String, Object>) JSON.deserializeUntyped(res.responseBody.toString());
        System.assertEquals('Closed', job.get('Status__c'));
    }

    @IsTest
    static void deletedJobIs404() {
        Id gone = jobNamed('Older open job');
        delete [SELECT Id FROM Job_Requirement__c WHERE Id = :gone];

        RestResponse res = get('/jobs/' + gone);

        System.assertEquals(404, res.statusCode);
        System.assertEquals('NOT_FOUND', errorCode(res));
    }

    @IsTest
    static void textThatIsNotAnIdIs404() {
        RestResponse res = get('/jobs/not-a-real-id');
        System.assertEquals(404, res.statusCode);
    }

    @IsTest
    static void idOfAnotherObjectIs404() {
        Id userId = UserInfo.getUserId();
        RestResponse res = get('/jobs/' + userId);
        System.assertEquals(404, res.statusCode);
    }

    @IsTest
    static void lastPathSegmentHandlesEdgeCases() {
        System.assertEquals('', ApiResponse.lastPathSegment(null, '/jobs'));
        System.assertEquals('', ApiResponse.lastPathSegment('/other', '/jobs'));
        System.assertEquals('abc', ApiResponse.lastPathSegment('/jobs/abc/?x=1', '/jobs'));
        System.assertEquals(false, ApiResponse.isIdOf('', Job_Requirement__c.SObjectType));
    }
}
