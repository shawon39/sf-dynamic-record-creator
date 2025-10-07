public with sharing class ObjectService {
    
    public class ObjectOption {
        @AuraEnabled public String label;
        @AuraEnabled public String value;
        
        public ObjectOption(String label, String value) {
            this.label = label;
            this.value = value;
        }
    }
    
    public class RecordTypeOption {
        @AuraEnabled public String label;
        @AuraEnabled public String value;
        @AuraEnabled public String description;
        @AuraEnabled public Boolean isDefault;
        
        public RecordTypeOption(String label, String value, String description, Boolean isDefault) {
            this.label = label;
            this.value = value;
            this.description = description;
            this.isDefault = isDefault;
        }
    }
    
    // Returns all createable Salesforce objects available to the user
    @AuraEnabled(cacheable=true)
    public static List<ObjectOption> getAllSalesforceObjects() {
        List<ObjectOption> objectOptions = new List<ObjectOption>();
        
        try {
            Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
            
            for (String objectName : globalDescribe.keySet()) {
                Schema.DescribeSObjectResult objectDescribe = globalDescribe.get(objectName).getDescribe();
                
                // Only include accessible, createable, non-deprecated objects
                if (objectDescribe.isAccessible() && 
                    objectDescribe.isCreateable() && 
                    !objectDescribe.isDeprecatedAndHidden()) {
                    
                    objectOptions.add(new ObjectOption(objectDescribe.getLabel(), objectDescribe.getName()));
                }
            }
            
            // Sort alphabetically by label for better UX
            objectOptions.sort(new ObjectOptionComparator());
            
        } catch (Exception e) {
            throw new AuraHandledException('Failed to retrieve Salesforce objects: ' + e.getMessage());
        }
        
        return objectOptions;
    }
    
    // Returns all available record types for a specific object
    @AuraEnabled(cacheable=true)
    public static List<RecordTypeOption> getObjectRecordTypes(String objectName) {
        List<RecordTypeOption> recordTypeOptions = new List<RecordTypeOption>();
        
        try {
            if (String.isBlank(objectName)) {
                throw new IllegalArgumentException('Object name cannot be blank');
            }
            
            Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectName);
            if (objectType == null) {
                throw new IllegalArgumentException('Invalid object name: ' + objectName);
            }
            
            Schema.DescribeSObjectResult objectDescribe = objectType.getDescribe();
            List<Schema.RecordTypeInfo> recordTypes = objectDescribe.getRecordTypeInfos();
            
            for (Schema.RecordTypeInfo recordType : recordTypes) {
                // Only include available and active record types
                if (recordType.isAvailable() && recordType.isActive()) {
                    recordTypeOptions.add(new RecordTypeOption(
                        recordType.getName(),
                        recordType.getRecordTypeId(),
                        '',
                        recordType.isDefaultRecordTypeMapping()
                    ));
                }
            }
            
            // Sort with default record type first
            recordTypeOptions.sort(new RecordTypeComparator());
            
        } catch (Exception e) {
            throw new AuraHandledException('Failed to retrieve record types: ' + e.getMessage());
        }
        
        return recordTypeOptions;
    }
    
    // Comparator to sort record types with default record type appearing first
    public class RecordTypeComparator implements Comparator<RecordTypeOption> {
        public Integer compare(RecordTypeOption rt1, RecordTypeOption rt2) {
            if (rt1.isDefault && !rt2.isDefault) {
                return -1;
            }
            if (!rt1.isDefault && rt2.isDefault) {
                return 1;
            }
            return rt1.label.compareTo(rt2.label);
        }
    }

    // Comparator to sort object options alphabetically (case-insensitive)
    public class ObjectOptionComparator implements Comparator<ObjectOption> {
        public Integer compare(ObjectOption a, ObjectOption b) {
            if (a == null && b == null) return 0;
            if (a == null) return 1;
            if (b == null) return -1;
            String la = a.label != null ? a.label.toLowerCase() : '';
            String lb = b.label != null ? b.label.toLowerCase() : '';
            return la.compareTo(lb);
        }
    }
}