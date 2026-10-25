/**
 * ApiResponse: small helpers shared by the TalentBridge REST classes.
 *
 * Every response is JSON. Errors use Salesforce's own error format,
 *   [ { "errorCode": "NOT_FOUND", "message": "..." } ]
 * which is what the front end's ApiError service already understands.
 */
public inherited sharing class ApiResponse {

    /** Writes a success response: status code plus the body as JSON. */
    public static void ok(RestResponse res, Integer statusCode, Object body) {
        res.statusCode = statusCode;
        res.addHeader('Content-Type', 'application/json');
        res.responseBody = Blob.valueOf(JSON.serialize(body));
    }

    /** Writes an error response in Salesforce's error format. */
    public static void error(RestResponse res, Integer statusCode, String errorCode, String message) {
        res.statusCode = statusCode;
        res.addHeader('Content-Type', 'application/json');
        res.responseBody = Blob.valueOf(JSON.serialize(new List<Object>{
            new Map<String, Object>{ 'errorCode' => errorCode, 'message' => message }
        }));
    }

    /**
     * Returns what comes after the resource name in the URL, or '' if nothing.
     *   lastPathSegment('/jobs/a0B5g00000JbA1EAAV', '/jobs')  -> 'a0B5g00000JbA1EAAV'
     *   lastPathSegment('/jobs', '/jobs')                     -> ''
     */
    public static String lastPathSegment(String uri, String resource) {
        if (String.isBlank(uri) || !uri.contains(resource)) {
            return '';
        }
        String tail = uri.substringAfterLast(resource).substringBefore('?');
        return tail.removeStart('/').removeEnd('/');
    }

    /** True if the text is a valid record Id of the expected object type. */
    public static Boolean isIdOf(String value, Schema.SObjectType expected) {
        if (String.isBlank(value)) {
            return false;
        }
        try {
            Id parsed = Id.valueOf(value);
            return parsed.getSObjectType() == expected;
        } catch (Exception e) {
            return false;
        }
    }
}
