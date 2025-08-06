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
    
    public class InstructionToSave {
        @AuraEnabled public String id;
        @AuraEnabled public String analysisId;
        @AuraEnabled public Integer stepNumber;
        @AuraEnabled public String text;
        @AuraEnabled public List<String> fields;
    }
    
    @AuraEnabled(cacheable=true)
    public static InstructionData getInstructionsForAnalysis(String analysisId) {
        InstructionData result = new InstructionData();
        
        try {
            Console.log('getInstructionsForAnalysis: Starting for analysisId: ' + analysisId);
            
            if (String.isBlank(analysisId)) {
                throw new IllegalArgumentException('Analysis ID cannot be blank');
            }
            
            // Check permissions
            if (!Schema.sObjectType.Dynamic_Field_Analysis__c.isAccessible()) {
                throw new AuraHandledException('No access to Dynamic Field Analysis records');
            }
            
            // Get the field analysis record
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
            
            // Parse available fields
            if (String.isNotBlank(analysis.Selected_Fields__c)) {
                String[] fieldArray = analysis.Selected_Fields__c.split(',');
                for (String field : fieldArray) {
                    String fieldName = field.trim();
                    if (String.isNotBlank(fieldName)) {
                        result.availableFields.add(fieldName);
                    }
                }
            }
            
            Console.log('getInstructionsForAnalysis: Found ' + result.availableFields.size() + ' available fields');
            
            // Get existing instructions
            if (Schema.sObjectType.Dynamic_Field_Instructions__c.isAccessible()) {
                List<Dynamic_Field_Instructions__c> instructionRecords = [
                    SELECT Id, Step_Number__c, Instruction_Text__c, Related_Fields__c
                    FROM Dynamic_Field_Instructions__c
                    WHERE Field_Analysis__c = :analysisId
                    AND Is_Active__c = true
                    ORDER BY Step_Number__c ASC
                ];
                
                Console.log('getInstructionsForAnalysis: Found ' + instructionRecords.size() + ' instruction records');
                
                for (Dynamic_Field_Instructions__c record : instructionRecords) {
                    List<String> stepFields = new List<String>();
                    
                    // Parse related fields
                    if (String.isNotBlank(record.Related_Fields__c)) {
                        String[] fieldArray = record.Related_Fields__c.split(',');
                        for (String field : fieldArray) {
                            String fieldName = field.trim();
                            if (String.isNotBlank(fieldName)) {
                                stepFields.add(fieldName);
                            }
                        }
                    }
                    
                    result.instructions.add(new InstructionStep(
                        record.Id,
                        record.Step_Number__c != null ? record.Step_Number__c.intValue() : 0,
                        record.Instruction_Text__c != null ? record.Instruction_Text__c : '',
                        stepFields
                    ));
                }
            }
            
            Console.log('getInstructionsForAnalysis: Returning data with ' + result.instructions.size() + ' instructions');
            
        } catch (Exception e) {
            Console.log('Error in getInstructionsForAnalysis: ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to retrieve instructions: ' + e.getMessage());
        }
        
        return result;
    }
    
    @AuraEnabled
    public static String saveInstructions(String analysisId, List<InstructionToSave> instructions) {
        try {
            Console.log('saveInstructions: Starting for analysisId: ' + analysisId);
            Console.log('saveInstructions: Received ' + (instructions != null ? instructions.size() : 0) + ' instructions');
            
            if (String.isBlank(analysisId)) {
                throw new IllegalArgumentException('Analysis ID cannot be blank');
            }
            
            if (instructions == null) {
                instructions = new List<InstructionToSave>();
            }
            
            // Check permissions
            if (!Schema.sObjectType.Dynamic_Field_Instructions__c.isCreateable() || 
                !Schema.sObjectType.Dynamic_Field_Instructions__c.isUpdateable()) {
                throw new AuraHandledException('No permission to save Dynamic Field Instructions records');
            }
            
            List<Dynamic_Field_Instructions__c> recordsToUpsert = new List<Dynamic_Field_Instructions__c>();
            
            for (InstructionToSave instruction : instructions) {
                Dynamic_Field_Instructions__c record = new Dynamic_Field_Instructions__c();
                
                // Set ID for existing records
                if (String.isNotBlank(instruction.id) && !instruction.id.startsWith('temp_')) {
                    record.Id = instruction.id;
                }
                
                record.Field_Analysis__c = analysisId;
                record.Step_Number__c = instruction.stepNumber;
                record.Instruction_Text__c = instruction.text;
                record.Is_Active__c = true;
                
                // Convert field list to comma-separated string
                if (instruction.fields != null && !instruction.fields.isEmpty()) {
                    record.Related_Fields__c = String.join(instruction.fields, ', ');
                } else {
                    record.Related_Fields__c = '';
                }
                
                recordsToUpsert.add(record);
            }
            
            if (!recordsToUpsert.isEmpty()) {
                upsert recordsToUpsert;
                Console.log('saveInstructions: Successfully upserted ' + recordsToUpsert.size() + ' instruction records');
            }
            
            return 'Successfully saved ' + recordsToUpsert.size() + ' instruction records';
            
        } catch (Exception e) {
            Console.log('Error in saveInstructions: ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to save instructions: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static String deleteInstruction(String instructionId) {
        try {
            Console.log('deleteInstruction: Starting for instructionId: ' + instructionId);
            
            if (String.isBlank(instructionId)) {
                throw new IllegalArgumentException('Instruction ID cannot be blank');
            }
            
            // Check permissions
            if (!Schema.sObjectType.Dynamic_Field_Instructions__c.isDeletable()) {
                throw new AuraHandledException('No permission to delete Dynamic Field Instructions records');
            }
            
            List<Dynamic_Field_Instructions__c> recordsToDelete = [
                SELECT Id 
                FROM Dynamic_Field_Instructions__c 
                WHERE Id = :instructionId 
                LIMIT 1
            ];
            
            if (!recordsToDelete.isEmpty()) {
                delete recordsToDelete;
                Console.log('deleteInstruction: Successfully deleted instruction record');
                return 'Instruction deleted successfully';
            } else {
                throw new AuraHandledException('Instruction record not found');
            }
            
        } catch (Exception e) {
            Console.log('Error in deleteInstruction: ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to delete instruction: ' + e.getMessage());
        }
    }
    
    @AuraEnabled(cacheable=true)
    public static List<DynamicObjectService.InstructionStep> getInstructionsForObject(String objectName, String analysisId) {
        List<DynamicObjectService.InstructionStep> instructions = new List<DynamicObjectService.InstructionStep>();
        
        try {
            Console.log('getInstructionsForObject: Getting instructions for object: ' + objectName + ', analysisId: ' + analysisId);
            
            if (String.isBlank(objectName) && String.isBlank(analysisId)) {
                return instructions;
            }
            
            // Check permissions
            if (!Schema.sObjectType.Dynamic_Field_Instructions__c.isAccessible()) {
                Console.log('getInstructionsForObject: No access to Dynamic Field Instructions, returning empty list');
                return instructions;
            }
            
            List<Dynamic_Field_Instructions__c> instructionRecords = new List<Dynamic_Field_Instructions__c>();
            
            if (String.isNotBlank(analysisId)) {
                instructionRecords = [
                    SELECT Step_Number__c, Instruction_Text__c, Related_Fields__c
                    FROM Dynamic_Field_Instructions__c
                    WHERE Field_Analysis__c = :analysisId AND Is_Active__c = true
                    ORDER BY Step_Number__c ASC
                ];
            } else if (String.isNotBlank(objectName)) {
                instructionRecords = [
                    SELECT Step_Number__c, Instruction_Text__c, Related_Fields__c
                    FROM Dynamic_Field_Instructions__c
                    WHERE Object_Name__c = :objectName AND Is_Active__c = true
                    ORDER BY Step_Number__c ASC
                ];
            }
            
            Console.log('getInstructionsForObject: Found ' + instructionRecords.size() + ' instruction records');
            
            for (Dynamic_Field_Instructions__c record : instructionRecords) {
                List<String> stepFields = new List<String>();
                
                // Parse related fields
                if (String.isNotBlank(record.Related_Fields__c)) {
                    String[] fieldArray = record.Related_Fields__c.split(',');
                    for (String field : fieldArray) {
                        String fieldName = field.trim();
                        if (String.isNotBlank(fieldName)) {
                            stepFields.add(fieldName);
                        }
                    }
                }
                
                instructions.add(new DynamicObjectService.InstructionStep(
                    record.Step_Number__c != null ? record.Step_Number__c.intValue() : 0,
                    record.Instruction_Text__c != null ? record.Instruction_Text__c : '',
                    stepFields
                ));
            }
            
            Console.log('getInstructionsForObject: Returning ' + instructions.size() + ' instructions');
            
        } catch (Exception e) {
            Console.log('Error in getInstructionsForObject: ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            // Don't throw exception for instructions, just return empty list
            return new List<DynamicObjectService.InstructionStep>();
        }
        
        return instructions;
    }
}