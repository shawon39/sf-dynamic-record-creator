public with sharing class AnalysisService {
    
    @AuraEnabled
    public static String createCompleteAnalysis(String objectName, String recordTypeName, String recordTypeId,
                                              List<String> selectedFields, String analysisDetails,
                                              List<InstructionData> instructions) {
        Savepoint sp = Database.setSavepoint();
        
        try {
            Console.log('AnalysisService.createCompleteAnalysis: Starting transaction');
            Console.log('Object Name: ' + objectName);
            Console.log('Selected Fields: ' + selectedFields);
            Console.log('Instructions Count: ' + (instructions != null ? instructions.size() : 0));
            
            // Validate input parameters
            if (String.isBlank(objectName)) {
                throw new IllegalArgumentException('Object name cannot be blank');
            }
            
            if (selectedFields == null || selectedFields.isEmpty()) {
                throw new IllegalArgumentException('Selected fields cannot be empty');
            }
            
            // Check CRUD permissions
            
            if (!Schema.sObjectType.Dynamic_Field_Analysis__c.isCreateable()) {
                throw new AuraHandledException('No permission to create Dynamic Field Analysis records');
            }
            
            if (instructions != null && !instructions.isEmpty() && 
                !Schema.sObjectType.Dynamic_Field_Instructions__c.isCreateable()) {
                throw new AuraHandledException('No permission to create Dynamic Field Instructions records');
            }
            
            // Create parent record
            Dynamic_Field_Analysis__c analysisRecord = new Dynamic_Field_Analysis__c();
            analysisRecord.Object_Name__c = objectName;
            analysisRecord.Record_Type_Name__c = recordTypeName;
            analysisRecord.Record_Type_Id__c = recordTypeId;
            analysisRecord.Selected_Fields__c = String.join(selectedFields, ', ');
            analysisRecord.Field_Analysis_Details__c = analysisDetails != null ? analysisDetails : 'Analysis completed';
            analysisRecord.Analysis_Date__c = DateTime.now();
            analysisRecord.Total_Fields_Count__c = selectedFields.size();
            
            insert analysisRecord;
            Console.log('Parent record created with ID: ' + analysisRecord.Id);
            
            // Create child instruction records
            if (instructions != null && !instructions.isEmpty()) {
                List<Dynamic_Field_Instructions__c> instructionRecords = new List<Dynamic_Field_Instructions__c>();
                
                for (InstructionData instruction : instructions) {
                    // Validate instruction data
                    if (String.isBlank(instruction.text) || instruction.stepNumber == null) {
                        Console.log('Skipping invalid instruction: ' + JSON.serialize(instruction));
                        continue;
                    }
                    
                    Dynamic_Field_Instructions__c instructionRecord = new Dynamic_Field_Instructions__c();
                    instructionRecord.Field_Analysis__c = analysisRecord.Id;
                    instructionRecord.Step_Number__c = instruction.stepNumber;
                    instructionRecord.Instruction_Text__c = instruction.text.trim();
                    instructionRecord.Is_Active__c = true;
                    
                    // Set related fields
                    if (instruction.fields != null && !instruction.fields.isEmpty()) {
                        instructionRecord.Related_Fields__c = String.join(instruction.fields, ', ');
                    } else {
                        instructionRecord.Related_Fields__c = '';
                    }
                    
                    instructionRecords.add(instructionRecord);
                }
                
                if (!instructionRecords.isEmpty()) {
                    insert instructionRecords;
                    Console.log('Successfully created ' + instructionRecords.size() + ' instruction records');
                }
            }
            
            Console.log('Transaction completed successfully');
            return analysisRecord.Id;
            
        } catch (Exception e) {
            Database.rollback(sp);
            Console.log('ERROR: Transaction rolled back - ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to create complete analysis: ' + e.getMessage());
        }
    }
    
    @AuraEnabled(cacheable=true)
    public static Dynamic_Field_Analysis__c getAnalysisById(String analysisId) {
        try {
            if (String.isBlank(analysisId)) {
                throw new IllegalArgumentException('Analysis ID cannot be blank');
            }
            
            if (!Schema.sObjectType.Dynamic_Field_Analysis__c.isAccessible()) {
                throw new AuraHandledException('No access to Dynamic Field Analysis records');
            }
            
            List<Dynamic_Field_Analysis__c> records = [
                SELECT Id, Object_Name__c, Record_Type_Name__c, Record_Type_Id__c,
                       Selected_Fields__c, Field_Analysis_Details__c, Analysis_Date__c,
                       Total_Fields_Count__c
                FROM Dynamic_Field_Analysis__c
                WHERE Id = :analysisId
                LIMIT 1
            ];
            
            if (records.isEmpty()) {
                throw new AuraHandledException('Analysis record not found');
            }
            
            return records[0];
            
        } catch (Exception e) {
            Console.log('Error in AnalysisService.getAnalysisById: ' + e.getMessage());
            throw new AuraHandledException('Failed to retrieve analysis: ' + e.getMessage());
        }
    }
    
    @AuraEnabled(cacheable=true)
    public static List<Dynamic_Field_Analysis__c> getAllAnalyses() {
        try {
            if (!Schema.sObjectType.Dynamic_Field_Analysis__c.isAccessible()) {
                throw new AuraHandledException('No access to Dynamic Field Analysis records');
            }
            
            return [
                SELECT Id, Object_Name__c, Record_Type_Name__c, Analysis_Date__c,
                       Total_Fields_Count__c
                FROM Dynamic_Field_Analysis__c
                ORDER BY Analysis_Date__c DESC
                LIMIT 100
            ];
            
        } catch (Exception e) {
            Console.log('Error in AnalysisService.getAllAnalyses: ' + e.getMessage());
            throw new AuraHandledException('Failed to retrieve analyses: ' + e.getMessage());
        }
    }
}