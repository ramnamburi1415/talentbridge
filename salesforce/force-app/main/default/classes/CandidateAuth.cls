/**
 * CandidateAuth: password hashing, sign-in tokens and "who is calling?" for TalentBridge.
 *
 * Passwords
 *   Never stored. We store  v1$<iterations>$<salt>$<hash>  where
 *     salt = 16 random bytes (hex), different for every candidate
 *     hash = HMAC-SHA256 applied <iterations> times, keyed with the password
 *   The random salt means two people with the same password get different hashes.
 *   The repeated HMAC ("key stretching") makes guessing passwords slow for an attacker.
 *   The version prefix lets us raise the iteration count later without breaking old accounts.
 *
 * Tokens
 *   On sign-in the browser gets a random 256-bit token. Salesforce keeps only its SHA-256,
 *   so a leaked database row can't be used to sign in. The token travels in the
 *   X-TB-Token header (not "Authorization", which Salesforce reserves for its own sessions).
 *
 * Note: a production portal would usually use Salesforce Experience Cloud users or an
 * identity provider (OAuth / OpenID Connect) instead of hand-rolled accounts.
 */
public without sharing class CandidateAuth {

    public static final Integer ITERATIONS = 1000;
    public static final Integer SESSION_HOURS = 8;
    public static final Integer MAX_FAILED_LOGINS = 5;
    public static final Integer LOCK_MINUTES = 15;
    public static final String TOKEN_HEADER = 'X-TB-Token';

    // ---------- passwords ----------

    /** Builds the stored value for a new password. */
    public static String hashNewPassword(String password) {
        String salt = EncodingUtil.convertToHex(Crypto.generateAesKey(128));
        return 'v1$' + ITERATIONS + '$' + salt + '$' + stretch(password, salt, ITERATIONS);
    }

    /** True if the password matches the stored value. */
    public static Boolean verifyPassword(String password, String stored) {
        if (String.isBlank(password) || String.isBlank(stored)) {
            return false;
        }
        List<String> parts = stored.split('\\$');
        if (parts.size() != 4 || parts[0] != 'v1') {
            return false;
        }
        Integer iterations = Integer.valueOf(parts[1]);
        return slowEquals(stretch(password, parts[2], iterations), parts[3]);
    }

    /**
     * Runs the same work as a real check against a throwaway hash. Used when the email
     * is unknown, so "no such account" takes as long as "wrong password".
     */
    public static void burnTime(String password) {
        stretch(String.isBlank(password) ? 'x' : password, '00000000000000000000000000000000', ITERATIONS);
    }

    private static String stretch(String password, String salt, Integer iterations) {
        Blob key = Blob.valueOf(password);
        Blob value = Crypto.generateMac('hmacSHA256', Blob.valueOf(salt), key);
        for (Integer i = 1; i < iterations; i++) {
            value = Crypto.generateMac('hmacSHA256', value, key);
        }
        return EncodingUtil.convertToHex(value);
    }

    /** Compares two strings without stopping at the first difference. */
    private static Boolean slowEquals(String a, String b) {
        if (a == null || b == null || a.length() != b.length()) {
            return false;
        }
        Integer diff = 0;
        for (Integer i = 0; i < a.length(); i++) {
            diff |= a.charAt(i) ^ b.charAt(i);
        }
        return diff == 0;
    }

    // ---------- tokens ----------

    /**
     * Creates a new sign-in token for the candidate (replacing any older one), and
     * returns the plain token. The caller saves the record.
     */
    public static String startSession(Candidate__c candidate) {
        String token = EncodingUtil.convertToHex(Crypto.generateAesKey(256));
        candidate.Session_Token_Hash__c = sha256(token);
        candidate.Session_Expires__c = System.now().addHours(SESSION_HOURS);
        candidate.Last_Login__c = System.now();
        candidate.Failed_Logins__c = 0;
        candidate.Locked_Until__c = null;
        return token;
    }

    /** The signed-in candidate for this request, or null if the token is missing, unknown or expired. */
    public static Candidate__c currentCandidate(RestRequest req) {
        String token = header(req, TOKEN_HEADER);
        if (String.isBlank(token) || token.length() != 64) {
            return null;
        }
        String tokenHash = sha256(token);
        List<Candidate__c> found = [
            SELECT Id, Name, Email__c, Session_Expires__c
            FROM Candidate__c
            WHERE Session_Token_Hash__c = :tokenHash
            LIMIT 1
        ];
        if (found.isEmpty() || found[0].Session_Expires__c == null ||
                found[0].Session_Expires__c < System.now()) {
            return null;
        }
        return found[0];
    }

    /** Reads a request header, ignoring upper/lower case (proxies often lowercase names). */
    public static String header(RestRequest req, String name) {
        if (req == null || req.headers == null) {
            return null;
        }
        for (String key : req.headers.keySet()) {
            if (key != null && key.equalsIgnoreCase(name)) {
                return req.headers.get(key);
            }
        }
        return null;
    }

    /** The public view of a candidate. Hashes never leave Salesforce. */
    public static Map<String, Object> publicView(Candidate__c candidate) {
        return new Map<String, Object>{
            'id' => candidate.Id,
            'fullName' => candidate.Name,
            'email' => candidate.Email__c
        };
    }

    public static String sha256(String value) {
        return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', Blob.valueOf(value)));
    }
}
