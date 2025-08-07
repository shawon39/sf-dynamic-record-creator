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
    
    @AuraEnabled(cacheable=true)
    public static List<ObjectOption> getAllSalesforceObjects() {
        List<ObjectOption> objectOptions = new List<ObjectOption>();
        
        try {
            Console.log('ObjectService.getAllSalesforceObjects: Starting to retrieve objects');
            Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
            Console.log('ObjectService.getAllSalesforceObjects: Found ' + globalDescribe.size() + ' total objects');
            
            for (String objectName : globalDescribe.keySet()) {
                Schema.DescribeSObjectResult objectDescribe = globalDescribe.get(objectName).getDescribe();
                
                // Only include objects that are accessible, createable, and not deprecated
                if (objectDescribe.isAccessible() && 
                    objectDescribe.isCreateable() && 
                    !objectDescribe.isDeprecatedAndHidden()) {
                    
                    objectOptions.add(new ObjectOption(objectDescribe.getLabel(), objectDescribe.getName()));
                }
            }
            
            Console.log('ObjectService.getAllSalesforceObjects: Returning ' + objectOptions.size() + ' accessible objects');
            
        } catch (Exception e) {
            Console.log('Error in ObjectService.getAllSalesforceObjects: ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to retrieve Salesforce objects: ' + e.getMessage());
        }
        
        return objectOptions;
    }
    
    @AuraEnabled(cacheable=true)
    public static List<RecordTypeOption> getObjectRecordTypes(String objectName) {
        List<RecordTypeOption> recordTypeOptions = new List<RecordTypeOption>();
        
        try {
            Console.log('ObjectService.getObjectRecordTypes: Starting for object ' + objectName);
            
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
                if (recordType.isAvailable() && recordType.isActive()) {
                    recordTypeOptions.add(new RecordTypeOption(
                        recordType.getName(),
                        recordType.getRecordTypeId(),
                        '', // Description not available from RecordTypeInfo
                        recordType.isDefaultRecordTypeMapping()
                    ));
                }
            }
            
            // Sort with default record type first
            recordTypeOptions.sort(new RecordTypeComparator());
            
            Console.log('ObjectService.getObjectRecordTypes: Found ' + recordTypeOptions.size() + ' record types');
            
        } catch (Exception e) {
            Console.log('Error in ObjectService.getObjectRecordTypes: ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to retrieve record types: ' + e.getMessage());
        }
        
        return recordTypeOptions;
    }
    
    @AuraEnabled(cacheable=true)
    public static List<ObjectOption> getAllCreateableObjects() {
        List<ObjectOption> opts = new List<ObjectOption>();
        Set<String> uniqueObjects = new Set<String>();
        
        try {
            Console.log('ObjectService.getAllCreateableObjects: Querying Dynamic_Field_Analysis__c records');
            
            // Check if user has access to Dynamic_Field_Analysis__c
            if (!Schema.sObjectType.Dynamic_Field_Analysis__c.isAccessible()) {
                throw new AuraHandledException('No access to Dynamic Field Analysis records');
            }
            
            // Query all unique objects from Dynamic_Field_Analysis__c
            List<Dynamic_Field_Analysis__c> analysisRecords = [
                SELECT Object_Name__c 
                FROM Dynamic_Field_Analysis__c 
                WHERE Object_Name__c != null 
                ORDER BY Object_Name__c
            ];
            
            Console.log('ObjectService.getAllCreateableObjects: Found ' + analysisRecords.size() + ' analysis records');
            
            Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
            
            for (Dynamic_Field_Analysis__c record : analysisRecords) {
                String objectName = record.Object_Name__c;
                
                if (!uniqueObjects.contains(objectName)) {
                    // Check if object still exists and is createable
                    Schema.SObjectType objectType = globalDescribe.get(objectName);
                    if (objectType != null) {
                        Schema.DescribeSObjectResult dr = objectType.getDescribe();
                        if (dr.isCreateable() && dr.isAccessible()) {
                            opts.add(new ObjectOption(dr.getLabel(), dr.getName()));
                            uniqueObjects.add(objectName);
                            Console.log('ObjectService.getAllCreateableObjects: Added object: ' + objectName);
                        }
                    }
                }
            }
            
            Console.log('ObjectService.getAllCreateableObjects: Returning ' + opts.size() + ' unique objects');
            
        } catch (Exception e) {
            Console.log('Error in ObjectService.getAllCreateableObjects: ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to retrieve objects: ' + e.getMessage());
        }
        
        return opts;
    }
    
    // Comparator to sort record types with default first
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
}