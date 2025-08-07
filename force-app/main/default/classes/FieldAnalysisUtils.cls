public with sharing class FieldAnalysisUtils {
    
    public static List<String> parseCommaSeparatedFields(String fieldString) {
        List<String> fields = new List<String>();
        
        if (String.isNotBlank(fieldString)) {
            String[] fieldArray = fieldString.split(',');
            for (String field : fieldArray) {
                String fieldName = field.trim();
                if (String.isNotBlank(fieldName)) {
                    fields.add(fieldName);
                }
            }
        }
        
        return fields;
    }
    
    public static String joinFields(List<String> fields) {
        if (fields == null || fields.isEmpty()) {
            return '';
        }
        
        List<String> cleanFields = new List<String>();
        for (String field : fields) {
            if (String.isNotBlank(field)) {
                cleanFields.add(field.trim());
            }
        }
        
        return String.join(cleanFields, ', ');
    }
    
    public static Boolean isSystemField(String fieldName) {
        Set<String> systemFields = new Set<String>{
            'Id', 'CreatedDate', 'CreatedById', 'LastModifiedDate', 'LastModifiedById',
            'SystemModstamp', 'LastActivityDate', 'LastViewedDate', 'LastReferencedDate'
        };
        return systemFields.contains(fieldName);
    }
    
    public static String formatDateTime(DateTime dt) {
        if (dt == null) {
            return '';
        }
        return dt.format('yyyy-MM-dd HH:mm:ss');
    }
    
    public static void validateObjectAccess(String objectName) {
        if (String.isBlank(objectName)) {
            throw new IllegalArgumentException('Object name cannot be blank');
        }
        
        Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectName);
        if (objectType == null) {
            throw new IllegalArgumentException('Invalid object name: ' + objectName);
        }
        
        Schema.DescribeSObjectResult objectDescribe = objectType.getDescribe();
        if (!objectDescribe.isAccessible()) {
            throw new AuraHandledException('No access to object: ' + objectName);
        }
    }
    
    public static void validateFieldAccess(String objectName, List<String> fieldNames) {
        validateObjectAccess(objectName);
        
        if (fieldNames == null || fieldNames.isEmpty()) {
            return;
        }
        
        Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectName);
        Schema.DescribeSObjectResult objectDescribe = objectType.getDescribe();
        Map<String, Schema.SObjectField> fieldMap = objectDescribe.fields.getMap();
        
        for (String fieldName : fieldNames) {
            Schema.SObjectField field = fieldMap.get(fieldName);
            if (field == null) {
                throw new IllegalArgumentException('Invalid field name: ' + fieldName + ' for object: ' + objectName);
            }
            
            Schema.DescribeFieldResult fieldDescribe = field.getDescribe();
            if (!fieldDescribe.isAccessible()) {
                throw new AuraHandledException('No access to field: ' + fieldName + ' on object: ' + objectName);
            }
        }
    }
    
    public static String generateAnalysisId() {
        return 'ANALYSIS_' + DateTime.now().getTime();
    }
    
    public static Map<String, Object> createSuccessResponse(String message, Object data) {
        Map<String, Object> response = new Map<String, Object>();
        response.put('success', true);
        response.put('message', message);
        response.put('data', data);
        return response;
    }
    
    public static Map<String, Object> createErrorResponse(String message) {
        Map<String, Object> response = new Map<String, Object>();
        response.put('success', false);
        response.put('message', message);
        response.put('data', null);
        return response;
    }
}