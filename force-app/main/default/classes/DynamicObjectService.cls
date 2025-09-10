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
        @AuraEnabled public String formName;
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
        
        try {
            Console.log('getAllCreateableObjects: Querying form configurations from Dynamic_Field_Analysis__c records');
            
            // Check if user has access to Dynamic_Field_Analysis__c
            if (!Schema.sObjectType.Dynamic_Field_Analysis__c.isAccessible()) {
                throw new AuraHandledException('No access to Dynamic Field Analysis records');
            }
            
            // Query all form configurations from Dynamic_Field_Analysis__c
            List<Dynamic_Field_Analysis__c> analysisRecords = [
                SELECT Id, Name, Object_Name__c, Record_Type_Name__c, Analysis_Date__c
                FROM Dynamic_Field_Analysis__c 
                WHERE Name != null AND Object_Name__c != null
                ORDER BY Analysis_Date__c DESC
            ];
            
            Console.log('getAllCreateableObjects: Found ' + analysisRecords.size() + ' form configurations');
            
            Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
            
            for (Dynamic_Field_Analysis__c record : analysisRecords) {
                String objectName = record.Object_Name__c;
                
                // Check if object still exists and is createable
                Schema.SObjectType objectType = globalDescribe.get(objectName);
                if (objectType != null) {
                    Schema.DescribeSObjectResult dr = objectType.getDescribe();
                    if (dr.isCreateable() && dr.isAccessible()) {
                        String displayLabel = record.Name + ' (' + dr.getLabel();
                        if (String.isNotBlank(record.Record_Type_Name__c) && !record.Record_Type_Name__c.equals('Master')) {
                            displayLabel += ' - ' + record.Record_Type_Name__c;
                        }
                        displayLabel += ')';
                        
                        opts.add(new ObjectOption(displayLabel, record.Id));
                        Console.log('getAllCreateableObjects: Added form configuration: ' + record.Name + ' for object: ' + objectName);
                    }
                }
            }
            
            Console.log('getAllCreateableObjects: Returning ' + opts.size() + ' form configurations');
            
        } catch (Exception e) {
            Console.log('Error in getAllCreateableObjects: ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to retrieve form configurations: ' + e.getMessage());
        }
        
        return opts;
    }

    @AuraEnabled(cacheable=true)
    public static ObjectFieldsData getObjectFieldsData(String analysisId) {
        try {
            Console.log('getObjectFieldsData: Getting fields for analysis ID: ' + analysisId);
            
            if (String.isBlank(analysisId)) {
                throw new IllegalArgumentException('Analysis ID cannot be blank');
            }
            
            // Check if user has access to Dynamic_Field_Analysis__c
            if (!Schema.sObjectType.Dynamic_Field_Analysis__c.isAccessible()) {
                throw new AuraHandledException('No access to Dynamic Field Analysis records');
            }
            
            // Get the specific analysis record with its related instructions
            List<Dynamic_Field_Analysis__c> analysisRecords = [
                SELECT Id, Name, Object_Name__c, Record_Type_Id__c, Record_Type_Name__c, 
                       Selected_Fields__c, Total_Fields_Count__c,
                       (SELECT Id, Step_Number__c, Name, Related_Fields__c, Is_Active__c
                        FROM Dynamic_Field_Instructions__r 
                        WHERE Is_Active__c = true 
                        ORDER BY Step_Number__c ASC)
                FROM Dynamic_Field_Analysis__c 
                WHERE Id = :analysisId 
                LIMIT 1
            ];
            
            if (analysisRecords.isEmpty()) {
                throw new AuraHandledException('No field analysis found for analysis ID: ' + analysisId);
            }
            
            Dynamic_Field_Analysis__c analysisRecord = analysisRecords[0];
            Console.log('getObjectFieldsData: Found analysis record for object: ' + analysisRecord.Object_Name__c);
            Console.log('getObjectFieldsData: Found ' + analysisRecord.Dynamic_Field_Instructions__r.size() + ' related instructions');
            
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
            result.formName = analysisRecord.Name;
            result.setRecordTypeInfo(analysisRecord.Record_Type_Id__c, analysisRecord.Record_Type_Name__c);
            
            // Convert related instructions to InstructionStep objects
            List<InstructionStep> instructions = new List<InstructionStep>();
            for (Dynamic_Field_Instructions__c instructionRecord : analysisRecord.Dynamic_Field_Instructions__r) {
                List<String> stepFields = new List<String>();
                
                // Parse related fields
                if (String.isNotBlank(instructionRecord.Related_Fields__c)) {
                    String[] fieldArray = instructionRecord.Related_Fields__c.split(',');
                    for (String field : fieldArray) {
                        String fieldName = field.trim();
                        if (String.isNotBlank(fieldName)) {
                            stepFields.add(fieldName);
                        }
                    }
                }
                
                instructions.add(new InstructionStep(
                    instructionRecord.Step_Number__c != null ? instructionRecord.Step_Number__c.intValue() : 0,
                    instructionRecord.Name != null ? instructionRecord.Name : '',
                    stepFields
                ));
                
                Console.log('getObjectFieldsData: Added instruction step ' + instructionRecord.Step_Number__c + ': ' + instructionRecord.Name);
            }
            
            result.setInstructions(instructions);
            Console.log('getObjectFieldsData: Returning data with ' + instructions.size() + ' instructions');
            
            return result;
            
        } catch (Exception e) {
            Console.log('Error in getObjectFieldsData: ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to retrieve fields for analysis ID ' + analysisId + ': ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<InstructionStep> getObjectInstructions(String analysisId) {
        try {
            // Get instructions using the InstructionManagerService
            InstructionManagerService.InstructionData instructionData = InstructionManagerService.getInstructionsForAnalysis(analysisId);
            
            List<InstructionStep> result = new List<InstructionStep>();
            for (InstructionManagerService.InstructionStep step : instructionData.instructions) {
                result.add(new InstructionStep(
                    step.stepNumber,
                    step.text,
                    step.fields
                ));
            }
            
            return result;
            
        } catch (Exception e) {
            Console.log('Error in getObjectInstructions: ' + e.getMessage());
            throw new AuraHandledException('Failed to retrieve instructions: ' + e.getMessage());
        }
    }

    public class ContactData {
        @AuraEnabled public String contactId;
        @AuraEnabled public String accountId;
        @AuraEnabled public String contactName;
        @AuraEnabled public String accountName;
        
        public ContactData(String contactId, String accountId, String contactName, String accountName) {
            this.contactId = contactId;
            this.accountId = accountId;
            this.contactName = contactName;
            this.accountName = accountName;
        }
    }

    @AuraEnabled(cacheable=true)
    public static ContactData getContactAndAccountData(String contactId) {
        try {
            Console.log('getContactAndAccountData: Getting contact and account data for contact ID: ' + contactId);
            
            if (String.isBlank(contactId)) {
                throw new IllegalArgumentException('Contact ID cannot be blank');
            }
            
            // Check if user has access to Contact object
            if (!Schema.sObjectType.Contact.isAccessible()) {
                throw new AuraHandledException('No access to Contact records');
            }
            
            // Query contact and related account data
            List<Contact> contacts = [
                SELECT Id, Name, AccountId, Account.Name
                FROM Contact 
                WHERE Id = :contactId 
                LIMIT 1
            ];
            
            if (contacts.isEmpty()) {
                throw new AuraHandledException('Contact not found for ID: ' + contactId);
            }
            
            Contact contact = contacts[0];
            Console.log('getContactAndAccountData: Found contact: ' + contact.Name);
            
            String accountId = contact.AccountId;
            String accountName = contact.Account?.Name;
            
            if (String.isNotBlank(accountId)) {
                Console.log('getContactAndAccountData: Found related account: ' + accountName);
            } else {
                Console.log('getContactAndAccountData: Contact has no related account');
            }
            
            return new ContactData(contact.Id, accountId, contact.Name, accountName);
            
        } catch (Exception e) {
            Console.log('Error in getContactAndAccountData: ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to retrieve contact and account data: ' + e.getMessage());
        }
    }
} 