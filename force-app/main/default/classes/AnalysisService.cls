public with sharing class AnalysisService {
    
    @AuraEnabled
    public static String createCompleteAnalysisWithJSON(String objectName, String recordTypeName, String recordTypeId,
                                              List<String> selectedFields, List<InstructionData> sections, String formName) {
        Savepoint sp = Database.setSavepoint();
        
        try {
            Console.log('AnalysisService.createCompleteAnalysisWithJSON: Processing ' + selectedFields.size() + ' fields for ' + objectName);
            
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
            
            if (sections != null && !sections.isEmpty() && 
                !Schema.sObjectType.Dynamic_Field_Instructions__c.isCreateable()) {
                throw new AuraHandledException('No permission to create Dynamic Field Instructions records');
            }
            
            // Generate field analysis with JSON format
            FieldService.FieldAnalysisResult analysisResult = FieldService.analyzeFieldsAndGenerateJSONReport(
                objectName, recordTypeName, recordTypeId, selectedFields, sections);
            
            // Create parent record with JSON analysis details
            Dynamic_Field_Analysis__c analysisRecord = new Dynamic_Field_Analysis__c();
            analysisRecord.Name = String.isNotBlank(formName) ? formName.trim() : objectName + ' Form - ' + DateTime.now().format('yyyy-MM-dd HH:mm');
            analysisRecord.Object_Name__c = objectName;
            analysisRecord.Record_Type_Name__c = recordTypeName;
            analysisRecord.Record_Type_Id__c = recordTypeId;
            analysisRecord.Selected_Fields__c = String.join(selectedFields, ', ');
            analysisRecord.Field_Analysis_Details__c = analysisResult.analysisReport; // JSON format
            analysisRecord.Analysis_Date__c = DateTime.now();
            analysisRecord.Total_Fields_Count__c = selectedFields.size();
            
            insert analysisRecord;
            
            // Create child instruction records (sections)
            if (sections != null && !sections.isEmpty()) {
                List<Dynamic_Field_Instructions__c> instructionRecords = new List<Dynamic_Field_Instructions__c>();
                
                for (InstructionData section : sections) {
                    Dynamic_Field_Instructions__c instructionRecord = createInstructionRecord(section, analysisRecord.Id);
                    if (instructionRecord != null) {
                        instructionRecords.add(instructionRecord);
                    }
                }
                
                if (!instructionRecords.isEmpty()) {
                    insert instructionRecords;
                }
            }
            
            return analysisRecord.Id;
            
        } catch (Exception e) {
            Database.rollback(sp);
            Console.log('ERROR: Transaction rolled back - ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to create complete analysis with JSON: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static String createCompleteAnalysis(String objectName, String recordTypeName, String recordTypeId,
                                              List<String> selectedFields, String analysisDetails,
                                              List<InstructionData> instructions, String formName) {
        // Legacy method - now internally uses JSON method for consistency
        return createCompleteAnalysisWithJSON(objectName, recordTypeName, recordTypeId, selectedFields, instructions, formName);
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
    
    private static Dynamic_Field_Instructions__c createInstructionRecord(InstructionData section, Id analysisId) {
        // Validate section data
        if (String.isBlank(section.text) || section.stepNumber == null) {
            Console.log('Skipping invalid section: ' + JSON.serialize(section));
            return null;
        }
        
        Dynamic_Field_Instructions__c instructionRecord = new Dynamic_Field_Instructions__c();
        instructionRecord.Field_Analysis__c = analysisId;
        instructionRecord.Step_Number__c = section.stepNumber;
        instructionRecord.Name = section.text.trim(); // Section Name
        instructionRecord.Is_Active__c = true;
        
        // Set related fields for this section
        if (section.fields != null && !section.fields.isEmpty()) {
            instructionRecord.Related_Fields__c = String.join(section.fields, ', ');
        } else {
            instructionRecord.Related_Fields__c = '';
        }
        
        return instructionRecord;
    }
}