public with sharing class InstructionManagerService {
    
    public class InstructionData {
        @AuraEnabled public String objectName;
        @AuraEnabled public List<String> availableFields;
        @AuraEnabled public List<InstructionStep> instructions;
        
        public InstructionData() {
            this.availableFields = new List<String>();
            this.instructions = new List<InstructionStep>();
        }
    }
    
    public class InstructionStep {
        @AuraEnabled public String id;
        @AuraEnabled public Integer stepNumber;
        @AuraEnabled public String text;
        @AuraEnabled public List<String> fields;
        
        public InstructionStep() {
            this.fields = new List<String>();
        }
        
        public InstructionStep(String id, Integer stepNumber, String text, List<String> fields) {
            this.id = id;
            this.stepNumber = stepNumber;
            this.text = text;
            this.fields = fields != null ? fields : new List<String>();
        }
    }
    
    // Retrieves all instructions and available fields for a specific analysis
    @AuraEnabled(cacheable=true)
    public static InstructionData getInstructionsForAnalysis(String analysisId) {
        InstructionData result = new InstructionData();
        
        try {
            if (String.isBlank(analysisId)) {
                throw new IllegalArgumentException('Analysis ID cannot be blank');
            }
            
            if (!Schema.sObjectType.Dynamic_Field_Analysis__c.isAccessible()) {
                throw new AuraHandledException('No access to Dynamic Field Analysis records');
            }
            
            // Get analysis record with selected fields
            List<Dynamic_Field_Analysis__c> analysisRecords = [
                SELECT Id, Object_Name__c, Selected_Fields__c
                FROM Dynamic_Field_Analysis__c 
                WHERE Id = :analysisId 
                LIMIT 1
            ];
            
            if (analysisRecords.isEmpty()) {
                throw new AuraHandledException('Field analysis record not found');
            }
            
            Dynamic_Field_Analysis__c analysis = analysisRecords[0];
            result.objectName = analysis.Object_Name__c;
            
            // Parse comma-separated fields into list
            if (String.isNotBlank(analysis.Selected_Fields__c)) {
                String[] fieldArray = analysis.Selected_Fields__c.split(',');
                for (String field : fieldArray) {
                    String fieldName = field.trim();
                    if (String.isNotBlank(fieldName)) {
                        result.availableFields.add(fieldName);
                    }
                }
            }
            
            // Get active instructions for this analysis
            if (Schema.sObjectType.Dynamic_Field_Instructions__c.isAccessible()) {
                List<Dynamic_Field_Instructions__c> instructionRecords = [
                    SELECT Id, Step_Number__c, Name, Related_Fields__c
                    FROM Dynamic_Field_Instructions__c
                    WHERE Field_Analysis__c = :analysisId
                    AND Is_Active__c = true
                    ORDER BY Step_Number__c ASC
                ];
                
                for (Dynamic_Field_Instructions__c record : instructionRecords) {
                    List<String> stepFields = new List<String>();
                    
                    // Parse related fields for this step
                    if (String.isNotBlank(record.Related_Fields__c)) {
                        String[] relatedFieldArray = record.Related_Fields__c.split(',');
                        for (String field : relatedFieldArray) {
                            String fieldName = field.trim();
                            if (String.isNotBlank(fieldName)) {
                                stepFields.add(fieldName);
                            }
                        }
                    }
                    
                    result.instructions.add(new InstructionStep(
                        record.Id,
                        Integer.valueOf(record.Step_Number__c),
                        record.Name,
                        stepFields
                    ));
                }
            }
            
        } catch (Exception e) {
            throw new AuraHandledException('Failed to retrieve instructions: ' + e.getMessage());
        }
        
        return result;
    }
}