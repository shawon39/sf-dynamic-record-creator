public with sharing class AnalysisService {
    
    // Creates a new field analysis with JSON structure including sections/instructions
    @AuraEnabled
    public static String createCompleteAnalysisWithJSON(String objectName, String recordTypeName, String recordTypeId,
                                              List<String> selectedFields, List<InstructionData> sections, String formName) {
        Savepoint sp = Database.setSavepoint();
        
        try {
            if (String.isBlank(objectName)) {
                throw new IllegalArgumentException('Object name cannot be blank');
            }
            
            if (selectedFields == null || selectedFields.isEmpty()) {
                throw new IllegalArgumentException('Selected fields cannot be empty');
            }
            
            // Check user has create permission for analysis records
            if (!Schema.sObjectType.Dynamic_Field_Analysis__c.isCreateable()) {
                throw new AuraHandledException('No permission to create Dynamic Field Analysis records');
            }
            
            // Check user has create permission for instruction records if sections provided
            if (sections != null && !sections.isEmpty() && 
                !Schema.sObjectType.Dynamic_Field_Instructions__c.isCreateable()) {
                throw new AuraHandledException('No permission to create Dynamic Field Instructions records');
            }
            
            // Generate JSON report with field metadata
            FieldService.FieldAnalysisResult analysisResult = FieldService.analyzeFieldsAndGenerateJSONReport(
                objectName, recordTypeName, recordTypeId, selectedFields, sections);
            
            // Create the parent analysis record
            Dynamic_Field_Analysis__c analysisRecord = new Dynamic_Field_Analysis__c();
            analysisRecord.Name = String.isNotBlank(formName) ? formName.trim() : objectName + ' Form - ' + DateTime.now().format('yyyy-MM-dd HH:mm');
            analysisRecord.Object_Name__c = objectName;
            analysisRecord.Record_Type_Name__c = recordTypeName;
            analysisRecord.Record_Type_Id__c = recordTypeId;
            analysisRecord.Selected_Fields__c = String.join(selectedFields, ', ');
            analysisRecord.Field_Analysis_Details__c = analysisResult.analysisReport;
            analysisRecord.Analysis_Date__c = DateTime.now();
            analysisRecord.Total_Fields_Count__c = selectedFields.size();
            
            insert analysisRecord;
            
            // Create child instruction records for each section
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
            System.debug('ERROR: Failed to create analysis - ' + e.getMessage());
            throw new AuraHandledException('Failed to create complete analysis with JSON: ' + e.getMessage());
        }
    }
    
    // Updates an existing field analysis and replaces all related instructions
    @AuraEnabled
    public static String updateCompleteAnalysisWithJSON(String analysisId, String objectName, String recordTypeName, String recordTypeId,
                                              List<String> selectedFields, List<InstructionData> sections, String formName) {
        Savepoint sp = Database.setSavepoint();
        
        try {
            if (String.isBlank(analysisId)) {
                throw new IllegalArgumentException('Analysis ID cannot be blank');
            }
            
            if (String.isBlank(objectName)) {
                throw new IllegalArgumentException('Object name cannot be blank');
            }
            
            if (selectedFields == null || selectedFields.isEmpty()) {
                throw new IllegalArgumentException('Selected fields cannot be empty');
            }
            
            // Check user has update permission
            if (!Schema.sObjectType.Dynamic_Field_Analysis__c.isUpdateable()) {
                throw new AuraHandledException('No permission to update Dynamic Field Analysis records');
            }
            
            // Check user has delete and create permission for instructions if sections provided
            if (sections != null && !sections.isEmpty()) {
                if (!Schema.sObjectType.Dynamic_Field_Instructions__c.isDeletable()) {
                    throw new AuraHandledException('No permission to delete Dynamic Field Instructions records');
                }
                if (!Schema.sObjectType.Dynamic_Field_Instructions__c.isCreateable()) {
                    throw new AuraHandledException('No permission to create Dynamic Field Instructions records');
                }
            }
            
            // Verify analysis record exists
            List<Dynamic_Field_Analysis__c> existingRecords = [
                SELECT Id, Name, Object_Name__c 
                FROM Dynamic_Field_Analysis__c 
                WHERE Id = :analysisId 
                LIMIT 1
            ];
            
            if (existingRecords.isEmpty()) {
                throw new AuraHandledException('Analysis record not found');
            }
            
            // Generate updated JSON report
            FieldService.FieldAnalysisResult analysisResult = FieldService.analyzeFieldsAndGenerateJSONReport(
                objectName, recordTypeName, recordTypeId, selectedFields, sections);
            
            // Update the analysis record with new data
            Dynamic_Field_Analysis__c analysisRecord = existingRecords[0];
            analysisRecord.Name = String.isNotBlank(formName) ? formName.trim() : objectName + ' Form - ' + DateTime.now().format('yyyy-MM-dd HH:mm');
            analysisRecord.Object_Name__c = objectName;
            analysisRecord.Record_Type_Name__c = recordTypeName;
            analysisRecord.Record_Type_Id__c = recordTypeId;
            analysisRecord.Selected_Fields__c = String.join(selectedFields, ', ');
            analysisRecord.Field_Analysis_Details__c = analysisResult.analysisReport;
            analysisRecord.Analysis_Date__c = DateTime.now();
            analysisRecord.Total_Fields_Count__c = selectedFields.size();
            
            update analysisRecord;
            
            // Delete existing instructions to replace with new ones
            List<Dynamic_Field_Instructions__c> existingInstructions = [
                SELECT Id 
                FROM Dynamic_Field_Instructions__c 
                WHERE Field_Analysis__c = :analysisId
            ];
            
            if (!existingInstructions.isEmpty()) {
                delete existingInstructions;
            }
            
            // Create new instruction records
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
            System.debug('ERROR: Failed to update analysis - ' + e.getMessage());
            throw new AuraHandledException('Failed to update complete analysis with JSON: ' + e.getMessage());
        }
    }
    
    // Retrieves a single analysis record by ID with all details
    @AuraEnabled(cacheable=false)
    public static Dynamic_Field_Analysis__c getAnalysisById(String analysisId) {
        try {
            if (String.isBlank(analysisId)) {
                throw new IllegalArgumentException('Analysis ID cannot be blank');
            }
            
            if (!Schema.sObjectType.Dynamic_Field_Analysis__c.isAccessible()) {
                throw new AuraHandledException('No access to Dynamic Field Analysis records');
            }
            
            List<Dynamic_Field_Analysis__c> records = [
                SELECT Id, Name, Object_Name__c, Record_Type_Name__c, Record_Type_Id__c,
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
            throw new AuraHandledException('Failed to retrieve analysis: ' + e.getMessage());
        }
    }
    
    // Helper method to create an instruction record from section data
    private static Dynamic_Field_Instructions__c createInstructionRecord(InstructionData section, Id analysisId) {
        // Skip invalid sections
        if (String.isBlank(section.text) || section.stepNumber == null) {
            return null;
        }
        
        Dynamic_Field_Instructions__c instructionRecord = new Dynamic_Field_Instructions__c();
        instructionRecord.Field_Analysis__c = analysisId;
        instructionRecord.Step_Number__c = section.stepNumber;
        instructionRecord.Name = section.text.trim();
        instructionRecord.Is_Active__c = true;
        
        // Store comma-separated list of related fields
        if (section.fields != null && !section.fields.isEmpty()) {
            instructionRecord.Related_Fields__c = String.join(section.fields, ', ');
        } else {
            instructionRecord.Related_Fields__c = '';
        }
        
        return instructionRecord;
    }
}