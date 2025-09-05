Global with sharing class TestLWCConnection {
    global class RPLoginResponse {
         public String access_token {get;set;}
         public String expires_in {get;set;}
         public String token_type {get;set;}
         public String refresh_token {get;set;}
         public String tenantCode {get;set;}
         public Integer statusCode {get;set;}
         public String status {get;set;}	
	 }
    @AuraEnabled
    public static String beaconAccess() {
        
        String requestURL = '/api/v1/beacon';
        String requestString = '{"available": true}';
        
        String responseBody = RocketConnect.calloutLWC(requestURL, 'POST', requestString);

        return responseBody;
    }
    
    @AuraEnabled
    public static String updateActiveForm(String requestString) {
        
        String requestURL = '/api/v1/aiprocessor/update-active-form';
        
        String responseBody = RocketConnect.calloutLWC(requestURL, 'POST', requestString);

        return responseBody;
    }
    
    /*@AuraEnabled(cacheable=true)
    public static String beaconAccess() {
        
        String requestURL = '/api/v1/beacon';
        String requestString = '{"available": true}';
        
        String responseBody = RPCommonUtil.calloutLWC(requestURL, 'POST', requestString);

        return responseBody;
    }
    
    @AuraEnabled(cacheable=true)
    public static String tokenAPITelephony() {
        
        String requestURL = '/api/v1/telephony/token';
        
        String responseBody = RPCommonUtil.calloutLWC(requestURL, 'GET', null);

        return responseBody;
    }
    
    @AuraEnabled(cacheable=true)
    public static String openCTIToken() {
        
        RPGetLoggedInUserInfo.RPLoginResponse authResponse = new RPGetLoggedInUserInfo.RPLoginResponse();
        authResponse = RPConnector.authenticateNew();
        
        return authResponse.access_token;
    }
    
    @AuraEnabled(cacheable=true)
    public static String callForwardOptions() {
        String requestURL = '/api/v1/callcentre/call/forward/options';
        
        String responseBody = RPCommonUtil.calloutLWC(requestURL, 'GET', null);

        return responseBody;
    }
    
    @AuraEnabled(cacheable=true)
    public static String initiateCall(String requestString) {
        
        String requestURL = '/api/v1/callcentre/call';
        
        String responseBody = RPCommonUtil.calloutLWC(requestURL, 'POST', requestString);

        return responseBody;
    }
    
    @AuraEnabled(cacheable=true)
    public static String forwardCall(String requestString) {
        
        String requestURL = '/api/v1/callcentre/call/forward';
        
        String responseBody = RPCommonUtil.calloutLWC(requestURL, 'POST', requestString);

        return responseBody;
    }
    */
}