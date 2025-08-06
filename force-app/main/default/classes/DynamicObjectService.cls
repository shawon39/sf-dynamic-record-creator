public with sharing class DynamicObjectService {
    public class ObjectOption {
        @AuraEnabled public String label;
        @AuraEnabled public String value;
        public ObjectOption(String label, String value) {
            this.label = label;
            this.value = value;
        }
    }

    public class InstructionStep {
        @AuraEnabled public Integer id;
        @AuraEnabled public String text;
        @AuraEnabled public List<String> fields;
        
        public InstructionStep(Integer id, String text, List<String> fields) {
            this.id = id;
            this.text = text;
            this.fields = fields;
        }
    }

    public class ObjectFieldsData {
        @AuraEnabled public String objectName;
        @AuraEnabled public String recordTypeId;
        @AuraEnabled public String recordTypeName;
        @AuraEnabled public List<String> fields;
        @AuraEnabled public Integer totalFieldsCount;
        @AuraEnabled public List<InstructionStep> instructions;
        
        public ObjectFieldsData(String objectName, List<String> fields) {
            this.objectName = objectName;
            this.fields = fields;
            this.totalFieldsCount = fields != null ? fields.size() : 0;
            this.instructions = new List<InstructionStep>();
        }
        
        public void setRecordTypeInfo(String recordTypeId, String recordTypeName) {
            this.recordTypeId = recordTypeId;
            this.recordTypeName = recordTypeName;
        }
        
        public void setInstructions(List<InstructionStep> instructions) {
            this.instructions = instructions;
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<ObjectOption> getAllCreateableObjects() {
        List<ObjectOption> opts = new List<ObjectOption>();
        Set<String> uniqueObjects = new Set<String>();
        
        try {
            Console.log('getAllCreateableObjects: Querying Dynamic_Field_Analysis__c records');
            
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
            
            Console.log('getAllCreateableObjects: Found ' + analysisRecords.size() + ' analysis records');
            
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
                            Console.log('getAllCreateableObjects: Added object: ' + objectName);
                        }
                    }
                }
            }
            
            Console.log('getAllCreateableObjects: Returning ' + opts.size() + ' unique objects');
            
        } catch (Exception e) {
            Console.log('Error in getAllCreateableObjects: ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to retrieve objects: ' + e.getMessage());
        }
        
        return opts;
    }

    @AuraEnabled(cacheable=true)
    public static ObjectFieldsData getObjectFieldsData(String objectName) {
        try {
            Console.log('getObjectFieldsData: Getting fields for object: ' + objectName);
            
            if (String.isBlank(objectName)) {
                throw new IllegalArgumentException('Object name cannot be blank');
            }
            
            // Check if user has access to Dynamic_Field_Analysis__c
            if (!Schema.sObjectType.Dynamic_Field_Analysis__c.isAccessible()) {
                throw new AuraHandledException('No access to Dynamic Field Analysis records');
            }
            
            // Get the most recent analysis record for this object
            List<Dynamic_Field_Analysis__c> analysisRecords = [
                SELECT Object_Name__c, Record_Type_Id__c, Record_Type_Name__c, 
                       Selected_Fields__c, Total_Fields_Count__c
                FROM Dynamic_Field_Analysis__c 
                WHERE Object_Name__c = :objectName 
                ORDER BY Analysis_Date__c DESC 
                LIMIT 1
            ];
            
            if (analysisRecords.isEmpty()) {
                throw new AuraHandledException('No field analysis found for object: ' + objectName);
            }
            
            Dynamic_Field_Analysis__c analysisRecord = analysisRecords[0];
            Console.log('getObjectFieldsData: Found analysis record for: ' + objectName);
            
            // Parse selected fields from comma-separated string
            List<String> fields = new List<String>();
            if (String.isNotBlank(analysisRecord.Selected_Fields__c)) {
                String[] fieldArray = analysisRecord.Selected_Fields__c.split(',');
                for (String field : fieldArray) {
                    fields.add(field.trim());
                }
            }
            
            Console.log('getObjectFieldsData: Parsed ' + fields.size() + ' fields');
            
            ObjectFieldsData result = new ObjectFieldsData(analysisRecord.Object_Name__c, fields);
            result.setRecordTypeInfo(analysisRecord.Record_Type_Id__c, analysisRecord.Record_Type_Name__c);
            
            // Get custom instructions for this analysis record or object
            List<InstructionStep> instructions = getObjectInstructions(objectName, analysisRecord.Id);
            result.setInstructions(instructions);
            
            return result;
            
        } catch (Exception e) {
            Console.log('Error in getObjectFieldsData: ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to retrieve fields for ' + objectName + ': ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<InstructionStep> getObjectInstructions(String objectName, String analysisId) {
        // Use the InstructionManagerService method for consistency
        return InstructionManagerService.getInstructionsForObject(objectName, analysisId);
    }
} 